/**
 * rateLimitDampener.ts
 *
 * Shared 429 storm dampening for both Gemini failover paths
 * (src/utils/gemini.ts + src/lib/brain/providers/gemini.ts).
 *
 * Two mechanisms:
 * 1. Jittered per-rotation backoff (400ms + random(0..600ms)), capped by a
 *    per-call budget so a full key-pool sweep adds at most ~3s of latency.
 * 2. A one-time 12s circuit-breaker cooldown when ≥6 rate limits land within
 *    a 60s window. Latched via timestamp so it fires at most once per storm.
 *
 * Success paths are untouched — helpers are only invoked after a 429.
 */

const BACKOFF_BASE_MS = 400;
const BACKOFF_JITTER_MS = 600;
const BACKOFF_BUDGET_CAP_MS = 3000;

const STORM_WINDOW_MS = 60_000;
const STORM_THRESHOLD = 6;
const STORM_COOLDOWN_MS = 12_000;

// Module-level storm tracker — shared across all requests in this process.
let stormHits = 0;
let stormWindowStart = 0;
let stormCooldownUntil = 0;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Register one 429/rate-limit response in the rolling storm window. */
export function recordRateLimitHit(): void {
    const now = Date.now();
    if (stormWindowStart === 0 || now - stormWindowStart > STORM_WINDOW_MS) {
        stormWindowStart = now;
        stormHits = 0;
    }
    stormHits++;
}

/**
 * Sleep a jittered backoff before rotating to the next attempt.
 * `budgetUsedMs` is latency already added by earlier rotations in this call;
 * returns the updated total, hard-capped at BACKOFF_BUDGET_CAP_MS.
 */
export async function rateLimitBackoff(budgetUsedMs: number): Promise<number> {
    if (budgetUsedMs >= BACKOFF_BUDGET_CAP_MS) return budgetUsedMs;

    const jittered = BACKOFF_BASE_MS + Math.floor(Math.random() * (BACKOFF_JITTER_MS + 1));
    const delay = Math.min(jittered, BACKOFF_BUDGET_CAP_MS - budgetUsedMs);
    await sleep(delay);
    return budgetUsedMs + delay;
}

/**
 * Circuit breaker: if ≥STORM_THRESHOLD rate limits occurred within the last
 * STORM_WINDOW_MS and no cooldown has fired recently, sleep STORM_COOLDOWN_MS
 * ONCE before the caller starts its next attempt sequence. Returns true when
 * the cooldown actually ran.
 */
export async function maybeStormCooldown(): Promise<boolean> {
    const now = Date.now();
    if (now < stormCooldownUntil) return false; // latched — already cooling
    if (
        stormWindowStart === 0 ||
        now - stormWindowStart > STORM_WINDOW_MS ||
        stormHits < STORM_THRESHOLD
    ) {
        return false;
    }

    stormCooldownUntil = now + STORM_COOLDOWN_MS;
    console.warn(
        `🌧️ Rate-limit storm: ${stormHits} x 429 in ${STORM_WINDOW_MS / 1000}s. Forcing one ${STORM_COOLDOWN_MS / 1000}s cooldown...`
    );
    await sleep(STORM_COOLDOWN_MS);
    stormHits = 0;
    stormWindowStart = 0;
    return true;
}
