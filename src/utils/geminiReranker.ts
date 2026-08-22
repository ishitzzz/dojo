/**
 * 🧠 Gemini Reranker
 * Uses Gemini 1.5 Flash-Lite to perform semantic reranking
 * of video candidates based on Information Density.
 */

import { generateContentWithFailover } from "@/utils/gemini";
import { safeParseJsonObject, safeParseJsonArray } from "@/utils/safeJsonParser";

export interface RerankerInput {
    candidates: string;  // Formatted string of video metadata
    userRole: string;
    topic: string;
    experienceLevel: string;
}

export interface RerankerResult {
    winnerId: string | null;
    reasoning?: string;
    fallbackUsed: boolean;
}

/**
 * The "Vibe-Check" Reranker
 * Sends top candidates to Gemini and asks for the most technically dense video.
 */
export async function vibeCheckRerank(
    input: RerankerInput
): Promise<RerankerResult> {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("⚠️ No Gemini API key, using heuristic fallback");
        return { winnerId: null, fallbackUsed: true };
    }

    try {
        const prompt = buildRerankerPrompt(input);
        const result = await generateContentWithFailover(prompt, {
            temperature: 0.1,  // Low temperature for consistent results
            maxOutputTokens: 256,
            responseMimeType: "application/json",
        });

        const data = safeParseJsonObject<{ winnerId: string; reasoning: string }>(result.text);

        if (data?.winnerId && data.winnerId.length >= 10 && data.winnerId.length <= 12) {
            return {
                winnerId: data.winnerId.trim(),
                reasoning: data.reasoning || "Selected by Gemini Reranker",
                fallbackUsed: false,
            };
        }

        // Try to recover: Gemini might return a wrapped/quoted ID
        if (data?.winnerId) {
            const cleaned = data.winnerId.replace(/['"` ]/g, "").trim();
            if (cleaned.length >= 10 && cleaned.length <= 12) {
                return {
                    winnerId: cleaned,
                    reasoning: data.reasoning || "Selected by Gemini Reranker",
                    fallbackUsed: false,
                };
            }
        }

        console.warn("⚠️ Could not parse Gemini response:", result.text.slice(0, 100));
        return { winnerId: null, fallbackUsed: true };

    } catch (error) {
        console.error("❌ Gemini Reranker Error:", error);
        return { winnerId: null, fallbackUsed: true };
    }
}

/**
 * Build the reranker prompt with specific criteria
 */
function buildRerankerPrompt(input: RerankerInput): string {
    return `You are a Technical Content Curator for an AI learning platform.

CONTEXT:
- User Role: ${input.userRole}
- Learning Topic: ${input.topic}
- Depth Level: ${input.experienceLevel}

TASK:
Analyze these YouTube video candidates and select the ONE with the highest Information Density.

CANDIDATES:
${input.candidates}

RANKING CRITERIA (CRITICAL):
        1. 🎯 **TOPIC ALIGNMENT (The "Topic Police")**: 
           - Does the video actually TEACH "${input.topic}"?
           - **REJECT (Score 0)** if the video is about a *different* subject (e.g. "Deep Learning") even if it mentions the topic.
           - The video MUST be *conceptually* aligned with: ${input.topic}
        
        2. ⏳ **PACING & DURATION**:
           - **Concept Phase (Modules 1-2)**: Prefer 5-15 mins. **PENALIZE > 20 mins**.
           - **Implementation Phase**: Prefer 10-30 mins.
           - **Mastery Phase**: Long videos allowed.
        
        3. 🧬 **METADATA Matches**: "Official Topics" and "Tags".
        4. 👂 **TRANSCRIPT Matches**: Intro text aligns with intent.

        RETURN JSON ONLY:
        {
          "winnerId": "11-char-video-id",
          "reasoning": "Reason..."
        }
        
        Select the best video now:`;
}

/**
 * Generate expanded search queries using Gemini
 */
export async function generateExpandedQueries(
    topic: string,
    userRole: string,
    experienceLevel: string
): Promise<string[] | null> {
    if (!process.env.GEMINI_API_KEY) {
        return null;
    }

    try {
        const prompt = `You are a YouTube Search Query Optimizer for technical education.

CONTEXT:
- Topic: "${topic}"
- User: ${userRole}
- Depth: ${experienceLevel}

TASK:
Generate 3 diverse YouTube search queries that will find HIGH-QUALITY technical videos.
Each query should target a different aspect of learning.

RULES:
1. Include anti-clickbait terms: -shorts -reaction -giveaway
2. For "${experienceLevel}" level, ${experienceLevel === "Deep Dive" ? "focus on comprehensive, documentation-style content" : experienceLevel === "Project Based" ? "focus on hands-on building and implementation" : "focus on clear introductory explanations"}
3. For "${userRole}" role, ${userRole === "Student" ? "use beginner-friendly terms" : userRole === "Professional" ? "use advanced architecture terms" : "use practical business implementation terms"}

Return JSON array:
{
  "queries": [
    { "type": "conceptual", "query": "..." },
    { "type": "implementation", "query": "..." },
    { "type": "troubleshooting", "query": "..." }
  ]
}`;

        const result = await generateContentWithFailover(prompt, {
            temperature: 0.7,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
        });
        const data = safeParseJsonObject<{ queries: { query: string }[] }>(result.text);

        if (!data || !Array.isArray(data.queries)) {
            console.warn("⚠️ Query expansion returned invalid structure:", result.text);
            return null;
        }

        return data.queries.map((q) => q.query);

    } catch (error) {
        console.error("❌ Query Expansion Error:", error);
        return null;
    }
}

/**
 * Analyze transcript for technical density
 */
export async function analyzeTranscriptDensity(
    transcript: string,
    topic: string
): Promise<{ score: number; summary: string } | null> {
    if (!process.env.GEMINI_API_KEY || !transcript) {
        return null;
    }

    try {
        // Only analyze first 2000 chars to save tokens
        const truncatedTranscript = transcript.slice(0, 2000);

        const prompt = `Analyze this transcript snippet for technical Information Density.
Topic: "${topic}"

TRANSCRIPT:
${truncatedTranscript}

Score on a scale of 1-100:
- 1-30: Basic/surface level, entertainment focused
- 31-60: Moderate depth, good explanation
- 61-80: High density, technical details, examples
- 81-100: Expert level, documentation quality, code examples

Return JSON:
{
  "score": <number>,
  "summary": "<brief assessment>"
}`;

        const result = await generateContentWithFailover(prompt, {
            temperature: 0.1,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
        });

        return safeParseJsonObject<{ score: number; summary: string }>(result.text);

    } catch (error) {
        console.error("❌ Transcript Analysis Error:", error);
        return null;
    }
}
