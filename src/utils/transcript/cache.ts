/**
 * 🗄️ Transcript vault — two-tier cache.
 *
 * Transcripts are effectively immutable per video, so every fetch should
 * happen once, ever. Tier 1 is an in-process LRU; tier 2 is Supabase
 * (`transcript_vault` table) when SUPABASE_URL/KEY are configured — same
 * graceful-degradation pattern as videoVault.ts.
 *
 * Negative results ("verified caption-less") are cached too as short-TTL
 * tombstones so ASR isn't re-run and YouTube isn't re-hammered for videos
 * that will never yield captions.
 */

import type { TranscriptResult } from "./types";

const MEMORY_MAX_ENTRIES = 500;
const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

interface MemoryEntry {
    value: TranscriptResult | { tombstone: true };
    storedAt: number;
}

const MEMORY = new Map<string, MemoryEntry>();

function memoryKey(videoId: string, lang: string): string {
    return `${videoId}|${lang || "default"}`;
}

function touchMemory(key: string, entry: MemoryEntry): void {
    MEMORY.delete(key);
    MEMORY.set(key, entry);
    if (MEMORY.size > MEMORY_MAX_ENTRIES) {
        const oldest = MEMORY.keys().next().value;
        if (oldest !== undefined) MEMORY.delete(oldest);
    }
}

function isFresh(entry: MemoryEntry): boolean {
    const ttl = "tombstone" in entry.value ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS;
    return Date.now() - entry.storedAt < ttl;
}

export function getMemory(
    videoId: string,
    lang: string
): TranscriptResult | { tombstone: true } | null {
    const key = memoryKey(videoId, lang);
    const entry = MEMORY.get(key);
    if (!entry) return null;
    if (!isFresh(entry)) {
        MEMORY.delete(key);
        return null;
    }
    touchMemory(key, entry);
    return entry.value;
}

export function setMemory(value: TranscriptResult | { tombstone: true }, videoId: string, lang: string): void {
    touchMemory(memoryKey(videoId, lang), { value, storedAt: Date.now() });
}

export function clearMemory(): void {
    MEMORY.clear();
}

// ═══════════════════════════════════════════════════════════════
// TIER 2 — Supabase (optional)
// ═══════════════════════════════════════════════════════════════

function supabaseConfigured(): boolean {
    return !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
}

async function supabaseClient() {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
}

export async function getCached(
    videoId: string,
    lang: string
): Promise<TranscriptResult | { tombstone: true } | null> {
    const memory = getMemory(videoId, lang);
    if (memory) return memory;

    if (!supabaseConfigured()) return null;

    try {
        const supabase = await supabaseClient();
        const { data, error } = await supabase
            .from("transcript_vault")
            .select("payload, tombstone, stored_at")
            .eq("video_id", videoId)
            .eq("lang", lang || "default")
            .limit(1);

        if (error) throw error;

        const row = data?.[0];
        if (!row) return null;

        const storedAt = new Date(row.stored_at).getTime();
        const ttl = row.tombstone ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS;
        if (Date.now() - storedAt >= ttl) return null;

        const value = row.tombstone ? ({ tombstone: true } as const) : (row.payload as TranscriptResult);
        setMemory(value, videoId, lang);
        return value;
    } catch (error) {
        console.warn("⚠️ [transcript] vault read failed:", error);
        return null;
    }
}

export async function setCached(
    value: TranscriptResult | { tombstone: true },
    videoId: string,
    lang: string
): Promise<void> {
    setMemory(value, videoId, lang);

    if (!supabaseConfigured()) return;

    try {
        const supabase = await supabaseClient();
        const payload = "tombstone" in value ? null : value;
        const { error } = await supabase.from("transcript_vault").upsert(
            {
                video_id: videoId,
                lang: lang || "default",
                payload,
                source: payload ? payload.source : null,
                tombstone: "tombstone" in value,
                stored_at: new Date().toISOString(),
            },
            { onConflict: "video_id,lang" }
        );
        if (error) throw error;
    } catch (error) {
        console.warn("⚠️ [transcript] vault write failed:", error);
    }
}
