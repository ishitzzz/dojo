"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KinematicCoordinate, Scene } from "@/lib/whiteboard/commands";
import {
  compileDrawCommands,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
} from "@/lib/whiteboard/canvasInterceptor";
import { applyHumanKinematics } from "@/lib/whiteboard/kinematicEngine";
import {
  CLEAR_DWELL_SECONDS,
  MAX_SCENE_SECONDS,
  MIN_SCENE_SECONDS,
  RENDER_FPS,
  TEXT_DWELL_SECONDS,
} from "@/lib/whiteboard/pacing";

interface WhiteboardRendererProps {
  scenes: Scene[];
  /** Playback pacing multiplier (1 = natural hand speed). Changes apply live. */
  speed?: number;
  /**
   * UX defect #1b: per-scene target duration in seconds (parallel to
   * `scenes`). Each scene scales its kinematics speed so its strokes
   * spread across clamp(hint, MIN_SCENE_SECONDS, MAX_SCENE_SECONDS);
   * any remainder after slowing becomes an end-of-scene hold on the
   * finished board. Absent hints fall back to an internal estimate.
   */
  durationHints?: number[];
  /** True pause barrier: freezes advancement and suppresses onSceneDone. */
  paused?: boolean;
  /**
   * When provided, replaces the internally computed "scene k / N" badge.
   * The player knows the FULL streamed total (from RESULT metadata) while
   * this component only sees the single active scene — without the
   * override it would wrongly display "scene 1 / 1".
   */
  sceneLabelOverride?: string;
  /** Fired when a scene finishes drawing (0-based index). */
  onSceneDone?: (index: number) => void;
  /** Fired once after the final scene completes. */
  onComplete?: () => void;
}

interface CompiledStroke {
  kind: "stroke";
  color: string;
  width: number;
  points: KinematicCoordinate[];
}

type CompiledStage =
  | { kind: "clear" }
  | { kind: "erase"; x: number; y: number; radius: number }
  | { kind: "text"; x: number; y: number; text: string; color: string; size: number }
  | CompiledStroke;

// Stages that stay visible on the board until cleared
type CommittedItem = Exclude<CompiledStage, { kind: "clear" }>;

interface CompiledScene {
  title: string;
  narration: string;
  stages: CompiledStage[];
  /**
   * End-of-scene hold (frames) guaranteeing the scene occupies its full
   * target window even when the kinematic floor (speed 0.1) can't stretch
   * sparse strokes far enough on their own.
   */
  holdFrames: number;
}

interface AnimState {
  sceneIdx: number;
  stageIdx: number;
  pointIdx: number;
  // Index of the last kinematic point painted onto the layer
  drawnIdx: number;
  // Fractional pixel budget accumulated between point advances
  progress: number;
  finished: boolean;
  committed: CommittedItem[];
  cursorX: number;
  cursorY: number;
  cursorVisible: boolean;
  // Pacing barriers: per-command text/erase/clear dwell and the
  // end-of-scene hold, both consumed one frame per tick.
  dwellFramesRemaining: number;
  holdFramesRemaining: number;
  // Guards the end-of-scene hold against re-arming every frame.
  sceneHoldDone: boolean;
}

function createAnimState(): AnimState {
  return {
    sceneIdx: 0,
    stageIdx: 0,
    pointIdx: 1,
    drawnIdx: 1,
    progress: 0,
    finished: false,
    committed: [],
    cursorX: 0,
    cursorY: 0,
    cursorVisible: false,
    dwellFramesRemaining: 0,
    holdFramesRemaining: 0,
    sceneHoldDone: false,
  };
}

const BOARD_BG = "#1e1e1e";

export default function WhiteboardRenderer({
  scenes,
  speed = 1,
  durationHints,
  paused = false,
  sceneLabelOverride,
  onSceneDone,
  onComplete,
}: WhiteboardRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<AnimState>(createAnimState());
  const [uiSceneIdx, setUiSceneIdx] = useState(0);
  const [uiDone, setUiDone] = useState(false);

  // Keep latest callbacks and pause state without restarting the animation
  // loop; the tick loop reads them fresh every frame.
  const onSceneDoneRef = useRef(onSceneDone);
  const onCompleteRef = useRef(onComplete);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onSceneDoneRef.current = onSceneDone;
    onCompleteRef.current = onComplete;
    pausedRef.current = paused;
  });

  // Recompiled when scenes OR speed OR durationHints change; animation
  // indexes survive speed changes because compilation preserves
  // stage/point structure.
  //
  // ── Per-scene duration math (UX defect #1b) ──────────────────────
  // 1. Kinematize every stroke at BASE speed 1 and measure its natural
  //    frame cost: the anim loop consumes `velocity` progress-units per
  //    frame and advances one point per full unit, so a point with
  //    velocity v costs 1/v frames. Summing 1/v over all non-zero
  //    velocity points gives exact natural stroke frames (the renderer's
  //    velocity scales linearly with the kinematic speed multiplier).
  // 2. Add per-command dwell: text stages hold TEXT_DWELL_SECONDS each,
  //    erase/clear hold CLEAR_DWELL_SECONDS (see pacing.ts).
  // 3. Target = clamp(durationHint ?? naturalSeconds, 7, 25) so every
  //    scene plays ≥7s and ≤~25s.
  // 4. Speed factor = naturalStrokeSeconds / (target − dwellSeconds):
  //    sparse scenes get factor < 1 (slow motion), dense ones > 1.
  //    Effective kinematic speed clamps to the engine range [0.1, 10].
  // 5. Whatever the floor clipping leaves of the window becomes
  //    holdFrames — the finished board lingers before onSceneDone.
  const compiledScenes = useMemo<CompiledScene[]>(
    () =>
      scenes.map((scene, sceneIdx) => {
        const stages = compileDrawCommands(scene.drawCommands);

        let strokeFramesBase = 0;
        let dwellSeconds = 0;
        const measured: CompiledStage[] = stages.map((stage) => {
          if (stage.kind === "stroke") {
            const points = applyHumanKinematics(stage.points, { speed: 1 });
            for (let i = 1; i < points.length; i++) {
              if (points[i].velocity > 0) strokeFramesBase += 1 / points[i].velocity;
            }
            return {
              kind: "stroke",
              color: stage.color,
              width: stage.width,
              points,
            };
          }
          dwellSeconds +=
            stage.kind === "text" ? TEXT_DWELL_SECONDS : CLEAR_DWELL_SECONDS;
          return stage;
        });

        const strokeSecondsBase = strokeFramesBase / RENDER_FPS;
        const naturalSeconds = strokeSecondsBase + dwellSeconds;
        const hint = durationHints?.[sceneIdx];
        const targetSeconds = Math.min(
          MAX_SCENE_SECONDS,
          Math.max(MIN_SCENE_SECONDS, hint ?? naturalSeconds)
        );

        // Spread strokes across the window minus dwell time; clamp the
        // resulting speed into the kinematic engine's supported range.
        const strokeTargetSeconds = Math.max(
          0.25,
          targetSeconds - dwellSeconds
        );
        const factor = strokeSecondsBase / strokeTargetSeconds;
        const effectiveSpeed = Math.min(
          10,
          Math.max(0.1, speed * (Number.isFinite(factor) ? factor : 1))
        );
        const predictedStrokeSeconds =
          speed > 0 ? strokeSecondsBase * (speed / effectiveSpeed) : strokeSecondsBase;
        const holdFrames = Math.max(
          0,
          Math.round(
            (targetSeconds - predictedStrokeSeconds - dwellSeconds) * RENDER_FPS
          )
        );

        return {
          title: scene.title,
          narration: scene.narration,
          holdFrames,
          stages: measured.map((stage): CompiledStage =>
            stage.kind === "stroke"
              ? {
                  kind: "stroke",
                  color: stage.color,
                  width: stage.width,
                  // Velocity scales exactly linearly with the kinematic
                  // speed multiplier (multiplied after pressure mapping),
                  // so rescaling the base-speed measurement reproduces
                  // applyHumanKinematics({ speed: effectiveSpeed }) without
                  // a second pass.
                  points: stage.points.map((p) => ({
                    ...p,
                    velocity: p.velocity * effectiveSpeed,
                  })),
                }
              : stage
          ),
        };
      }),
    [scenes, speed, durationHints]
  );

  // Reset UI state during render when the scene list identity changes
  // (sanctioned prop-derived reset pattern).
  const [prevScenes, setPrevScenes] = useState(scenes);
  if (prevScenes !== scenes) {
    setPrevScenes(scenes);
    setUiSceneIdx(0);
    setUiDone(false);
  }

  // Hard reset of animation state when the scene list changes (speed changes
  // intentionally do NOT restart playback).
  useEffect(() => {
    animRef.current = createAnimState();
  }, [scenes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = () => window.devicePixelRatio || 1;

    // Maps logical space (800x500) into device pixels, letterboxed.
    const applyLetterbox = (c: CanvasRenderingContext2D) => {
      const ratio = dpr();
      const cw = canvas.clientWidth || LOGICAL_WIDTH;
      const ch = canvas.clientHeight || LOGICAL_HEIGHT;
      const scale = Math.min(cw / LOGICAL_WIDTH, ch / LOGICAL_HEIGHT);
      const ox = (cw - LOGICAL_WIDTH * scale) / 2;
      const oy = (ch - LOGICAL_HEIGHT * scale) / 2;
      c.setTransform(scale * ratio, 0, 0, scale * ratio, ox * ratio, oy * ratio);
    };

    const drawStrokeRange = (
      c: CanvasRenderingContext2D,
      stage: CompiledStroke,
      fromIdx: number,
      toIdx: number
    ) => {
      const pts = stage.points;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.strokeStyle = stage.color;
      for (let i = Math.max(1, fromIdx); i <= toIdx && i < pts.length; i++) {
        const p1 = pts[i - 1];
        const p2 = pts[i];
        // Velocity 0 indicates a moveTo jump — no connecting segment
        if (p2.velocity === 0) continue;
        c.beginPath();
        // Apply overshoots so strokes visibly extend at sharp corners
        c.moveTo(p1.x + p1.overshootX, p1.y + p1.overshootY);
        c.lineTo(p2.x + p2.overshootX, p2.y + p2.overshootY);
        // Pressure drives line width: 0.3 (fast) -> 1.0 (slow)
        c.lineWidth = 1 + p2.pressure * 3;
        c.stroke();
      }
    };

    const drawStage = (c: CanvasRenderingContext2D, stage: CommittedItem) => {
      switch (stage.kind) {
        case "text": {
          c.fillStyle = stage.color;
          c.textBaseline = "top";
          c.font = `${stage.size}px "Segoe Print", "Marker Felt", "Comic Sans MS", cursive`;
          c.fillText(stage.text, stage.x, stage.y);
          break;
        }
        case "erase": {
          c.save();
          c.globalCompositeOperation = "destination-out";
          c.beginPath();
          c.arc(stage.x, stage.y, stage.radius, 0, Math.PI * 2);
          c.fill();
          c.restore();
          break;
        }
        case "stroke":
          drawStrokeRange(c, stage, 1, stage.points.length - 1);
          break;
      }
    };

    const repaintLayer = () => {
      const layer = layerRef.current;
      if (!layer) return;
      const lctx = layer.getContext("2d");
      if (!lctx) return;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
      applyLetterbox(lctx);
      const anim = animRef.current;
      for (const item of anim.committed) drawStage(lctx, item);
      // Repaint the partially drawn current stroke
      const scene = compiledScenes[anim.sceneIdx];
      const stage = scene?.stages[anim.stageIdx];
      if (scene && stage && stage.kind === "stroke" && anim.drawnIdx >= 1) {
        drawStrokeRange(
          lctx,
          stage,
          1,
          Math.min(anim.drawnIdx, stage.points.length - 1)
        );
      }
    };

    const layerCtx = (): CanvasRenderingContext2D | null =>
      layerRef.current?.getContext("2d") ?? null;

    const fitCanvas = (): void => {
      const ratio = dpr();
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw === 0 || ch === 0) return;
      const w = Math.max(1, Math.round(cw * ratio));
      const h = Math.max(1, Math.round(ch * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const ensureLayer = (): void => {
      if (!layerRef.current) layerRef.current = document.createElement("canvas");
      const layer = layerRef.current;
      if (layer.width !== canvas.width || layer.height !== canvas.height) {
        layer.width = canvas.width;
        layer.height = canvas.height;
        repaintLayer();
      }
    };

    const renderFrame = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = BOARD_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const layer = layerRef.current;
      if (layer) ctx.drawImage(layer, 0, 0);

      const anim = animRef.current;
      if (anim.cursorVisible) {
        applyLetterbox(ctx);
        // Ghost cursor (marker tip)
        ctx.beginPath();
        ctx.arc(anim.cursorX, anim.cursorY, 6, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
    };

    const finish = () => {
      const anim = animRef.current;
      if (anim.finished) return;
      anim.finished = true;
      anim.cursorVisible = false;
      setUiDone(true);
      onCompleteRef.current?.();
    };

    const advance = () => {
      const anim = animRef.current;
      while (!anim.finished) {
        // Pacing barriers (UX defect #1b): text/erase/clear dwell and the
        // end-of-scene hold each consume one frame per tick, freezing
        // advancement while the board keeps repainting.
        if (anim.dwellFramesRemaining > 0) {
          anim.dwellFramesRemaining -= 1;
          break;
        }
        if (anim.holdFramesRemaining > 0) {
          anim.holdFramesRemaining -= 1;
          break;
        }
        if (anim.sceneIdx >= compiledScenes.length) {
          finish();
          return;
        }
        const scene = compiledScenes[anim.sceneIdx];

        // Scene exhausted -> report completion and start the next on a fresh
        // board. First serve the scene's hold window so sparse scenes still
        // occupy their full target duration.
        if (anim.stageIdx >= scene.stages.length) {
          // Arm once per scene (sceneHoldDone prevents infinite re-arm
          // while the counter drains at the barrier above).
          if (!anim.sceneHoldDone && scene.holdFrames > 0) {
            anim.sceneHoldDone = true;
            anim.holdFramesRemaining = scene.holdFrames;
            break;
          }
          onSceneDoneRef.current?.(anim.sceneIdx);
          anim.sceneIdx += 1;
          anim.stageIdx = 0;
          anim.pointIdx = 1;
          anim.drawnIdx = 1;
          anim.progress = 0;
          anim.committed = [];
          anim.sceneHoldDone = false;
          setUiSceneIdx(Math.min(anim.sceneIdx, compiledScenes.length - 1));
          continue;
        }

        const stage = scene.stages[anim.stageIdx];

        // Discrete stages (text/erase/clear) commit immediately, then dwell:
        // text lingers so viewers can read it (~1.2s each), erase/clear get
        // a shorter beat so transitions don't strobe.
        if (stage.kind !== "stroke") {
          if (stage.kind === "clear") {
            anim.committed = [];
          } else {
            anim.committed.push(stage);
          }
          anim.stageIdx += 1;
          anim.pointIdx = 1;
          anim.drawnIdx = 1;
          anim.progress = 0;
          anim.dwellFramesRemaining = Math.round(
            (stage.kind === "text" ? TEXT_DWELL_SECONDS : CLEAR_DWELL_SECONDS) *
              RENDER_FPS
          );
          break;
        }

        const pts = stage.points;
        if (pts.length < 2 || anim.pointIdx >= pts.length) {
          // Degenerate or fully consumed stroke
          if (pts.length >= 2) anim.committed.push(stage);
          anim.stageIdx += 1;
          anim.pointIdx = 1;
          anim.drawnIdx = 1;
          anim.progress = 0;
          continue;
        }

        const target = pts[anim.pointIdx];
        if (target.velocity === 0) {
          // Teleportation (moveTo jump) — advance instantly, no time cost
          anim.pointIdx += 1;
          continue;
        }

        // --- State Advancement (Two-Thirds Power Law physics) ---
        anim.progress += target.velocity;
        while (anim.progress >= 1 && anim.pointIdx < pts.length - 1) {
          anim.pointIdx += 1;
          anim.progress -= 1;
        }

        // Paint newly consumed segments incrementally onto the layer
        const upto = Math.min(anim.pointIdx, pts.length - 1);
        if (upto > anim.drawnIdx) {
          const lctx = layerCtx();
          if (lctx) drawStrokeRange(lctx, stage, anim.drawnIdx + 1, upto);
          anim.drawnIdx = upto;
        }

        const cursorPoint = pts[upto];
        anim.cursorX = cursorPoint.x + cursorPoint.overshootX;
        anim.cursorY = cursorPoint.y + cursorPoint.overshootY;
        anim.cursorVisible = true;

        if (anim.pointIdx >= pts.length - 1) {
          // Stroke complete — commit and move to the next stage
          anim.committed.push(stage);
          anim.stageIdx += 1;
          anim.pointIdx = 1;
          anim.drawnIdx = 1;
          anim.progress = 0;
          continue;
        }

        // Consumed motion for this frame; wait for the next one
        break;
      }
    };

    const tick = () => {
      fitCanvas();
      ensureLayer();
      // Pause barrier: freeze advancement entirely (no stage/scene progress,
      // no onSceneDone) but keep repainting and the loop alive so playback
      // resumes exactly where it stopped.
      if (!pausedRef.current) {
        advance();
      }
      renderFrame();
      if (!animRef.current.finished) {
        raf = requestAnimationFrame(tick);
      }
    };

    fitCanvas();
    ensureLayer();
    tick();

    return () => cancelAnimationFrame(raf);
  }, [compiledScenes]);

  const totalScenes = compiledScenes.length;
  const activeIdx = Math.min(uiSceneIdx, Math.max(0, totalScenes - 1));
  const activeScene = compiledScenes[activeIdx];

  return (
    <div className="flex w-full flex-col">
      <div className="relative aspect-[8/5] w-full overflow-hidden rounded-lg border border-neutral-800 bg-[#1e1e1e]">
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
      <div className="mt-3 px-1">
        {activeScene ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold text-neutral-100">
                {activeScene.title}
              </h3>
              <span className="shrink-0 text-xs text-neutral-500">
                {sceneLabelOverride ??
                  (uiDone
                    ? "complete"
                    : `scene ${activeIdx + 1} / ${totalScenes}`)}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">
              {activeScene.narration}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">No scenes to play.</p>
        )}
      </div>
    </div>
  );
}
