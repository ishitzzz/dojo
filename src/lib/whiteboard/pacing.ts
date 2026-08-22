/**
 * Whiteboard pacing — shared scene-duration math (UX defect #1 fix).
 *
 * Problem: LLM-planned scenes can contain as few as 1-2 sparse strokes,
 * which the kinematic renderer blits through in ~2.5s. Nothing enforced
 * a minimum dwell time per scene, and text/erase/clear applied in one
 * frame.
 *
 * Contract:
 * - Every scene plays for at least MIN_SCENE_SECONDS and at most
 *   MAX_SCENE_SECONDS of wall time.
 * - Sparse scenes are slowed down by scaling the kinematics speed so
 *   their strokes spread across the target window ("duration hint").
 * - When slowing is capped (kinematic engine floors speed at 0.1), the
 *   remainder of the window becomes an end-of-scene HOLD on the fully
 *   drawn board instead of instantly jumping to the next scene.
 * - Text commands always dwell TEXT_DWELL_SECONDS each; erase/clear get
 *   a shorter beat so scene transitions don't strobe.
 *
 * The estimator below works on RAW draw commands (pre-kinematics) so
 * callers without a compiled stage list (ExplainBoardPlayer building
 * durationHints) can use it too.
 */

import type { DrawCommand } from "./commands";

export const MIN_SCENE_SECONDS = 7;
export const MAX_SCENE_SECONDS = 25;

/** Per-command minimum display time (seconds). */
export const TEXT_DWELL_SECONDS = 1.2;
export const CLEAR_DWELL_SECONDS = 0.35;

/** Renderer frame budget assumption used to convert frame costs to seconds. */
export const RENDER_FPS = 60;

/**
 * Average base velocity (points consumed per frame) assumed before
 * kinematics run. The kinematic engine clamps base velocity into
 * [0.5, 5] px/frame with typical values near 2-3, so 2.5 gives a sane
 * rough estimate for pre-compilation hints.
 */
const EST_AVG_POINTS_PER_FRAME = 2.5;

function estimateStrokeSeconds(cmd: {
  points: { x: number; y: number }[];
}): number {
  let dist = 0;
  for (let i = 1; i < cmd.points.length; i++) {
    dist += Math.hypot(
      cmd.points[i].x - cmd.points[i - 1].x,
      cmd.points[i].y - cmd.points[i - 1].y
    );
  }
  // Each kinematic point consumes ~EST_AVG_POINTS_PER_FRAME px/frame.
  const frames =
    dist / EST_AVG_POINTS_PER_FRAME + Math.max(0, cmd.points.length - 2) * 0.25;
  return frames / RENDER_FPS;
}

/**
 * Rough natural duration (seconds) of a scene built from raw commands:
 * stroke path length at assumed average hand speed plus per-command
 * dwell for text/erase/clear. Used for duration hints; the renderer
 * refines this with true kinematic velocities when compiling.
 */
export function estimateSceneSeconds(commands: DrawCommand[]): number {
  let seconds = 0;
  for (const cmd of commands) {
    switch (cmd.type) {
      case "stroke":
        seconds += estimateStrokeSeconds(cmd);
        break;
      case "path": {
        // Flatten path ops into pseudo-points for distance estimation.
        const pts: { x: number; y: number }[] = [];
        for (const op of cmd.ops) {
          if (op.x !== undefined && op.y !== undefined) {
            pts.push({ x: op.x, y: op.y });
          }
        }
        if (pts.length >= 2) seconds += estimateStrokeSeconds({ points: pts });
        break;
      }
      case "text":
        seconds += TEXT_DWELL_SECONDS;
        break;
      case "erase":
      case "clear":
        seconds += CLEAR_DWELL_SECONDS;
        break;
    }
  }
  return seconds;
}
