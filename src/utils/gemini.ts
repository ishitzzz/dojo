import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";

/**
 * 🔑 Gemini API Key Pool — Round-Robin with 429 Failover
 * 
 * Supports up to 10 API keys via env vars:
 *   GEMINI_API_KEY   (required — the primary key)
 *   GEMINI_API_KEY_2 (optional)
 *   GEMINI_API_KEY_3 (optional)
 *   ... up to GEMINI_API_KEY_10
 * 
 * Strategy:
 * 1. Round-robin across all available keys
 * 2. For each key, try PRIMARY model first, then SECONDARY
 * 3. If 429 (rate limit) → skip to next key immediately
 * 4. If all keys exhausted → throw with clear message
 * 
 * With 3 keys: ~750 requests/day, ~30-45 RPM
 */

const PRIMARY_MODEL = "gemini-2.5-flash";
const SECONDARY_MODEL = "gemini-2.5-flash-lite";

// ═══════════════════════════════════════════════════════════════
// KEY POOL MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export function getApiKeys(): string[] {
    const keys: string[] = [];

    // Primary key
    if (process.env.GEMINI_API_KEY) {
        keys.push(process.env.GEMINI_API_KEY);
    }

    // Additional keys (GEMINI_API_KEY_2 through GEMINI_API_KEY_10)
    for (let i = 2; i <= 10; i++) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key && key.trim().length > 0) keys.push(key.trim());
    }

    return keys;
}

/** True when at least one Gemini key (GEMINI_API_KEY or _2.._10) is configured. */
export function hasAnyApiKey(): boolean {
    return getApiKeys().length > 0;
}

// Round-robin counter — persists across requests in the same server process
let currentKeyIndex = 0;

function getNextKeyIndex(totalKeys: number): number {
    const idx = currentKeyIndex % totalKeys;
    currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
    return idx;
}

/**
 * Check if an error is a 429 rate limit error
 */
function isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes("429") || msg.includes("rate limit") || msg.includes("quota") || msg.includes("resource_exhausted");
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

export interface FailoverResult {
    text: string;
    modelUsed: string;
    fallbackUsed: boolean;
    keyUsed: number; // which key index was used (for debugging)
}

/**
 * Generates content using Google Gemini with:
 *  1. Round-robin key rotation across all available API keys
 *  2. Primary → Secondary model failover per key
 *  3. Automatic 429 retry with next key
 * 
 * One function call can try up to (numKeys × 2) combinations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateContentWithFailover(
    prompt: string | Array<string | any>,
    config: GenerationConfig = {}
): Promise<FailoverResult> {
    const keys = getApiKeys();

    if (keys.length === 0) {
        throw new Error("No Gemini API keys configured. Set GEMINI_API_KEY in .env.local");
    }

    const startIndex = getNextKeyIndex(keys.length);
    const errors: string[] = [];

    // Try each key in round-robin order
    for (let attempt = 0; attempt < keys.length; attempt++) {
        const keyIndex = (startIndex + attempt) % keys.length;
        const apiKey = keys[keyIndex];
        const keyLabel = keyIndex === 0 ? "primary" : `key_${keyIndex + 1}`;

        const genAI = new GoogleGenerativeAI(apiKey);

        // Try PRIMARY model
        try {
            const model = genAI.getGenerativeModel({
                model: PRIMARY_MODEL,
                generationConfig: config,
            });

            const result = await model.generateContent(prompt);
            const text = result.response.text();

            if (attempt > 0) {
                console.log(`🔄 Key rotation: Used ${keyLabel} (${PRIMARY_MODEL}) after ${attempt} skips`);
            }

            return {
                text,
                modelUsed: PRIMARY_MODEL,
                fallbackUsed: false,
                keyUsed: keyIndex,
            };
        } catch (primaryError) {
            if (isRateLimitError(primaryError)) {
                console.warn(`🔑 Key ${keyLabel} (${PRIMARY_MODEL}): Rate limited. Trying secondary...`);
            } else {
                console.warn(`⚠️ Key ${keyLabel} (${PRIMARY_MODEL}): Failed. Trying secondary...`);
            }

            // Try SECONDARY model with same key
            try {
                const model = genAI.getGenerativeModel({
                    model: SECONDARY_MODEL,
                    generationConfig: config,
                });

                const result = await model.generateContent(prompt);
                const text = result.response.text();

                console.log(`✅ Failover: Used ${keyLabel} (${SECONDARY_MODEL})`);

                return {
                    text,
                    modelUsed: SECONDARY_MODEL,
                    fallbackUsed: true,
                    keyUsed: keyIndex,
                };
            } catch (secondaryError) {
                if (isRateLimitError(secondaryError)) {
                    console.warn(`🔑 Key ${keyLabel} (${SECONDARY_MODEL}): Also rate limited. Rotating to next key...`);
                    errors.push(`Key ${keyLabel}: Both models rate limited`);
                    continue; // Try next key
                }

                errors.push(`Key ${keyLabel}: Primary=${String(primaryError)}, Secondary=${String(secondaryError)}`);

                // Non-rate-limit error — still try next key
                if (attempt < keys.length - 1) {
                    console.warn(`⚠️ Key ${keyLabel}: Both models failed (non-429). Trying next key...`);
                    continue;
                }
            }
        }
    }

    // All keys exhausted
    const keyCount = keys.length;
    throw new Error(
        `❌ All ${keyCount} API keys exhausted across both models.\n` +
        `Errors:\n${errors.join("\n")}\n` +
        `💡 Add more keys: GEMINI_API_KEY_${keyCount + 1} in .env.local`
    );
}
