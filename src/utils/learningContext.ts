/**
 * 🧠 Learning Context Utility
 * Stores and retrieves LearningContextObject in localStorage and Supabase.
 * Replaces the old role/experienceLevel pattern entirely.
 */

import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabaseClient';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type DomainType = 'technical' | 'academic' | 'creative' | 'business';
export type PriorKnowledge = 'none' | 'adjacent' | 'foundational' | 'intermediate' | 'advanced';
export type SessionLength = 'short' | 'medium' | 'long';

export interface TimeContext {
  type: 'deadline';
  date: string; // ISO date string
}

export interface LearningContextObject {
  topic: string;
  goal: string;
  domainType: DomainType;
  priorKnowledge: PriorKnowledge;
  timeContext: TimeContext | 'open-ended';
  sessionLength: SessionLength;
  successDefinition: string;
}

export interface StoredLearningContext extends LearningContextObject {
  sessionId: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'learningContext';
const SESSION_KEY = 'learningSessionId';
const SUPABASE_TABLE = 'learning_contexts';

// ═══════════════════════════════════════════════════════════════
// SESSION ID
// ═══════════════════════════════════════════════════════════════

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getSessionId(): string {
  if (typeof window === 'undefined') return generateSessionId();

  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

// ═══════════════════════════════════════════════════════════════
// LOCALSTORAGE OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the current learning context from localStorage.
 * Returns null if no context is stored.
 */
export function getContext(): LearningContextObject | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as StoredLearningContext;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Store a learning context in localStorage and Supabase.
 * Clears any previous generatedCourse to force fresh roadmap generation.
 */
export async function setContext(
  context: LearningContextObject,
  conversationTranscript?: Array<{ role: string; content: string }>
): Promise<void> {
  if (typeof window === 'undefined') return;

  const sessionId = getSessionId();
  const stored: StoredLearningContext = {
    ...context,
    sessionId,
    createdAt: new Date().toISOString(),
  };

  // Store in localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  // Clear old course data so roadmap regenerates with new context
  localStorage.removeItem('generatedCourse');

  // Persist to Supabase (fire-and-forget, don't block the UI)
  persistToSupabase(stored, conversationTranscript).catch((err) => {
    console.warn('⚠️ Failed to persist learning context to Supabase:', err);
  });
}

/**
 * Clear the current learning context from localStorage.
 */
export function clearContext(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('generatedCourse');
}

// ═══════════════════════════════════════════════════════════════
// SUPABASE PERSISTENCE
// ═══════════════════════════════════════════════════════════════

async function persistToSupabase(
  context: StoredLearningContext,
  transcript?: Array<{ role: string; content: string }>
): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.log('ℹ️ Supabase not configured — skipping persistence');
    return;
  }

  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from(SUPABASE_TABLE).insert({
      session_id: context.sessionId,
      context_object: context,
      conversation_transcript: transcript || [],
      created_at: context.createdAt,
    });

    if (error) {
      console.warn('⚠️ Supabase insert error:', error.message);
    }
  } catch (err) {
    console.warn('⚠️ Supabase persistence failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

const VALID_DOMAIN_TYPES: DomainType[] = ['technical', 'academic', 'creative', 'business'];
const VALID_PRIOR_KNOWLEDGE: PriorKnowledge[] = ['none', 'adjacent', 'foundational', 'intermediate', 'advanced'];
const VALID_SESSION_LENGTHS: SessionLength[] = ['short', 'medium', 'long'];

export function isValidContext(obj: unknown): obj is LearningContextObject {
  if (!obj || typeof obj !== 'object') return false;
  const ctx = obj as Record<string, unknown>;

  return (
    typeof ctx.topic === 'string' && ctx.topic.length > 0 &&
    typeof ctx.goal === 'string' && ctx.goal.length > 0 &&
    VALID_DOMAIN_TYPES.includes(ctx.domainType as DomainType) &&
    VALID_PRIOR_KNOWLEDGE.includes(ctx.priorKnowledge as PriorKnowledge) &&
    (ctx.timeContext === 'open-ended' || (typeof ctx.timeContext === 'object' && ctx.timeContext !== null)) &&
    VALID_SESSION_LENGTHS.includes(ctx.sessionLength as SessionLength) &&
    typeof ctx.successDefinition === 'string' && ctx.successDefinition.length > 0
  );
}
