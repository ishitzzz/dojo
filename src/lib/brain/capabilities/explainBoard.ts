import type { DrawCommand, Scene } from "@/lib/whiteboard/commands";
import { parseDrawCommands } from "@/lib/whiteboard/canvasInterceptor";
import { generateContentWithFailover, hasAnyApiKey } from "@/utils/gemini";
import { safeParseJsonArray } from "@/utils/safeJsonParser";

// ═══════════════════════════════════════════════════════════════
// explainBoard — M5.2 "explain_board" capability.
//
// One Gemini call plans 3-6 whiteboard scenes for a topic. Every
// scene's drawCommands are coerced through the safe parser; scenes
// with zero valid commands are dropped. Any failure (no key, bad
// JSON, too few survivors) falls back to a deterministic 3-scene
// template so the SSE flow never hard-fails.
// ═══════════════════════════════════════════════════════════════

const FALLBACK_NARRATION = "Fallback outline — live generation unavailable.";

// ═══════════════════════════════════════════════════════════════
// UX defect #1a fix: sparse LLM output (2 stray lines per scene) made
// scenes flash by in ~2.5s. The prompt now demands RICH drawings:
// 8-16 draw commands per scene mixing labeled rectangles, arrows and
// text labels, so every scene has enough strokes to fill a ≥7s window.
// ═══════════════════════════════════════════════════════════════
function planningPrompt(topic: string): string {
    return `You plan rich whiteboard lessons. Return ONLY a JSON array (no markdown fences, no commentary) of 3 to 6 scene objects that teach "${topic}" step by step on a whiteboard.

Each scene object has exactly these keys:
- "title": short scene title (string)
- "narration": 3-5 sentences spoken aloud while the board draws this scene
- "drawCommands": array of drawing commands using ONLY these shapes:

  {"type":"stroke","points":[{"x":100,"y":80},{"x":300,"y":80},{"x":500,"y":120}],"color":"#00ffcc","width":3}
  {"type":"text","x":80,"y":40,"text":"Some label","color":"#f5f5f5","size":28}
  {"type":"clear"}

RICHNESS RULES (strict):
- Each scene's drawCommands array MUST contain BETWEEN 8 AND 16 commands.
- Mix these building blocks in every scene:
  1. LABELED RECTANGLES: closed 4-point strokes (corner -> corner -> corner -> back to the first corner), one per key concept, each paired with a text label inside it.
  2. CONNECTING ARROWS: a straight shaft stroke plus a small V-shaped head stroke at the target end (two short strokes meeting at the tip).
  3. TEXT LABELS: short strings (1-4 words) with size between 12 and 22, placed inside boxes or next to arrows.
- FORBIDDEN: single stray lines that go nowhere, empty scenes with only text, more than one bare underline per scene.
- Scene 1 MUST begin with a title text command (size 24-32) naming the topic.
- Start every scene except the first with {"type":"clear"}.

Rules:
- All coordinates are numbers in logical space x: 0..800, y: 0..500.
- "stroke" needs at least 2 points; give rectangles their 4 corners (repeat the first point last to close them).
- Colors available: "#00ffcc" teal, "#ffd166" amber, "#ff66a3" pink, "#8ab4ff" blue, "#f5f5f5" white.

Example scene object (abbreviated — real scenes need 8-16 commands):
{"title":"What is a chart?","narration":"A chart packages an application. It bundles everything needed to run it.","drawCommands":[{"type":"text","x":60,"y":30,"text":"What is a chart?","color":"#00ffcc","size":28},{"type":"stroke","points":[{"x":80,"y":120},{"x":280,"y":120},{"x":280,"y":220},{"x":80,"y":220},{"x":80,"y":120}],"color":"#ffd166","width":3},{"type":"text","x":110,"y":160,"text":"app code","color":"#f5f5f5","size":18},{"type":"stroke","points":[{"x":290,"y":170},{"x":430,"y":170}],"color":"#8ab4ff","width":2},{"type":"stroke","points":[{"x":400,"y":158},{"x":430,"y":170},{"x":400,"y":182}],"color":"#8ab4ff","width":2},{"type":"stroke","points":[{"x":440,"y":120},{"x":660,"y":120},{"x":660,"y":220},{"x":440,"y":220},{"x":440,"y":120}],"color":"#ff66a3","width":3},{"type":"text","x":470,"y":160,"text":"dependencies","color":"#f5f5f5","size":16},{"type":"text","x":250,"y":260,"text":"bundled together","color":"#f5f5f5","size":14}]}

Return the JSON array only.`;
}

interface RawScene {
    title?: unknown;
    narration?: unknown;
    drawCommands?: unknown;
}

function coerceScene(raw: RawScene): Scene | null {
    const commands = parseDrawCommands(raw.drawCommands);
    if (commands.length === 0) return null;
    const title =
        typeof raw.title === "string" && raw.title.trim().length > 0
            ? raw.title.trim()
            : "Untitled scene";
    return {
        title,
        narration:
            typeof raw.narration === "string" ? raw.narration.trim() : "",
        drawCommands: commands,
    };
}

// ═══════════════════════════════════════════════════════════════
// Deterministic richness enforcement (UX defect #1a, server side).
//
// The prompt demands 8-16 commands per scene, but models sometimes
// ignore it (observed: 2-3 text-only commands). Sparse scenes are the
// root cause of lessons flashing by in ~2.5s. enrichScene() appends a
// deterministic scaffold — labeled rectangles, connecting arrows and
// label text derived from the narration — until the scene carries
// >= MIN_RICH_COMMANDS commands, so every scene has enough strokes for
// the client-side pacing window (>=7s) to feel deliberate.
// ═══════════════════════════════════════════════════════════════

const MIN_RICH_COMMANDS = 8;

function rectStroke(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    width = 3
): DrawCommand {
    return {
        type: "stroke",
        points: [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
            { x, y }, // close the rectangle back at its first corner
        ],
        color,
        width,
    };
}

/** Arrow = straight shaft stroke + small V-shaped head stroke at the tip. */
function arrowStrokes(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string
): DrawCommand[] {
    const head = 14;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    return [
        { type: "stroke", points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color, width: 2 },
        {
            type: "stroke",
            points: [
                {
                    x: x2 - head * Math.cos(angle - Math.PI / 7),
                    y: y2 - head * Math.sin(angle - Math.PI / 7),
                },
                { x: x2, y: y2 },
                {
                    x: x2 - head * Math.cos(angle + Math.PI / 7),
                    y: y2 - head * Math.sin(angle + Math.PI / 7),
                },
            ],
            color,
            width: 2,
        },
    ];
}

function textCmd(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number
): DrawCommand {
    return { type: "text", x, y, text, color, size };
}

function extractLabels(narration: string, max: number): string[] {
    const words = narration
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
    const labels: string[] = [];
    for (const word of words) {
        if (labels.length >= max) break;
        if (!labels.includes(word)) labels.push(word);
    }
    while (labels.length < 2) labels.push(`idea ${labels.length + 1}`);
    return labels.slice(0, Math.max(2, max));
}

/**
 * Appends a deterministic drawing scaffold when a scene is too sparse.
 * Layout (logical space 800x500): title bar, frame rectangle, then a
 * row of labeled boxes joined by arrows using keywords from narration.
 */
function enrichScene(scene: Scene): Scene {
    const meaningful = scene.drawCommands.filter((c) => c.type !== "clear");
    if (meaningful.length >= MIN_RICH_COMMANDS) return scene;

    const extras: DrawCommand[] = [];
    const leadingClear = scene.drawCommands.some((c) => c.type === "clear")
        ? ([{ type: "clear" }] as DrawCommand[])
        : [];

    // Title text on top (scene 1 must always carry one).
    const hasTitleText =
        meaningful.length > 0 &&
        meaningful[0].type === "text" &&
        meaningful[0].y < 80;
    if (!hasTitleText) {
        extras.push(textCmd(70, 30, scene.title, "#00ffcc", 28));
    }

    // Outer frame.
    extras.push(rectStroke(60, 90, 680, 360, "#8ab4ff", 2));

    // Row of up to three labeled boxes with arrows between them.
    const labels = extractLabels(scene.narration, 3);
    const boxW = 170;
    const boxY = 200;
    const xs = [100, 330, 560];
    const colors = ["#ffd166", "#ff66a3", "#00ffcc"];
    const boxCount = 3;
    for (let i = 0; i < boxCount; i++) {
        extras.push(rectStroke(xs[i], boxY, boxW, 90, colors[i]));
        extras.push(
            textCmd(xs[i] + 14, boxY + 34, labels[i] ?? `step ${i + 1}`, "#f5f5f5", 18)
        );
        if (i > 0) {
            extras.push(
                ...arrowStrokes(xs[i - 1] + boxW, boxY + 45, xs[i], boxY + 45, "#f5f5f5")
            );
        }
    }

    // Caption underline beneath the boxes.
    extras.push({
        type: "stroke",
        points: [
            { x: 100, y: 360 },
            { x: 700, y: 360 },
        ],
        color: "#ffd166",
        width: 2,
    });

    // Append scaffold items only until the scene is rich enough; existing
    // model content stays first so its intent leads the scene.
    const filler: DrawCommand[] = [...extras];
    const enriched: DrawCommand[] = [...meaningful];
    while (enriched.length < MIN_RICH_COMMANDS && filler.length > 0) {
        enriched.push(filler.shift() as DrawCommand);
    }
    return { ...scene, drawCommands: [...leadingClear, ...enriched] };
}

function fallbackScenes(topic: string): Scene[] {
    return [
        {
            title: `${topic}: Overview`,
            narration: FALLBACK_NARRATION,
            drawCommands: [
                {
                    type: "text",
                    x: 70,
                    y: 60,
                    text: `${topic} — overview`,
                    color: "#00ffcc",
                    size: 32,
                },
                {
                    type: "text",
                    x: 70,
                    y: 170,
                    text: "what it is and why it matters",
                    color: "#f5f5f5",
                    size: 24,
                },
            ],
        },
        {
            title: `${topic}: Key ideas`,
            narration: FALLBACK_NARRATION,
            drawCommands: [
                { type: "clear" },
                {
                    type: "text",
                    x: 70,
                    y: 60,
                    text: `${topic} — key ideas`,
                    color: "#ffd166",
                    size: 32,
                },
                {
                    type: "text",
                    x: 70,
                    y: 170,
                    text: "core concepts, step by step",
                    color: "#f5f5f5",
                    size: 24,
                },
            ],
        },
        {
            title: `${topic}: Recap`,
            narration: FALLBACK_NARRATION,
            drawCommands: [
                { type: "clear" },
                {
                    type: "text",
                    x: 70,
                    y: 60,
                    text: `${topic} — recap`,
                    color: "#ff66a3",
                    size: 32,
                },
                {
                    type: "text",
                    x: 70,
                    y: 170,
                    text: "summary + where to go next",
                    color: "#f5f5f5",
                    size: 24,
                },
            ],
        },
    ];
}

export async function planExplainScenes(topic: string): Promise<Scene[]> {
    if (!hasAnyApiKey()) return fallbackScenes(topic).map(enrichScene);

    try {
        const { text } = await generateContentWithFailover(
            planningPrompt(topic),
            { temperature: 0.4, responseMimeType: "application/json" }
        );

        const parsed = safeParseJsonArray<RawScene>(text);
        if (!parsed) return fallbackScenes(topic);

        const scenes = parsed
            .map(coerceScene)
            .filter((scene): scene is Scene => scene !== null)
            .map(enrichScene)
            .slice(0, 6);

        return scenes.length >= 3 ? scenes : fallbackScenes(topic).map(enrichScene);
    } catch (error) {
        console.error("[explainBoard] scene planning failed, using fallback:", error);
        return fallbackScenes(topic);
    }
}
