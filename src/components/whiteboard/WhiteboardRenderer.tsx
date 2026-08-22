"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KinematicCoordinate, Scene } from "@/lib/whiteboard/commands";
import {
  compileDrawCommands,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
} from "@/lib/whiteboard/canvasInterceptor";
import { applyHumanKinematics } from "@/lib/whiteboard/kinematicEngine";

interface WhiteboardRendererProps {
  scenes: Scene[];
  /** Playback pacing multiplier (1 = natural hand speed). Changes apply live. */
  speed?: number;
  /** True pause barrier: freezes advancement and suppresses onSceneDone. */
  paused?: boolean;
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
  };
}

const BOARD_BG = "#1e1e1e";

export default function WhiteboardRenderer({
  scenes,
  speed = 1,
  paused = false,
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

  // Recompiled when scenes OR speed change; animation indexes survive speed
  // changes because compilation preserves stage/point structure.
  const compiledScenes = useMemo<CompiledScene[]>(
    () =>
      scenes.map((scene) => ({
        title: scene.title,
        narration: scene.narration,
        stages: compileDrawCommands(scene.drawCommands).map(
          (stage): CompiledStage =>
            stage.kind === "stroke"
              ? {
                  kind: "stroke",
                  color: stage.color,
                  width: stage.width,
                  points: applyHumanKinematics(stage.points, { speed }),
                }
              : stage
        ),
      })),
    [scenes, speed]
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
        if (anim.sceneIdx >= compiledScenes.length) {
          finish();
          return;
        }
        const scene = compiledScenes[anim.sceneIdx];

        // Scene exhausted -> report completion and start the next on a fresh board
        if (anim.stageIdx >= scene.stages.length) {
          onSceneDoneRef.current?.(anim.sceneIdx);
          anim.sceneIdx += 1;
          anim.stageIdx = 0;
          anim.pointIdx = 1;
          anim.drawnIdx = 1;
          anim.progress = 0;
          anim.committed = [];
          setUiSceneIdx(Math.min(anim.sceneIdx, compiledScenes.length - 1));
          continue;
        }

        const stage = scene.stages[anim.stageIdx];

        // Discrete stages (text/erase/clear) apply instantaneously
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
          continue;
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
                {uiDone
                  ? "complete"
                  : `scene ${activeIdx + 1} / ${totalScenes}`}
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
