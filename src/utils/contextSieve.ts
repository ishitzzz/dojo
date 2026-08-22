/**
 * 🧹 Context Sieve — ILS Ambiguity Detection
 * 
 * "Clarify Before Paint" — Detects if a user's goal is too vague
 * and generates disambiguation chips BEFORE burning a full Gemini call.
 * 
 * Flow:
 * 1. Query Intelligence checks if query is specific enough (FREE)
 * 2. If ambiguous → lightweight Gemini call generates "Choice Chips"
 * 3. If clear → skip entirely (ZERO latency added)
 * 
 * This PREVENTS wasted expensive generation calls on wrong interpretations.
 */

import { extractMeaning } from "@/utils/queryIntelligence";
import { generateContentWithFailover } from "@/utils/gemini";
import { safeParseJsonArray } from "@/utils/safeJsonParser";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ChoiceChip {
    label: string;        // e.g., "🎨 UI/UX Design"
    clarifiedGoal: string; // e.g., "Learn UI/UX Design for websites"
    preview: string;      // e.g., "Colors, typography, layouts, Figma"
}

export interface SieveResult {
    isAmbiguous: boolean;
    chips?: ChoiceChip[];
    originalGoal: string;
    reason?: string;
}

// ═══════════════════════════════════════════════════════════════
// BROAD WORDS — Single words that ALWAYS need disambiguation
// ═══════════════════════════════════════════════════════════════

const BROAD_WORDS = new Set([
    "design", "programming", "coding", "development", "engineering",
    "science", "art", "music", "writing", "business", "marketing",
    "data", "security", "networking", "architecture", "language",
    "management", "analysis", "testing", "modeling", "computing",
    "finance", "trading", "health", "psychology", "philosophy",
    "photography", "animation", "cooking", "fitness", "math",
    "mathematics", "physics", "chemistry", "biology", "economics",
]);

// ═══════════════════════════════════════════════════════════════
// LAYER 0: AMBIGUITY DETECTION (Deterministic, FREE)
// ═══════════════════════════════════════════════════════════════

/**
 * Determines if a query is ambiguous using Query Intelligence.
 * This is FREE — no AI call needed.
 * 
 * Returns true if the query is too vague to generate a useful nexus.
 */
function isQueryAmbiguous(goal: string): { ambiguous: boolean; reason: string } {
    const meaning = extractMeaning(goal);
    const words = goal.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1);

    // Rule 1: Single word that's in our "broad" list
    if (words.length === 1 && BROAD_WORDS.has(words[0])) {
        return { ambiguous: true, reason: `"${words[0]}" has multiple meanings` };
    }

    // Rule 2: Two words but one is just "learn/understand" + a broad word
    if (words.length === 2 && meaning.subjects.length === 1 && BROAD_WORDS.has(meaning.subjects[0])) {
        return { ambiguous: true, reason: `"${meaning.subjects[0]}" needs specificity` };
    }

    // Rule 3: Very few meaningful subjects extracted (< 2) AND no clear intent
    if (meaning.subjects.length < 2 && meaning.intent === "understand_concept" && !meaning.timeframe) {
        // Check if the single subject is broad
        if (meaning.subjects.length === 1 && BROAD_WORDS.has(meaning.subjects[0])) {
            return { ambiguous: true, reason: `Only 1 broad subject detected` };
        }
    }

    // Everything else is clear enough
    return { ambiguous: false, reason: "Query is specific enough" };
}

// ═══════════════════════════════════════════════════════════════
// CHIP GENERATION (Lightweight AI call, only when needed)
// ═══════════════════════════════════════════════════════════════

/**
 * Generates disambiguation "Choice Chips" using Gemini Flash-Lite.
 * This is a TINY prompt — ~100 tokens in, ~200 tokens out.
 * Much cheaper than generating an entire wrong nexus.
 */
async function generateChips(goal: string): Promise<ChoiceChip[]> {
    const prompt = `The user typed "${goal}" as their learning goal. This is too vague.
Generate exactly 4 specific interpretations as JSON array.
Each has: label (with emoji, max 3 words), clarifiedGoal (specific goal, 5-8 words), preview (comma-separated skills, max 5 words).

Example for "design":
[
  {"label":"🎨 UI/UX Design","clarifiedGoal":"Learn UI/UX design for websites","preview":"Figma, layouts, typography, colors"},
  {"label":"🏗️ System Design","clarifiedGoal":"Learn system design for software","preview":"Scalability, databases, APIs"},
  {"label":"👗 Fashion Design","clarifiedGoal":"Learn fashion design fundamentals","preview":"Sketching, fabrics, patterns"},
  {"label":"🏠 Interior Design","clarifiedGoal":"Learn interior design basics","preview":"Spaces, color theory, furniture"}
]

Now generate for "${goal}". Return ONLY the JSON array, no other text.`;

    try {
        const result = await generateContentWithFailover(prompt, {
            responseMimeType: "application/json",
            temperature: 0.5,
            maxOutputTokens: 400,
        });

        const parsed = safeParseJsonArray<ChoiceChip>(result.text);

        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
            return parsed.slice(0, 4);
        }
    } catch (err) {
        console.warn("⚠️ Context Sieve: Chip generation failed, passing through:", err);
    }

    // Fallback: no chips, let the query through
    return [];
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Run the Context Sieve on a user's goal.
 * 
 * - Clear queries: Returns immediately (0ms, 0 cost)
 * - Ambiguous queries: Generates chips (~500ms, tiny cost)
 * 
 * This SAVES money by preventing wasted full-generation calls.
 */
export async function sieveGoal(goal: string): Promise<SieveResult> {
    // Step 1: Deterministic check (FREE)
    const { ambiguous, reason } = isQueryAmbiguous(goal);

    if (!ambiguous) {
        console.log(`✅ Context Sieve: "${goal.slice(0, 30)}..." is clear. Passing through.`);
        return { isAmbiguous: false, originalGoal: goal, reason };
    }

    // Step 2: Generate chips (cheap AI call)
    console.log(`🧹 Context Sieve: "${goal}" is ambiguous (${reason}). Generating chips...`);
    const chips = await generateChips(goal);

    if (chips.length === 0) {
        // If chip generation fails, let the query through
        return { isAmbiguous: false, originalGoal: goal, reason: "Chip generation failed, passing through" };
    }

    return {
        isAmbiguous: true,
        chips,
        originalGoal: goal,
        reason,
    };
}
