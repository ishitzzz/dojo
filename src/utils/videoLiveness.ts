/**
 * videoLiveness.ts
 *
 * Quota-free YouTube video liveness check via the public oEmbed endpoint.
 * https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json
 *   → 200 for live/public videos
 *   → 400/401/404 for dead/private/unavailable ones
 *
 * NO API key, NO quota — unlike the Data API enrichment path, this works
 * even when the YouTube quota is exhausted (which is exactly when dead
 * yt-search ids currently slip through).
 *
 * Results are memoized in a module-level Map keyed by videoId with a 24h
 * TTL so repeated requests / cache hits don't re-probe the same video.
 */

const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface LivenessEntry {
  alive: boolean;
  checkedAt: number;
}

// Module-level singleton — survives across requests in a warm serverless/
// node process. Bounded lazily by TTL eviction on read/write.
const oembedCache = new Map<string, LivenessEntry>();

function getCached(videoId: string): boolean | undefined {
  const entry = oembedCache.get(videoId);
  if (!entry) return undefined;
  if (Date.now() - entry.checkedAt > CACHE_TTL_MS) {
    oembedCache.delete(videoId);
    return undefined;
  }
  return entry.alive;
}

export async function isVideoAlive(
  videoId: string,
  timeoutMs = 5000
): Promise<boolean> {
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return false;

  const cached = getCached(videoId);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const target = encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    );
    const res = await fetch(`${OEMBED_ENDPOINT}?url=${target}&format=json`, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LearningDojoBot/1.0)" },
    });
    // 200 = live & embeddable-public. 400/401/403/404 = dead/private.
    const alive = res.status === 200;
    oembedCache.set(videoId, { alive, checkedAt: Date.now() });
    return alive;
  } catch {
    // Network error / timeout: inconclusive. Treat as alive so a flaky
    // network can never empty the pool — only a definitive non-200 kills
    // a candidate.
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks many ids in parallel. Returns the set of ALIVE ids.
 */
export async function filterAliveVideoIds(
  videoIds: string[],
  timeoutMs = 5000
): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(videoIds.filter(Boolean)));
  const verdicts = await Promise.all(
    uniqueIds.map(async (id) => ({
      id,
      alive: await isVideoAlive(id, timeoutMs),
    }))
  );
  return new Set(verdicts.filter((v) => v.alive).map((v) => v.id));
}
