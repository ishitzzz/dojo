import type { PathSegment, Point, Scene } from "@/lib/whiteboard/commands";
import WhiteboardRenderer from "@/components/whiteboard/WhiteboardRenderer";
import ExplainBoardPlayer from "@/components/whiteboard/ExplainBoardPlayer";

// ---------------------------------------------------------------------------
// Hardcoded demo scenes for visual verification of the M5.1 rendering core.
// Logical coordinate space: 0..800 x 0..500.
// ---------------------------------------------------------------------------

function underlinePoints(x1: number, x2: number, y: number): Point[] {
  return [
    { x: x1, y },
    { x: x2, y },
  ];
}

function rectPoints(
  x: number,
  y: number,
  w: number,
  h: number,
  inset = 8
): Point[] {
  return [
    { x: x + inset, y: y + inset },
    { x: x + w - inset, y: y + inset },
    { x: x + w - inset, y: y + h - inset },
    { x: x + inset, y: y + h - inset },
    { x: x + inset, y: y + inset },
  ];
}

function arrowShaft(x1: number, y1: number, x2: number, y2: number): Point[] {
  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ];
}

function arrowHead(x: number, y: number, dir: -1 | 1): Point[] {
  return [
    { x: x - dir * 14, y: y - 9 },
    { x, y },
    { x: x - dir * 14, y: y + 9 },
  ];
}

/** Cubic-bezier approximation of a full circle (kappa ~0.5523). */
function circlePathOps(cx: number, cy: number, r: number): PathSegment[] {
  const k = r * 0.5523;
  return [
    { command: "moveTo", x: cx, y: cy - r },
    { command: "bezierCurveTo", cp1x: cx + k, cp1y: cy - r, cp2x: cx + r, cp2y: cy - k, x: cx + r, y: cy },
    { command: "bezierCurveTo", cp1x: cx + r, cp1y: cy + k, cp2x: cx + k, cp2y: cy + r, x: cx, y: cy + r },
    { command: "bezierCurveTo", cp1x: cx - k, cp1y: cy + r, cp2x: cx - r, cp2y: cy + k, x: cx - r, y: cy },
    { command: "bezierCurveTo", cp1x: cx - r, cp1y: cy - k, cp2x: cx - k, cp2y: cy - r, x: cx, y: cy - r },
  ];
}

/** Alternating cubic segments forming a smooth horizontal wave. */
function wavePathOps(y: number, amp: number, cycles: number): PathSegment[] {
  const ops: PathSegment[] = [{ command: "moveTo", x: 80, y }];
  const segW = 640 / cycles;
  for (let i = 0; i < cycles; i++) {
    const x0 = 80 + i * segW;
    const dir = i % 2 === 0 ? -1 : 1;
    ops.push({
      command: "bezierCurveTo",
      cp1x: x0 + segW * 0.33,
      cp1y: y + dir * amp * 2,
      cp2x: x0 + segW * 0.67,
      cp2y: y + dir * amp * 2,
      x: x0 + segW,
      y,
    });
  }
  return ops;
}

const SCENE_1: Scene = {
  title: "The Two-Thirds Power Law",
  narration:
    "The kinematic engine paces every stroke like a human hand: velocity follows V ≈ k·R^(1/3), so straight runs fly by while tight curves slow down and linger.",
  drawCommands: [
    { type: "clear" },
    {
      type: "text",
      x: 60,
      y: 42,
      text: "The Two-Thirds Power Law",
      color: "#00ffcc",
      size: 34,
    },
    {
      type: "stroke",
      points: underlinePoints(62, 520, 94),
      color: "#00ffcc",
      width: 3,
    },
    { type: "text", x: 80, y: 150, text: "V ≈ k · R^(1/3)", color: "#f5f5f5", size: 30 },
    {
      type: "text",
      x: 80,
      y: 205,
      text: "straight line -> fast    tight curve -> slow",
      color: "#9b8cff",
      size: 22,
    },
    {
      type: "path",
      ops: wavePathOps(360, 45, 4),
      color: "#ffd166",
      width: 3,
    },
    {
      type: "text",
      x: 80,
      y: 440,
      text: "watch the pen hesitate at each peak",
      color: "#8a8a8a",
      size: 18,
    },
  ],
};

const SCENE_2: Scene = {
  title: "Curvature Controls Speed",
  narration:
    "A bezier-drawn circle flattens into 60 samples; curvature spikes decelerate the pen and inject overshoot hesitation exactly at the corners.",
  drawCommands: [
    { type: "clear" },
    { type: "path", ops: circlePathOps(250, 265, 130), color: "#ff66a3", width: 3 },
    {
      type: "stroke",
      points: [
        { x: 460, y: 200 },
        { x: 720, y: 200 },
      ],
      color: "#00ffcc",
      width: 3,
    },
    { type: "text", x: 150, y: 430, text: "high curvature: slow + pressure bleed", color: "#ff66a3", size: 20 },
    { type: "text", x: 470, y: 165, text: "zero curvature: max velocity", color: "#00ffcc", size: 20 },
    {
      type: "stroke",
      points: arrowShaft(430, 330, 368, 305),
      color: "#ffd166",
      width: 2,
    },
    { type: "stroke", points: arrowHead(368, 305, 1), color: "#ffd166", width: 2 },
  ],
};

const SCENE_3: Scene = {
  title: "Rendering Pipeline",
  narration:
    "Typed draw commands are flattened into raw coordinates, humanized by the kinematic engine, then replayed progressively onto a DPR-aware letterboxed canvas.",
  drawCommands: [
    { type: "clear" },
    {
      type: "text",
      x: 60,
      y: 48,
      text: "How a scene reaches the board",
      color: "#00ffcc",
      size: 30,
    },
    { type: "stroke", points: rectPoints(70, 170, 170, 120), color: "#9b8cff", width: 3 },
    { type: "stroke", points: rectPoints(315, 170, 170, 120), color: "#ffd166", width: 3 },
    { type: "stroke", points: rectPoints(560, 170, 170, 120), color: "#ff66a3", width: 3 },
    { type: "text", x: 108, y: 218, text: "DrawCommand", color: "#9b8cff", size: 20 },
    { type: "text", x: 352, y: 218, text: "Raw points", color: "#ffd166", size: 20 },
    { type: "text", x: 585, y: 218, text: "Kinematics", color: "#ff66a3", size: 20 },
    { type: "stroke", points: arrowShaft(244, 230, 307, 230), color: "#8a8a8a", width: 2 },
    { type: "stroke", points: arrowHead(307, 230, 1), color: "#8a8a8a", width: 2 },
    { type: "stroke", points: arrowShaft(489, 230, 552, 230), color: "#8a8a8a", width: 2 },
    { type: "stroke", points: arrowHead(552, 230, 1), color: "#8a8a8a", width: 2 },
    {
      type: "text",
      x: 145,
      y: 380,
      text: "typed JSON -> flattened curves -> velocity, overshoot, pressure",
      color: "#8a8a8a",
      size: 19,
    },
  ],
};

const DEMO_SCENES: Scene[] = [SCENE_1, SCENE_2, SCENE_3];

export default function WhiteboardDemoPage() {
  return (
    <main className="min-h-screen bg-neutral-950 py-10 text-neutral-100">
      <div className="mx-auto max-w-4xl px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Whiteboard Renderer Demo</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Live explain_board streaming (M5.2) above the static M5.1
            rendering-core demo.
          </p>
        </header>
        <div className="mb-10">
          <ExplainBoardPlayer />
        </div>
        <WhiteboardRenderer scenes={DEMO_SCENES} speed={1.25} />
      </div>
    </main>
  );
}
