/**
 * 🔌 Circuit breaker registry for transcript providers.
 *
 * When YouTube changes something and one strategy starts failing en masse,
 * it gets cooled down automatically instead of dragging every request
 * through a doomed attempt. Health self-heals: the cooldown doubles on
 * repeat trips (up to a cap) and any success resets the provider to prime.
 */

import type { ProviderName } from "./types";

const FAILURE_THRESHOLD = 3;
const BASE_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_COOLDOWN_MS = 30 * 60 * 1000;

interface BreakerState {
    consecutiveFailures: number;
    openUntil: number;
    cooldownMs: number;
}

const REGISTRY = new Map<ProviderName, BreakerState>();

function state(name: ProviderName): BreakerState {
    let s = REGISTRY.get(name);
    if (!s) {
        s = { consecutiveFailures: 0, openUntil: 0, cooldownMs: BASE_COOLDOWN_MS };
        REGISTRY.set(name, s);
    }
    return s;
}

export function canAttempt(name: ProviderName, now = Date.now()): boolean {
    return now >= state(name).openUntil;
}

export function recordSuccess(name: ProviderName): void {
    const s = state(name);
    s.consecutiveFailures = 0;
    s.openUntil = 0;
    s.cooldownMs = BASE_COOLDOWN_MS;
}

export function recordFailure(name: ProviderName): void {
    const s = state(name);
    s.consecutiveFailures += 1;
    if (s.consecutiveFailures >= FAILURE_THRESHOLD) {
        s.openUntil = Date.now() + s.cooldownMs;
        s.cooldownMs = Math.min(MAX_COOLDOWN_MS, s.cooldownMs * 2);
        s.consecutiveFailures = 0;
        console.warn(
            `⛔ [transcript] provider "${name}" tripped — cooling down until ${new Date(s.openUntil).toISOString()}`
        );
    }
}

/**
 * Stable provider order with open breakers demoted to the back (still tried
 * as a last resort — a cooled-down strategy may have healed upstream).
 */
export function orderByHealth<T extends { name: ProviderName }>(providers: T[]): T[] {
    return [...providers].sort((a, b) => Number(canAttempt(b.name)) - Number(canAttempt(a.name)));
}

/** Observability helper (debug endpoints, logs). */
export function snapshot(): Record<string, { failures: number; openForMs: number }> {
    const out: Record<string, { failures: number; openForMs: number }> = {};
    const now = Date.now();
    for (const [name, s] of REGISTRY) {
        out[name] = {
            failures: s.consecutiveFailures,
            openForMs: Math.max(0, s.openUntil - now),
        };
    }
    return out;
}
