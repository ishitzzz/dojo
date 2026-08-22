/**
 * 🚦 Concurrency + retry primitives.
 *
 * YouTube rate-limits aggressive parallel fetching (429s / temporary IP
 * blocks), so every outbound burst goes through the limiter and flaky calls
 * get bounded jittered retries.
 */

export class TransientError extends Error {
    readonly cause_: unknown;
    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = "TransientError";
        this.cause_ = cause;
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    /** Errors that should abort immediately without retry. */
    nonRetriable?: (error: unknown) => boolean;
}

/**
 * Retry with exponential backoff + full jitter. Anything wrapped in (or
 * matching) TransientError is retried; unexpected errors are retried too but
 * callers can opt out via `nonRetriable`.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    opts: RetryOptions = {}
): Promise<T> {
    const attempts = opts.attempts ?? 3;
    const base = opts.baseDelayMs ?? 400;
    const max = opts.maxDelayMs ?? 8_000;

    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (opts.nonRetriable?.(error)) break;
            if (attempt === attempts - 1) break;
            const exponential = Math.min(max, base * 2 ** attempt);
            const jittered = Math.random() * exponential;
            await sleep(jittered);
        }
    }
    throw lastError;
}

/**
 * Map over items with a hard concurrency cap, preserving input order in the
 * result array. Worker failures reject the whole batch (callers decide).
 */
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index], index);
        }
    });

    await Promise.all(runners);
    return results;
}
