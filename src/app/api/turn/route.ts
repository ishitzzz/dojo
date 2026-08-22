import { TurnBus } from "@/lib/brain/runtime/turnBus";
import { runAgentLoop } from "@/lib/brain/runtime/agentLoop";
import { findVideoTool } from "@/lib/brain/tools/findVideo";

// ═══════════════════════════════════════════════════════════════
// POST /api/turn — Server-Sent Events endpoint for tutor_chat.
//
// Body: { message: string, sessionId?: string, history?: {role, content}[] }
// Response: SSE stream of TurnEvents (SESSION → … → DONE).
// ═══════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAIN_TOOLS = [findVideoTool];

interface TurnRequestBody {
    message?: unknown;
    sessionId?: unknown;
    history?: unknown;
}

function sseEncode(event: unknown): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
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

    if (typeof body.message !== "string" || body.message.trim().length === 0) {
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

                const loopPromise = runAgentLoop({
                    sessionId,
                    userMessage: body.message as string,
                    history,
                    bus,
                    tools: BRAIN_TOOLS,
                });

                await loopPromise;

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
