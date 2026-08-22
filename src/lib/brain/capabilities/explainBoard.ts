import type { Scene } from "@/lib/whiteboard/commands";
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

function planningPrompt(topic: string): string {
    return `You plan whiteboard lessons. Return ONLY a JSON array (no markdown fences, no commentary) of 3 to 6 scene objects that teach "${topic}" step by step on a whiteboard.

Each scene object has exactly these keys:
- "title": short scene title (string)
- "narration": 2-4 sentences spoken aloud while the board draws this scene
- "drawCommands": array of drawing commands using ONLY these shapes:

  {"type":"stroke","points":[{"x":100,"y":80},{"x":300,"y":80},{"x":500,"y":120}],"color":"#00ffcc","width":3}
  {"type":"text","x":80,"y":40,"text":"Some label","color":"#f5f5f5","size":28}
  {"type":"clear"}

Rules:
- All coordinates are numbers in logical space x: 0..800, y: 0..500.
- "stroke" needs at least 2 points; use many points to sketch shapes and arrows.
- Every scene MUST include at least one stroke or text command.
- Start every scene except the first with {"type":"clear"}.

Example scene object:
{"title":"What is a chart?","narration":"A chart packages an application. It bundles everything needed to run it.","drawCommands":[{"type":"text","x":80,"y":50,"text":"What is a chart?","color":"#00ffcc","size":32},{"type":"stroke","points":[{"x":90,"y":110},{"x":420,"y":110}],"color":"#ffd166","width":3}]}

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
    if (!hasAnyApiKey()) return fallbackScenes(topic);

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
            .slice(0, 6);

        return scenes.length >= 3 ? scenes : fallbackScenes(topic);
    } catch (error) {
        console.error("[explainBoard] scene planning failed, using fallback:", error);
        return fallbackScenes(topic);
    }
}
