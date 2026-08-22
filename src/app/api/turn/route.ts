import { TurnBus } from "@/lib/brain/runtime/turnBus";
import { runAgentLoop } from "@/lib/brain/runtime/agentLoop";
import { findVideoTool } from "@/lib/brain/tools/findVideo";
import { planExplainScenes } from "@/lib/brain/capabilities/explainBoard";
import type { Scene } from "@/lib/whiteboard/commands";

// ═══════════════════════════════════════════════════════════════
// POST /api/turn — Server-Sent Events endpoint for agent turns.
//
// Body: { message: string, sessionId?: string, history?: {role, content}[] }
//   or: { mode: "explain_board", topic: string, sessionId?: string }
// Response: SSE stream of TurnEvents (SESSION → … → DONE).
// ═══════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAIN_TOOLS = [findVideoTool];

const ALLOWED_MODES: readonly string[] = ["tutor_chat", "explain_board"];

interface TurnRequestBody {
    mode?: unknown;
    topic?: unknown;
    message?: unknown;
    sessionId?: unknown;
    history?: unknown;
}

function sseEncode(event: unknown): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

// ═══════════════════════════════════════════════════════════════
// explain_board turn: plan scenes, then stream NARRATION +
// DRAW_DELTA per scene, RESULT({scenes}), DONE.
// ═══════════════════════════════════════════════════════════════
async function runExplainBoardTurn(
    topic: string,
    bus: TurnBus
): Promise<void> {
    bus.stageStart("planning_explanation");

    let scenes: Scene[] = [];
    try {
        scenes = await planExplainScenes(topic);
    } catch (error) {
        console.error("[api/turn] explain planning failed:", error);
    }

    if (scenes.length === 0) {
        bus.error("No explainer scenes could be planned");
        return;
    }

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        bus.narration(scene.narration, { index: i, title: scene.title });
        for (const command of scene.drawCommands) {
            bus.drawDelta(i, command);
        }
    }

    bus.result({ scenes: scenes.length, topic });
}

export async function POST(request: Request): Promise<Response> {
    let body: TurnRequestBody;
    try {
        body = (await request.json()) as TurnRequestBody;
    } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "content-type": "application/json" },
        });
    }

    const mode = body.mode === undefined ? "tutor_chat" : body.mode;

    if (
        typeof mode !== "string" ||
        !ALLOWED_MODES.includes(mode)
    ) {
        return new Response(
            JSON.stringify({
                error: `Unknown mode '${String(mode)}'. Allowed modes: ${ALLOWED_MODES.join(", ")}`,
            }),
            { status: 400, headers: { "content-type": "application/json" } }
        );
    }

    if (mode === "explain_board") {
        if (typeof body.topic !== "string" || body.topic.trim().length === 0) {
            return new Response(
                JSON.stringify({
                    error: "'topic' (non-empty string) is required for explain_board mode",
                }),
                { status: 400, headers: { "content-type": "application/json" } }
            );
        }
    } else if (
        typeof body.message !== "string" ||
        body.message.trim().length === 0
    ) {
        return new Response(
            JSON.stringify({ error: "'message' (non-empty string) is required" }),
            { status: 400, headers: { "content-type": "application/json" } }
        );
    }

    const sessionId =
        typeof body.sessionId === "string" && body.sessionId.trim().length > 0
            ? body.sessionId
            : crypto.randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawHistory = Array.isArray(body.history) ? (body.history as any[]) : [];
    const history = rawHistory
        .filter(
            (h) =>
                h &&
                typeof h.content === "string" &&
                typeof h.role === "string"
        )
        .map((h) => ({ role: h.role as string, content: h.content as string }));

    const bus = new TurnBus(sessionId);

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                bus.session({ sessionId });

                // Subscribe BEFORE the loop starts so no event is lost,
                // then pump everything to the client until DONE.
                const events = bus.subscribe();
                let sawDone = false;

                const pump = (async () => {
                    while (true) {
                        const next = await events.next();
                        if (next.done) break;
                        controller.enqueue(sseEncode(next.value));
                        if (next.value.type === "DONE") {
                            sawDone = true;
                            break;
                        }
                    }
                })();

                const turnPromise =
                    mode === "explain_board"
                        ? runExplainBoardTurn(body.topic as string, bus)
                        : runAgentLoop({
                              sessionId,
                              userMessage: body.message as string,
                              history,
                              bus,
                              tools: BRAIN_TOOLS,
                          });

                await turnPromise;

                // The agent loop terminates turns with RESULT (or ERROR+DONE on
                // provider failure); guarantee a terminal DONE for SSE clients.
                if (!sawDone) bus.done();

                await pump;
            } catch (error) {
                // Loop handles its own errors via bus.error/bus.done(); this is a
                // last-resort guard so the stream always terminates cleanly.
                console.error("[api/turn] stream failure:", error);
                controller.enqueue(
                    sseEncode({
                        type: "ERROR",
                        source: "api",
                        content: error instanceof Error ? error.message : String(error),
                        metadata: { turn_terminal: true },
                        sessionId,
                        seq: -1,
                        timestamp: Date.now(),
                    })
                );
            } finally {
                bus.close();
                try {
                    controller.close();
                } catch {
                    // already closed
                }
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
