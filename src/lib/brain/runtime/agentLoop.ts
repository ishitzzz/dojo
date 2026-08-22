import { streamChat, type ChatMessage, type SynthesizedFunctionCall } from "../providers/gemini";
import type { BrainTool } from "../tools/types";
import type { TurnBus } from "./turnBus";

// ═══════════════════════════════════════════════════════════════
// runAgentLoop — the Brain Core turn engine (DeepTutor port,
// sprint-simplified).
//
// A "round" is one streamChat consumption. Text deltas stream out as
// CONTENT events immediately. If the model makes tool calls they are
// executed concurrently (≤4 at once), results fed back, and the loop
// continues. A round with NO tool calls IS the final answer.
//
// Budget: max 6 rounds; on exhaustion a forced finish call without
// tools produces the final answer.
// ═══════════════════════════════════════════════════════════════

const MAX_ROUNDS = 6;
const MAX_PARALLEL_TOOLS = 4;

const SYSTEM_PROMPT = `You are the Learning Dojo tutor — a warm, sharp learning companion that helps users understand topics deeply.

Guidelines:
- Stream your answer naturally in clear prose; use short paragraphs or lists where helpful.
- When you need real YouTube videos to answer (recommendations, comparisons, "find me a video"), call the find_video tool with a focused search query and optionally a targetDurationBand.
- After receiving tool results, weave them into your answer: name specific videos, explain your choice.
- IMPORTANT: A response round in which you make no tool calls is treated as your final answer. Finish your reply completely — do not end mid-thought expecting another chance.`;

export interface AgentLoopHistoryItem {
    role: string;
    content: string;
}

export interface RunAgentLoopArgs {
    sessionId: string;
    userMessage: string;
    history?: AgentLoopHistoryItem[];
    bus: TurnBus;
    tools: BrainTool[];
}

export interface AgentLoopResult {
    finalText: string;
    rounds: number;
    toolSteps: number;
}

interface QueuedToolCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
}

function historyToMessages(history: AgentLoopHistoryItem[] | undefined): ChatMessage[] {
    if (!history || history.length === 0) return [];
    return history
        .filter((h) => typeof h.content === "string" && h.content.trim().length > 0)
        .map((h): ChatMessage => ({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: h.content }],
        }));
}

export async function runAgentLoop({
    sessionId,
    userMessage,
    history,
    bus,
    tools,
}: RunAgentLoopArgs): Promise<AgentLoopResult> {
    const messages: ChatMessage[] = [
        ...historyToMessages(history),
        { role: "user", parts: [{ text: userMessage }] },
    ];

    let finalText = "";
    let rounds = 0;
    let toolSteps = 0;

    try {
        for (let round = 1; round <= MAX_ROUNDS; round++) {
            rounds = round;

            const calls: SynthesizedFunctionCall[] = [];
            let roundText = "";

            const streamConfig = { systemInstruction: SYSTEM_PROMPT, round };

            for await (const chunk of streamChat(messages, tools, streamConfig)) {
                if (chunk.type === "text") {
                    roundText += chunk.text;
                    bus.content(chunk.text);
                } else if (chunk.type === "functionCalls") {
                    calls.push(...chunk.calls);
                }
                // usage chunks are ignored this sprint
            }

            // No function calls → this text was the final answer.
            if (calls.length === 0) {
                finalText += roundText;
                bus.result({ finalText, rounds, toolSteps });
                return { finalText, rounds, toolSteps };
            }

            // Emit TOOL_CALL events, then execute concurrently capped ≤4.
            for (const call of calls) {
                bus.toolCall(call.name, call.args);
            }

            const modelParts: ChatMessage["parts"] = [];
            const responseParts: ChatMessage["parts"] = [];
            let terminateTurn = false;

            for (let i = 0; i < calls.length; i += MAX_PARALLEL_TOOLS) {
                const batch = calls.slice(i, i + MAX_PARALLEL_TOOLS);
                const results = await Promise.all(
                    batch.map(async (call): Promise<{ call: typeof call; result: unknown }> => {
                        const tool = tools.find((t) => t.name === call.name);
                        if (!tool) {
                            return {
                                call,
                                result: {
                                    success: false,
                                    content: `Unknown tool "${call.name}"`,
                                },
                            };
                        }
                        try {
                            const result = await tool.execute(call.args ?? {}, { sessionId });
                            if (result.terminateTurn) terminateTurn = true;
                            return {
                                call,
                                result: {
                                    success: result.success,
                                    content: result.content,
                                    ...(result.sources ? { sources: result.sources } : {}),
                                },
                            };
                        } catch (error) {
                            return {
                                call,
                                result: {
                                    success: false,
                                    content: `Tool threw: ${
                                        error instanceof Error ? error.message : String(error)
                                    }`,
                                },
                            };
                        }
                    })
                );

                for (const { call, result } of results) {
                    toolSteps++;
                    bus.toolResult(call.name, result);
                }

                for (const { call, result } of results) {
                    modelParts.push({
                        functionCall: { name: call.name, args: call.args ?? {} },
                    });
                    responseParts.push({
                        functionResponse: {
                            name: call.name,
                            response: { result },
                        },
                    });
                }
            }

            messages.push({ role: "model", parts: modelParts });
            messages.push({ role: "user", parts: responseParts });

            finalText += roundText;

            if (terminateTurn) {
                bus.result({ finalText, rounds, toolSteps, terminated_by_tool: true });
                return { finalText, rounds, toolSteps };
            }
        }

        // Budget exhausted → forced finish WITHOUT tools.
        let forcedText = "";
        for await (const chunk of streamChat(messages, undefined, {
            systemInstruction: SYSTEM_PROMPT,
            round: MAX_ROUNDS + 1,
        })) {
            if (chunk.type === "text") {
                forcedText += chunk.text;
                bus.content(chunk.text);
            }
        }
        finalText += forcedText;
        rounds = MAX_ROUNDS + 1;
        bus.result({ finalText, rounds, toolSteps });
        return { finalText, rounds, toolSteps };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : String(error);
        bus.error(message);
        bus.done();
        return { finalText, rounds, toolSteps };
    }
}
