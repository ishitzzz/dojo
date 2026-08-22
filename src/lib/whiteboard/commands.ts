/**
 * Typed draw command schema for the whiteboard rendering core.
 *
 * Pipeline (ported from ai-whiteboard):
 * 1. Director (LLM) -> DrawCommand[] JSON
 * 2. CanvasInterceptor -> flattens paths -> RawCoordinate[]
 * 3. Kinematic Engine -> velocity / curvature / overshoots -> KinematicCoordinate[]
 * 4. Renderer -> progressive canvas drawing
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Canvas API operations that can appear inside a path command.
 * Mirrors CanvasCommandType from the reference engine.
 */
export type CanvasCommandType =
  | "moveTo"
  | "lineTo"
  | "bezierCurveTo"
  | "quadraticCurveTo"
  | "beginPath"
  | "closePath"
  | "stroke"
  | "fill";

/**
 * A single segment of a path command. Control points are optional so the
 * parser can coerce degenerate curves into lines instead of rejecting them.
 */
export interface PathSegment {
  command: CanvasCommandType;
  x?: number;
  y?: number;
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
}

export interface StrokeCommand {
  type: "stroke";
  points: Point[];
  color: string;
  width: number;
}

export interface PathCommand {
  type: "path";
  ops: PathSegment[];
  color: string;
  width: number;
}

export interface TextCommand {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

export interface EraseCommand {
  type: "erase";
  x: number;
  y: number;
  radius: number;
}

export interface ClearCommand {
  type: "clear";
}

export type DrawCommand =
  | StrokeCommand
  | PathCommand
  | TextCommand
  | EraseCommand
  | ClearCommand;

// ---------------------------------------------------------------------------
// Engine payloads (ported from reference types/engine.ts)
// ---------------------------------------------------------------------------

/**
 * THE EXTRACTOR PAYLOAD
 * A raw coordinate extracted from flattened draw commands.
 * These are the mathematical anchor points before any kinematic processing.
 */
export interface RawCoordinate {
  // Absolute position
  x: number;
  y: number;

  // The canvas operation that generated this point
  commandType: CanvasCommandType;

  // Optional control points for bezier/quadratic curves
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;

  // High-resolution timestamp of when this point was emitted by the extractor
  timestamp: number;
}

/**
 * THE KINEMATIC ENGINE PAYLOAD
 * A processed coordinate with movement physics: velocity, curvature,
 * overshoots, and organic imperfections.
 */
export interface KinematicCoordinate {
  // Base coordinates (may be slightly perturbed for organic feel)
  x: number;
  y: number;

  // Instantaneous velocity via the Two-Thirds Power Law:
  // V = k * R^(1/3) where R is the radius of curvature.
  velocity: number;

  // Local curvature at this specific point.
  curvature: number;

  // Calculated overshoot displacement for sharp corners,
  // mimicking human momentum and wrist flick.
  overshootX: number;
  overshootY: number;

  // Intended pressure/thickness at this point (inversely tied to velocity).
  pressure: number;
}

/** A continuous stroke of processed points ready for the Renderer. */
export interface Stroke {
  id: string;
  color: string;
  points: KinematicCoordinate[];
  isComplete: boolean;
}

export interface Scene {
  title: string;
  narration: string;
  drawCommands: DrawCommand[];
}
