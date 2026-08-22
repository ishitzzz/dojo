/**
 * Ported from reference CanvasInterceptor.ts.
 *
 * The reference executed raw LLM-generated JavaScript against a mock canvas
 * via dynamic code evaluation. That is gone: draw commands now
 * arrive as typed JSON (DrawCommand) and are translated through an explicit
 * dispatcher below. Everything else — curve flattening into discrete
 * RawCoordinate samples — is kept faithful to the original.
 */

import type {
  CanvasCommandType,
  DrawCommand,
  PathCommand,
  PathSegment,
  RawCoordinate,
  StrokeCommand,
} from "./commands";

/** Logical canvas coordinate space all draw commands live in. */
export const LOGICAL_WIDTH = 800;
export const LOGICAL_HEIGHT = 500;

/** Curve flattening resolution (matches the reference interceptor). */
const CURVE_STEPS = 15;

export const DEFAULT_STROKE_COLOR = "#00ffcc";
export const DEFAULT_STROKE_WIDTH = 3;
export const DEFAULT_TEXT_COLOR = "#f5f5f5";
export const DEFAULT_TEXT_SIZE = 24;

const PATH_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "beginPath",
  "closePath",
  "stroke",
  "fill",
]);

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * A lightweight recorder for Canvas 2D path operations.
 * Flattens curves into discrete intervals so the Kinematic Engine has
 * continuous points to calculate velocity on.
 */
export class CanvasInterceptor {
  private path: RawCoordinate[] = [];

  // Track the pen's current position to calculate curves
  private currentX = 0;
  private currentY = 0;

  // --- No-Op State & Styling Methods ---
  beginPath(): void {}
  closePath(): void {}
  stroke(): void {}
  fill(): void {}

  // --- Core Path Generation Methods ---

  moveTo(x: number, y: number): void {
    this.currentX = x;
    this.currentY = y;
    this.path.push({ x, y, commandType: "moveTo", timestamp: now() });
  }

  lineTo(x: number, y: number): void {
    this.currentX = x;
    this.currentY = y;
    this.path.push({ x, y, commandType: "lineTo", timestamp: now() });
  }

  /**
   * Curve Flattening
   * Slices the cubic Bezier curve into discrete intervals (15 steps)
   * so the Kinematic Engine has continuous points to calculate velocity on.
   */
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void {
    const steps = CURVE_STEPS;
    const p0x = this.currentX;
    const p0y = this.currentY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const tSq = t * t;
      const tCu = tSq * t;

      const invT = 1 - t;
      const invTSq = invT * invT;
      const invTCu = invTSq * invT;

      // Cubic Bezier mathematical interpolation
      const bx = invTCu * p0x + 3 * invTSq * t * cp1x + 3 * invT * tSq * cp2x + tCu * x;
      const by = invTCu * p0y + 3 * invTSq * t * cp1y + 3 * invT * tSq * cp2y + tCu * y;

      this.path.push({
        x: bx,
        y: by,
        commandType: "bezierCurveTo",
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        timestamp: now(),
      });
    }

    this.currentX = x;
    this.currentY = y;
  }

  /** Slices a quadratic Bezier curve into discrete intervals. */
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    const steps = CURVE_STEPS;
    const p0x = this.currentX;
    const p0y = this.currentY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const invT = 1 - t;

      const bx = invT * invT * p0x + 2 * invT * t * cpx + t * t * x;
      const by = invT * invT * p0y + 2 * invT * t * cpy + t * t * y;

      this.path.push({
        x: bx,
        y: by,
        commandType: "quadraticCurveTo",
        timestamp: now(),
      });
    }

    this.currentX = x;
    this.currentY = y;
  }

  /**
   * Explicit typed dispatcher — the safe replacement for the reference's
   * dynamically evaluated code execution. Stroke commands become
   * moveTo/lineTo sequences; path commands replay their segments.
   */
  dispatch(command: StrokeCommand | PathCommand): void {
    switch (command.type) {
      case "stroke": {
        command.points.forEach((p, i) =>
          i === 0 ? this.moveTo(p.x, p.y) : this.lineTo(p.x, p.y)
        );
        break;
      }
      case "path": {
        for (const op of command.ops) {
          this.dispatchSegment(op);
        }
        break;
      }
    }
  }

  private dispatchSegment(op: PathSegment): void {
    const x = op.x;
    const y = op.y;
    switch (op.command) {
      case "moveTo":
        if (x !== undefined && y !== undefined) this.moveTo(x, y);
        break;
      case "lineTo":
        if (x !== undefined && y !== undefined) this.lineTo(x, y);
        break;
      case "bezierCurveTo":
        if (x !== undefined && y !== undefined) {
          // Missing control points degrade to the endpoint (straight line)
          this.bezierCurveTo(
            op.cp1x ?? x,
            op.cp1y ?? y,
            op.cp2x ?? x,
            op.cp2y ?? y,
            x,
            y
          );
        }
        break;
      case "quadraticCurveTo":
        if (x !== undefined && y !== undefined) {
          this.quadraticCurveTo(op.cp1x ?? x, op.cp1y ?? y, x, y);
        }
        break;
      case "beginPath":
        this.beginPath();
        break;
      case "closePath":
        this.closePath();
        break;
      case "stroke":
        this.stroke();
        break;
      case "fill":
        this.fill();
        break;
    }
  }

  reset(): void {
    this.path = [];
    this.currentX = 0;
    this.currentY = 0;
  }

  getCoordinates(): RawCoordinate[] {
    return this.path;
  }
}

// ---------------------------------------------------------------------------
// Scene compilation: DrawCommand[] -> renderable stages
// ---------------------------------------------------------------------------

export type WhiteboardStage =
  | { kind: "clear" }
  | { kind: "erase"; x: number; y: number; radius: number }
  | { kind: "text"; x: number; y: number; text: string; color: string; size: number }
  | { kind: "stroke"; color: string; width: number; points: RawCoordinate[] };

/**
 * Translates typed draw commands into an ordered list of render stages.
 * Stroke-like commands are flattened into RawCoordinate samples (one stage
 * per command, preserving per-command color/width); text/erase/clear become
 * discrete stages the renderer applies instantaneously.
 */
export function compileDrawCommands(commands: DrawCommand[]): WhiteboardStage[] {
  const stages: WhiteboardStage[] = [];
  const interceptor = new CanvasInterceptor();

  for (const cmd of commands) {
    switch (cmd.type) {
      case "stroke":
      case "path": {
        interceptor.reset();
        interceptor.dispatch(cmd);
        const points = interceptor.getCoordinates();
        if (points.length > 1) {
          stages.push({
            kind: "stroke",
            color: cmd.color,
            width: cmd.width,
            points,
          });
        }
        break;
      }
      case "text":
        stages.push({
          kind: "text",
          x: cmd.x,
          y: cmd.y,
          text: cmd.text,
          color: cmd.color,
          size: cmd.size,
        });
        break;
      case "erase":
        stages.push({ kind: "erase", x: cmd.x, y: cmd.y, radius: cmd.radius });
        break;
      case "clear":
        stages.push({ kind: "clear" });
        break;
    }
  }

  return stages;
}

// ---------------------------------------------------------------------------
// LLM output coercion
// ---------------------------------------------------------------------------

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampX(value: number): number {
  return clamp(value, 0, LOGICAL_WIDTH);
}

function clampY(value: number): number {
  return clamp(value, 0, LOGICAL_HEIGHT);
}

function coerceColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePoint(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null;
  const x = coerceNumber(value.x);
  const y = coerceNumber(value.y);
  if (x === null || y === null) return null;
  return { x: clampX(x), y: clampY(y) };
}

function parseStrokePoints(value: unknown): { x: number; y: number }[] | null {
  if (!Array.isArray(value)) return null;
  const points: { x: number; y: number }[] = [];
  for (const raw of value) {
    const p = parsePoint(raw);
    if (!p) return null;
    points.push(p);
  }
  return points.length >= 2 ? points : null;
}

function parsePathOps(value: unknown): PathSegment[] | null {
  if (!Array.isArray(value)) return null;
  const ops: PathSegment[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const command = raw.command;
    if (typeof command !== "string" || !PATH_ONLY_COMMANDS.has(command)) return null;
    const op: PathSegment = { command: command as CanvasCommandType };
    const x = coerceNumber(raw.x);
    const y = coerceNumber(raw.y);
    if (x !== null) op.x = clampX(x);
    if (y !== null) op.y = clampY(y);
    const cp1x = coerceNumber(raw.cp1x);
    const cp1y = coerceNumber(raw.cp1y);
    const cp2x = coerceNumber(raw.cp2x);
    const cp2y = coerceNumber(raw.cp2y);
    if (cp1x !== null) op.cp1x = clampX(cp1x);
    if (cp1y !== null) op.cp1y = clampY(cp1y);
    if (cp2x !== null) op.cp2x = clampX(cp2x);
    if (cp2y !== null) op.cp2y = clampY(cp2y);
    ops.push(op);
  }
  return ops;
}

/**
 * Validates and coerces a single untrusted draw-command payload into a
 * typed DrawCommand; returns null when the payload is malformed.
 */
export function parseDrawCommand(raw: unknown): DrawCommand | null {
  if (!isRecord(raw)) return null;

  switch (raw.type) {
    case "stroke": {
      const points = parseStrokePoints(raw.points);
      if (!points) return null;
      const width = coerceNumber(raw.width);
      return {
        type: "stroke",
        points,
        color: coerceColor(raw.color, DEFAULT_STROKE_COLOR),
        width: width !== null ? clamp(width, 0.5, 40) : DEFAULT_STROKE_WIDTH,
      };
    }
    case "path": {
      const ops = parsePathOps(raw.ops);
      if (!ops || ops.length === 0) return null;
      const width = coerceNumber(raw.width);
      return {
        type: "path",
        ops,
        color: coerceColor(raw.color, DEFAULT_STROKE_COLOR),
        width: width !== null ? clamp(width, 0.5, 40) : DEFAULT_STROKE_WIDTH,
      };
    }
    case "text": {
      const x = coerceNumber(raw.x);
      const y = coerceNumber(raw.y);
      if (x === null || y === null) return null;
      if (typeof raw.text !== "string" || raw.text.length === 0) return null;
      const size = coerceNumber(raw.size);
      return {
        type: "text",
        x: clampX(x),
        y: clampY(y),
        text: raw.text,
        color: coerceColor(raw.color, DEFAULT_TEXT_COLOR),
        size: size !== null ? clamp(size, 8, 120) : DEFAULT_TEXT_SIZE,
      };
    }
    case "erase": {
      const x = coerceNumber(raw.x);
      const y = coerceNumber(raw.y);
      const radius = coerceNumber(raw.radius);
      if (x === null || y === null || radius === null) return null;
      return {
        type: "erase",
        x: clampX(x),
        y: clampY(y),
        radius: clamp(radius, 1, 400),
      };
    }
    case "clear":
      return { type: "clear" };
    default:
      return null;
  }
}

/**
 * Safely coerces untrusted LLM JSON output into typed DrawCommands.
 * Accepts a bare array or an object wrapping one under `drawCommands`.
 * Invalid entries are rejected individually; invalid input yields [].
 */
export function parseDrawCommands(input: unknown): DrawCommand[] {
  let items: unknown[];
  if (Array.isArray(input)) {
    items = input;
  } else if (isRecord(input) && Array.isArray(input.drawCommands)) {
    items = input.drawCommands;
  } else {
    return [];
  }

  const commands: DrawCommand[] = [];
  for (const raw of items) {
    const parsed = parseDrawCommand(raw);
    if (parsed) commands.push(parsed);
  }
  return commands;
}
