/**
 * 🔌 Supabase Client
 * Singleton client for database operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Server-side service role key (for API routes)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Singleton instances
let browserClient: SupabaseClient | null = null;
let serverClient: SupabaseClient | null = null;

/**
 * Get the Supabase client for browser-side operations.
 * Uses the anon key with RLS.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)');
    }

    if (!browserClient) {
        browserClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
            },
        });
    }

    return browserClient;
}

/**
 * Get the Supabase client for server-side operations.
 * Uses the service role key to bypass RLS.
 */
export function getSupabaseServerClient(): SupabaseClient {
    if (!supabaseUrl) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
    }

    // Prefer service role key, fall back to anon key
    const key = supabaseServiceKey || supabaseAnonKey;

    if (!key) {
        throw new Error('Missing Supabase key (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
    }

    if (!serverClient) {
        serverClient = createClient(supabaseUrl, key, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });
    }

    return serverClient;
}

/**
 * Check if Supabase is properly configured.
 */
export function isSupabaseConfigured(): boolean {
    return !!(supabaseUrl && (supabaseAnonKey || supabaseServiceKey));
}
