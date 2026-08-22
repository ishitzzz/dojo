/**
 * ⚡ Shared Quick Cache
 * Extracted from src/app/api/get-video/route.ts (pure refactor, identical
 * Map + TTL semantics) so the feedback route can invalidate entries.
 */

import { deleteVaultEntry } from "@/utils/videoVault";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface QuickCacheEntry {
    videos?: any[];
    videoId?: string;
    timestamp: number;
}

const QUICK_CACHE = new Map<string, QuickCacheEntry>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export function getFreshCacheEntry(key: string): QuickCacheEntry | undefined {
    const entry = QUICK_CACHE.get(key);
    return entry && Date.now() - entry.timestamp < CACHE_TTL ? entry : undefined;
}

export function setCacheEntry(key: string, entry: Omit<QuickCacheEntry, "timestamp">): void {
    QUICK_CACHE.set(key, { ...entry, timestamp: Date.now() });
}

function entryContainsVideoId(entry: QuickCacheEntry | undefined, videoId: string): boolean {
    if (!entry) return false;
    if (entry.videoId === videoId) return true;
    return Boolean(
        entry.videos?.some((v) => v && String(v.videoId) === videoId)
    );
}

/**
 * Purge every quick-cache entry containing the rejected `videoId` — no
 * exact cacheKey match required, since clients cannot echo server keys.
 * Also removes the underlying video from the vault (local maps + best-effort
 * Supabase delete).
 */
export async function invalidateVideoCaches(videoId: string): Promise<void> {
    if (!videoId) return;

    for (const [key, entry] of QUICK_CACHE.entries()) {
        if (entryContainsVideoId(entry, videoId)) {
            QUICK_CACHE.delete(key);
            console.log(`🗑️ Invalidated quick-cache entry ${key.slice(0, 40)}... (contains rejected ${videoId})`);
        }
    }

    try {
        await deleteVaultEntry(videoId);
    } catch (error) {
        console.warn("⚠️ Cache invalidation: vault delete failed:", error);
    }
}
