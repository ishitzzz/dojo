import {
    GoogleGenerativeAI,
    type Content,
    type FunctionDeclaration,
    type GenerationConfig,
} from "@google/generative-ai";

// ═══════════════════════════════════════════════════════════════
// GeminiProvider — streaming + function-calling transport.
//
// Mirrors the key-pool strategy of src/utils/gemini.ts:
//   1. Round-robin across all GEMINI_API_KEY[_2..10] keys
//   2. Per key, try PRIMARY model then SECONDARY
//   3. On 429/quota → rotate to next combination transparently
//   4. All combinations exhausted → BrainProviderError
//
// Adds what utils/gemini.ts lacks: token streaming and tool calls.
// ═══════════════════════════════════════════════════════════════

const PRIMARY_MODEL = "gemini-2.5-flash";
const SECONDARY_MODEL = "gemini-2.5-flash-lite";

export class BrainProviderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BrainProviderError";
    }
}

export interface ChatMessagePartText {
    text: string;
}

export interface ChatMessagePartFunctionResponse {
    functionResponse: { name: string; response: Record<string, unknown> };
}

export interface ChatMessagePartFunctionCall {
    functionCall: { name: string; args: Record<string, unknown> };
}

export type ChatMessagePart =
    | ChatMessagePartText
    | ChatMessagePartFunctionResponse
    | ChatMessagePartFunctionCall;

export interface ChatMessage {
    role: "user" | "model";
    parts: ChatMessagePart[];
}

export interface ToolSchema {
    name: string;
    description: string;
    // JSON-schema-ish object; cast to Gemini's Schema at request build time.
    parameters: object;
}

export interface SynthesizedFunctionCall {
    id?: string;
    name: string;
    args: Record<string, unknown>;
}

export type StreamChunk =
    | { type: "text"; text: string }
    | { type: "functionCalls"; calls: SynthesizedFunctionCall[] }
    | {
          type: "usage";
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
      };

export interface StreamChatConfig extends GenerationConfig {
    /** Agent-loop round number, used to synthesize stable tool-call ids. */
    round?: number;
    systemInstruction?: string;
}

// ── KEY POOL (same pattern as src/utils/gemini.ts) ─────────────

function getApiKeys(): string[] {
    const keys: string[] = [];

    if (process.env.GEMINI_API_KEY) {
        keys.push(process.env.GEMINI_API_KEY);
    }

    for (let i = 2; i <= 10; i++) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key && key.trim().length > 0) keys.push(key.trim());
    }

    return keys;
}

let currentKeyIndex = 0;

function getNextKeyIndex(totalKeys: number): number {
    const idx = currentKeyIndex % totalKeys;
    currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
    return idx;
}

function isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return (
            msg.includes("429") ||
            msg.includes("rate limit") ||
            msg.includes("quota") ||
            msg.includes("resource_exhausted")
        );
    }
    return false;
}

interface GeminiStreamChunk {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
                functionCall?: { name: string; args?: Record<string, unknown> };
            }>;
        };
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
    };
}

export class GeminiProvider {
    constructor() {
        // Reads/pools env keys exactly like utils/gemini.ts. Validation of a
        // non-empty pool happens per-request in streamChat so hot-swapped
        // env (dev server reloads) is always honored.
    }
}

/**
 * Streaming chat with transparent failover.
 *
 * Text deltas are yielded incrementally as they arrive. If the model emits
 * function calls, exactly one `{type:"functionCalls"}` chunk is yielded at
 * the end of the stream carrying every collected call (ids synthesized —
 * Gemini provides none natively).
 *
 * Failover only occurs before the first yielded chunk; once streaming has
 * begun, a mid-stream failure is rethrown (restarting would duplicate text).
 */
export async function* streamChat(
    messages: ChatMessage[],
    tools?: ToolSchema[],
    config: StreamChatConfig = {}
): AsyncGenerator<StreamChunk> {
    const keys = getApiKeys();

    if (keys.length === 0) {
        throw new BrainProviderError(
            "No Gemini API keys configured. Set GEMINI_API_KEY in .env.local"
        );
    }

    const startIndex = getNextKeyIndex(keys.length);
    const totalAttempts = keys.length * 2; // every key × both models
    const errors: string[] = [];
    let attempt = 0;

    // Strip brain-specific fields so they never leak into the wire payload
    // (unknown keys inside generation_config are rejected by the API with 400).
    const { round: roundRaw = 0, systemInstruction, ...generationConfig } = config;

    while (attempt < totalAttempts) {
        const keyIndex = (startIndex + Math.floor(attempt / 2)) % keys.length;
        const usePrimaryModel = attempt % 2 === 0;
        const modelName = usePrimaryModel ? PRIMARY_MODEL : SECONDARY_MODEL;
        const apiKey = keys[keyIndex];
        const keyLabel = keyIndex === 0 ? "primary" : `key_${keyIndex + 1}`;

        const genAI = new GoogleGenerativeAI(apiKey);
        const contents: Content[] = messages.map((m) => ({
            role: m.role,
            parts: m.parts.map((p) => ({ ...p })) as Content["parts"],
        }));

        const request: Parameters<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContentStream"]>[0] =
            {
                contents,
                generationConfig,
            };

        if (systemInstruction !== undefined) {
            request.systemInstruction = systemInstruction;
        }
        if (tools && tools.length > 0) {
            request.tools = [
                {
                    functionDeclarations: tools.map(
                        (t): FunctionDeclaration =>
                            ({
                                name: t.name,
                                description: t.description,
                                parameters: t.parameters,
                            }) as unknown as FunctionDeclaration
                    ),
                },
            ];
        }

        let chunkIterator: AsyncGenerator<GeminiStreamChunk>;

        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
            });
            const result = await model.generateContentStream(request);
            chunkIterator =
                result.stream as AsyncGenerator<GeminiStreamChunk>;
        } catch (initError) {
            const verb = isRateLimitError(initError) ? "Rate limited" : "Failed";
            console.warn(`🔑 [brain] ${keyLabel} (${modelName}): ${verb}. Rotating...`);
            errors.push(`${keyLabel}/${modelName}: ${String(initError)}`);
            attempt++;
            continue;
        }

        let yieldedAnything = false;
        let sawFunctionCalls = false;
        const collectedCalls: SynthesizedFunctionCall[] = [];
        let lastUsage: Extract<StreamChunk, { type: "usage" }> | null = null;

        try {
            for await (const chunk of chunkIterator) {
                const candidate = chunk.candidates?.[0];
                const parts = candidate?.content?.parts ?? [];

                for (const part of parts) {
                    if (typeof part.text === "string") {
                        yieldedAnything = true;
                        yield { type: "text", text: part.text };
                    } else if (part.functionCall?.name) {
                        sawFunctionCalls = true;
                        collectedCalls.push({
                            name: part.functionCall.name,
                            args: part.functionCall.args ?? {},
                        });
                        // Function-call turns carry no user-facing text deltas;
                        // do not flip yieldedAnything for them alone.
                    }
                }

                if (chunk.usageMetadata) {
                    lastUsage = {
                        type: "usage",
                        promptTokens: chunk.usageMetadata.promptTokenCount,
                        completionTokens: chunk.usageMetadata.candidatesTokenCount,
                        totalTokens: chunk.usageMetadata.totalTokenCount,
                    };
                }
            }
        } catch (streamError) {
            if (!yieldedAnything && !sawFunctionCalls) {
                const verb = isRateLimitError(streamError)
                    ? "Rate limited"
                    : "Stream failed";
                console.warn(`🔑 [brain] ${keyLabel} (${modelName}): ${verb}. Rotating...`);
                errors.push(`${keyLabel}/${modelName}: ${String(streamError)}`);
                attempt++;
                continue;
            }
            // Mid-stream failure after visible output — cannot replay safely.
            throw new BrainProviderError(
                `Gemini stream failed mid-flight (${modelName}): ${String(streamError)}`
            );
        }

        if (lastUsage) {
            yield lastUsage;
        }

        if (sawFunctionCalls) {
            // Gemini gives no call ids — synthesize stable ones:
            // `${name}-r${round}-${i}` where round comes from the caller.
            const round = roundRaw;
            yield {
                type: "functionCalls",
                calls: collectedCalls.map((call, i) => ({
                    ...call,
                    id: `${call.name}-r${round}-${i}`,
                })),
            };
        }

        return; // success — done streaming
    }

    throw new BrainProviderError(
        `All ${keys.length} Gemini API key(s) exhausted across both models.\n` +
            `Errors:\n${errors.join("\n")}`
    );
}
