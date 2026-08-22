/**
 * The Kinematic Processing Engine ("The Wrist") — ported from reference
 * kinematicEngine.ts. Transforms mathematically perfect, raw geometry into
 * continuous, humanized motion by calculating instantaneous velocity,
 * overshoots, and varying pressure.
 *
 * Pure and framework-free: deterministic output for a given input.
 */

import type { KinematicCoordinate, RawCoordinate } from "./commands";

export interface KinematicOptions {
  /**
   * Playback pacing multiplier. 1 = natural human hand speed.
   * Scales per-point velocity only — pressure/line thickness stays tied to
   * the base motion profile so visuals don't change with playback speed.
   */
  speed?: number;
}

const MIN_SPEED = 0.1;
const MAX_SPEED = 10;

export function applyHumanKinematics(
  rawPath: RawCoordinate[],
  options: KinematicOptions = {}
): KinematicCoordinate[] {
  const rawSpeed = options.speed ?? 1;
  const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, rawSpeed));

  if (rawPath.length === 0) return [];
  if (rawPath.length === 1) {
    return [
      {
        x: rawPath[0].x,
        y: rawPath[0].y,
        velocity: 0,
        curvature: 0,
        overshootX: 0,
        overshootY: 0,
        pressure: 1.0,
      },
    ];
  }

  const result: KinematicCoordinate[] = [];

  // Step 1: Distance and Curvature Calculation
  // Map the raw coordinates to compute incoming angles and local curvature.
  const enrichedPoints = rawPath.map((p, i) => {
    let angle = 0;
    let curvature = 0;

    if (i > 0) {
      const prev = rawPath[i - 1];
      // Calculate the trajectory angle leading into this point
      angle = Math.atan2(p.y - prev.y, p.x - prev.x);
    }

    if (i > 0 && i < rawPath.length - 1) {
      const prev = rawPath[i - 1];
      const next = rawPath[i + 1];

      // Calculate the change in trajectory heading out of this point
      const angleNext = Math.atan2(next.y - p.y, next.x - p.x);
      let angleDiff = Math.abs(angleNext - angle);

      // Normalize angle difference to [0, PI]
      if (angleDiff > Math.PI) {
        angleDiff = 2 * Math.PI - angleDiff;
      }

      // Distance roughly across the curve from prev to next
      const dist = Math.hypot(next.x - prev.x, next.y - prev.y);

      // Curvature roughly approximated as change in angle over distance
      if (dist > 0.001) {
        curvature = angleDiff / dist;
      }
    }

    return { ...p, angle, curvature };
  });

  // Steps 2 & 3: Velocity Generation and Corner Overshoots
  for (let i = 0; i < enrichedPoints.length; i++) {
    const p = enrichedPoints[i];

    // Jump commands don't have physical velocity or pressure profiles
    if (p.commandType === "moveTo") {
      result.push({
        x: p.x,
        y: p.y,
        velocity: 0,
        curvature: 0,
        overshootX: 0,
        overshootY: 0,
        pressure: 1.0,
      });
      continue;
    }

    // --- 2. The Two-Thirds Power Law (Velocity Generation) ---
    // Human motion means high velocity on straight lines and dramatic
    // deceleration in tight curves or dense intersections.

    const k = 15; // Empirical tuning constant for sensitivity to curvature
    // V is inversely proportional to (1 + k*curvature)^(1/3)
    let velocity = 5.0 / Math.pow(1 + p.curvature * k, 1 / 3);

    // Strictly clamp base velocity between 0.5 and 5.0 pixels/frame
    velocity = Math.max(0.5, Math.min(5.0, velocity));

    // Map BASE velocity to pressure inversely:
    // fast (5.0) -> thin lines (~0.3), slow (0.5) -> thick bleed (1.0)
    const velocityRatio = (velocity - 0.5) / 4.5; // Normalizes to 0.0 - 1.0
    const pressure = 1.0 - velocityRatio * 0.7;

    // Playback pacing multiplier applied after pressure mapping
    velocity *= speed;

    // --- 3. Purposeful Overshoots (Corner Hesitation) ---
    let overshootX = 0;
    let overshootY = 0;
    let isSharpCorner = false;

    // Detect if we are about to make a sharp turn
    if (i > 0 && i < enrichedPoints.length - 1) {
      const next = enrichedPoints[i + 1];
      if (next.commandType !== "moveTo") {
        const angleNext = Math.atan2(next.y - p.y, next.x - p.x);
        let angleDiff = Math.abs(angleNext - p.angle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        // If vector direction changes by > 45 degrees
        if (angleDiff > Math.PI / 4) {
          isSharpCorner = true;
          // Pseudo-random based on index for deterministic rendering
          const pseudoRandom1 = (Math.sin(i * 12.9898) * 43758.5453) % 1;
          const extensionMagnitude = 2 + Math.abs(pseudoRandom1) * 2;
          overshootX = Math.cos(p.angle) * extensionMagnitude;
          overshootY = Math.sin(p.angle) * extensionMagnitude;
        }
      }
    }

    // Push the primary processed coordinate
    result.push({
      x: p.x,
      y: p.y,
      velocity,
      curvature: p.curvature,
      overshootX,
      overshootY,
      pressure,
    });

    // If it's a sharp corner, inject hesitation frames so the renderer lingers
    if (isSharpCorner) {
      // Inject 2 or 3 duplicate coordinates at the exact vertex
      const pseudoRandom2 = (Math.sin(i * 78.233) * 43758.5453) % 1;
      const lingeringFrames = 2 + Math.floor(Math.abs(pseudoRandom2) * 2);
      for (let j = 0; j < lingeringFrames; j++) {
        result.push({
          x: p.x,
          y: p.y,
          velocity: 0.05 * speed, // near-zero velocity pauses the render loop
          curvature: p.curvature,
          overshootX: 0,
          overshootY: 0,
          pressure: 1.0, // Maximum marker bleed when the hand pauses
        });
      }
    }
  }

  return result;
}
