/**
 * 🚫 Rejection Store
 * Tracks permanently disliked videos per chapter / query so get-video can
 * filter them out of every future selection, even without excludeIds.
 * In-memory only (per server instance) — pragmatic v1 alongside the
 * in-memory feedback fallback.
 *
 * Two indexes:
 * - REJECTIONS: scope key (query/chapter) → rejected video ids
 * - VIDEO_REJECTIONS: video id → set of chapter keys it was rejected for
 *   (or the GLOBAL_SCOPE sentinel when rejected without a chapter scope,
 *   meaning it must never be served anywhere).
 */

const MAX_ENTRIES = 1000;
const GLOBAL_SCOPE = "__global__";

const REJECTIONS = new Map<string, Set<string>>();
const VIDEO_REJECTIONS = new Map<string, Set<string>>();

function capMap(map: Map<string, Set<string>>): void {
    while (map.size > MAX_ENTRIES) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
    }
}

function addToMap(map: Map<string, Set<string>>, key: string, value: string): void {
    let set = map.get(key);
    if (!set) {
        set = new Set();
        // Re-insert to refresh insertion order for LRU-style eviction.
        map.delete(key);
        map.set(key, set);
    }
    set.add(value);
    capMap(map);
}

/**
 * Record a rejected video under its query key / chapter key AND by video id
 * so either scope can filter it later. When `chapterKey` is empty the video
 * is recorded as globally rejected (no chapter scope known).
 */
export function recordRejection(
    chapterKey: string,
    queryKey: string,
    videoId: string
): void {
    if (!videoId) return;
    for (const key of [queryKey, chapterKey]) {
        if (!key) continue;
        addToMap(REJECTIONS, key, videoId);
    }
    addToMap(VIDEO_REJECTIONS, videoId, chapterKey || GLOBAL_SCOPE);
}

/**
 * All video IDs rejected under the given key (empty array when none).
 */
export function getRejections(key: string): string[] {
    return Array.from(REJECTIONS.get(key) ?? []);
}

/**
 * True when this video may NOT be served: it was rejected with no chapter
 * scope (global), or rejected specifically for `chapterKey`.
 */
export function isRejectedForChapter(videoId: string, chapterKey?: string): boolean {
    const scopes = VIDEO_REJECTIONS.get(videoId);
    if (!scopes) return false;
    if (scopes.has(GLOBAL_SCOPE)) return true;
    return Boolean(chapterKey && scopes.has(chapterKey));
}
