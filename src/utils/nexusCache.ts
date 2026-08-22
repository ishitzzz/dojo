/**
 * 🗄️ Nexus Cache — Supabase-backed caching for Nexus API responses.
 * 
 * Part of ILS (Intelligent Librarian System).
 * Prevents redundant Gemini API calls by caching nexus graph responses.
 * Uses a hash of the user's query as the cache key.
 * 
 * Table Schema (create in Supabase):
 * CREATE TABLE nexus_cache (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   query_hash TEXT UNIQUE NOT NULL,
 *   user_goal TEXT NOT NULL,
 *   response_data JSONB NOT NULL,
 *   hit_count INT DEFAULT 1,
 *   created_at TIMESTAMPTZ DEFAULT now(),
 *   last_accessed_at TIMESTAMPTZ DEFAULT now()
 * );
 * CREATE INDEX idx_nexus_cache_hash ON nexus_cache(query_hash);
 */

import { isSupabaseConfigured, getSupabaseServerClient } from "@/utils/supabaseClient";

// In-memory L1 cache (survives only during server lifetime)
const MEMORY_CACHE = new Map<string, { data: any; timestamp: number }>();
const MEMORY_TTL = 1000 * 60 * 60; // 1 hour

// Supabase cache TTL
const SUPABASE_TTL_HOURS = 72; // 3 days

/**
 * Generate a simple hash from the user's goal string.
 * Used as the cache key.
 */
function hashQuery(goal: string): string {
    const normalized = goal.toLowerCase().trim().replace(/\s+/g, " ");
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
    }
    return `nexus_${Math.abs(hash).toString(36)}`;
}

/**
 * Check if a cached Nexus response exists for this goal.
 * Checks L1 (memory) first, then L2 (Supabase).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkNexusCache(userGoal: string): Promise<{ found: boolean; data?: any }> {
    const queryHash = hashQuery(userGoal);

    // L1: Memory cache
    const memCached = MEMORY_CACHE.get(queryHash);
    if (memCached && Date.now() - memCached.timestamp < MEMORY_TTL) {
        console.log(`⚡ Nexus Cache L1 (memory) hit for: "${userGoal.slice(0, 30)}..."`);
        return { found: true, data: memCached.data };
    }

    // L2: Supabase
    if (isSupabaseConfigured()) {
        try {
            const supabase = getSupabaseServerClient();
            const { data, error } = await supabase
                .from("nexus_cache")
                .select("response_data, created_at")
                .eq("query_hash", queryHash)
                .single();

            if (error || !data) return { found: false };

            // Check TTL
            const createdAt = new Date(data.created_at).getTime();
            const age = (Date.now() - createdAt) / (1000 * 60 * 60);
            if (age > SUPABASE_TTL_HOURS) {
                console.log(`🕐 Nexus Cache L2 expired (${Math.round(age)}h old)`);
                return { found: false };
            }

            console.log(`💾 Nexus Cache L2 (Supabase) hit for: "${userGoal.slice(0, 30)}..."`);

            // Update hit count and last_accessed
            await supabase
                .from("nexus_cache")
                .update({
                    hit_count: (data as any).hit_count ? (data as any).hit_count + 1 : 2,
                    last_accessed_at: new Date().toISOString(),
                })
                .eq("query_hash", queryHash);

            // Promote to L1
            MEMORY_CACHE.set(queryHash, { data: data.response_data, timestamp: Date.now() });

            return { found: true, data: data.response_data };
        } catch (err) {
            console.warn("⚠️ Nexus Cache L2 check error:", err);
        }
    }

    return { found: false };
}

/**
 * Store a Nexus API response in the cache.
 * Writes to both L1 (memory) and L2 (Supabase).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function storeNexusCache(userGoal: string, responseData: any): Promise<void> {
    const queryHash = hashQuery(userGoal);

    // L1: Always store in memory
    MEMORY_CACHE.set(queryHash, { data: responseData, timestamp: Date.now() });

    // L2: Store in Supabase if configured
    if (isSupabaseConfigured()) {
        try {
            const supabase = getSupabaseServerClient();
            await supabase
                .from("nexus_cache")
                .upsert({
                    query_hash: queryHash,
                    user_goal: userGoal,
                    response_data: responseData,
                    hit_count: 1,
                    created_at: new Date().toISOString(),
                    last_accessed_at: new Date().toISOString(),
                }, {
                    onConflict: "query_hash",
                });

            console.log(`📦 Nexus Cache stored: "${userGoal.slice(0, 30)}..." → ${queryHash}`);
        } catch (err) {
            console.warn("⚠️ Nexus Cache store error:", err);
        }
    }
}
