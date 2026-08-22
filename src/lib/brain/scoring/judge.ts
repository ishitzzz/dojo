import { generateContentWithFailover, hasAnyApiKey } from "@/utils/gemini";
import { safeParseJsonArray } from "@/utils/safeJsonParser";
import type { VideoCandidate } from "@/utils/searchScraper";
import type { VideoSpec } from "@/utils/videoSpec";
import {
    scoreRubric,
    type ChapterContext,
    type RubricScore,
} from "./rubric";

// ═══════════════════════════════════════════════════════════════
// Scored Judge — replaces the old winner-only vibe-check reranker.
//
// The judge returns {videoId, score, reason}[] — scores for EVERY
// candidate it sees, never a single winnerId. Selection = highest
// combined (deterministic rubric + LLM semantic) score above a
// threshold; the remaining verdicts become UI-ordered alternatives.
// ═══════════════════════════════════════════════════════════════

export interface JudgeVerdict {
    videoId: string;
    /** 0–100 LLM semantic score. */
    score: number;
    reason: string;
}

export interface JudgeInput {
    candidates: VideoCandidate[];
    topic: string;
    userRole?: string;
    experienceLevel?: string;
    spec?: VideoSpec;
    context?: ChapterContext;
}

export interface JudgeResult {
    /** One merged score per judged candidate, sorted desc by finalScore. */
    ranked: MergedScore[];
    usedLLM: boolean;
    /** True when the LLM could not be used or its output was unusable. */
    fallbackUsed: boolean;
}

export interface MergedScore {
    videoId: string;
    finalScore: number;
    llmScore: number | null;
    rubricScore: number;
    reason: string;
    flags: string[];
}

/** Final score must be ≥ this to be selectable as winner. */
export const SELECTION_THRESHOLD = 40;

function formatCandidateForPrompt(c: VideoCandidate, r: RubricScore): string {
    const dur = `${Math.round(c.duration.seconds / 60)} min`;
    const stats = c.views > 0 ? `, ${c.views.toLocaleString()} views` : "";
    const snippet = c.transcriptSnippet?.trim()
        ? `\n   transcript: ${c.transcriptSnippet.trim().slice(0, 180)}…`
        : "";
    return [
        `- id: ${c.videoId}`,
        `  title: ${c.title}`,
        `  channel: ${c.author.name}, duration: ${dur}${stats}`,
        `  description: ${(c.description || "").slice(0, 220).replace(/\s+/g, " ") || "(none)"}`,
        `  deterministic signals: rubric=${r.score}/100 flags=[${r.flags.join(", ") || "none"}]` +
            ` durationFit=${r.breakdown.durationFit}/20 scopePenalty=${r.breakdown.scopePenalty}` +
            ` engagement=${r.breakdown.engagement}/15`,
        ...(snippet ? [snippet] : []),
    ].join("\n");
}

function buildJudgePrompt(input: JudgeInput, rubricScores: RubricScore[]): string {
    const { candidates, topic, userRole, experienceLevel, spec, context } = input;
    const rubricById = new Map(rubricScores.map((r) => [r.videoId, r]));

    const siblingLine =
        context?.siblingTitles && context.siblingTitles.length > 0
            ? `\nSIBLING CHAPTERS in the same roadmap (the learner covers these separately): ${context.siblingTitles
                  .slice(0, 10)
                  .map((t) => `"${t}"`)
                  .join(", ")}. A video covering several of these at once is OVER-SCOPED for "${topic}".`
            : "";

    const specLine = spec
        ? `\nTARGET SPEC: depth=${spec.depth}, preferred duration ${spec.expectedMinutes[0]}–${spec.expectedMinutes[1]} min (soft window), style=${spec.stylePriority.join("/")}.`
        : "";

    return `You are a strict video-selection judge for an AI learning platform.

LEARNING CHAPTER: "${topic}"
LEARNER: role=${userRole ?? "Student"}, level=${experienceLevel ?? "intermediate"}.${specLine}${siblingLine}

CANDIDATES:
${candidates.map((c) => formatCandidateForPrompt(c, rubricById.get(c.videoId)!)).join("\n\n")}

SCORE every candidate 0–100 on SEMANTIC fit only (deterministic signals are already computed and listed):
- Topic alignment: does it actually TEACH "${topic}"? Tangential subjects score <30.
- Depth match for the learner level.
- Scope discipline: penalize over-broad course content when siblings show this is one narrow chapter; reward focused treatments.
- You may reward/punish slightly relative to the provided rubric flag hints, but your score is your own judgment.

RETURN JSON ONLY — an array with EXACTLY one object per candidate, same ids:
[
  { "videoId": "<id>", "score": <0-100>, "reason": "<one specific sentence>" }
]`;
}

export async function judgeCandidates(input: JudgeInput): Promise<JudgeResult> {
    const rubricScores = input.candidates.map((c) =>
        scoreRubric({ candidate: c, spec: input.spec, context: input.context })
    );
    const rubricById = new Map(rubricScores.map((r) => [r.videoId, r]));
    const flagsById = new Map(
        input.candidates.map((c) => [
            c.videoId,
            rubricById.get(c.videoId)?.flags ?? [],
        ])
    );

    let verdicts: JudgeVerdict[] | null = null;

    if (hasAnyApiKey()) {
        try {
            const result = await generateContentWithFailover(
                buildJudgePrompt(input, rubricScores),
                {
                    temperature: 0.1,
                    maxOutputTokens: 1024,
                    responseMimeType: "application/json",
                }
            );

            const parsed = safeParseJsonArray<Partial<JudgeVerdict>>(result.text);
            if (parsed) {
                const validIds = new Set(input.candidates.map((c) => c.videoId));
                verdicts = parsed
                    .filter(
                        (v): v is JudgeVerdict =>
                            typeof v?.videoId === "string" &&
                            validIds.has(v.videoId) &&
                            typeof v?.score === "number"
                    )
                    .map((v) => ({
                        videoId: v.videoId,
                        score: Math.min(100, Math.max(0, Math.round(v.score))),
                        reason:
                            typeof v.reason === "string" && v.reason.trim().length > 0
                                ? v.reason.trim()
                                : "No reason provided",
                    }));
            }
        } catch (error) {
            console.warn("⚠️ [judge] LLM judging failed:", error);
        }
    }

    if (!verdicts || verdicts.length === 0) {
        // Deterministic-only ranking — still scored, still ordered, no blind picks.
        return {
            ranked: rubricScores
                .map((r) => ({
                    videoId: r.videoId,
                    finalScore: r.score,
                    llmScore: null,
                    rubricScore: r.score,
                    reason: "Deterministic rubric only (judge unavailable)",
                    flags: flagsById.get(r.videoId) ?? [],
                }))
                .sort((a, b) => b.finalScore - a.finalScore),
            usedLLM: false,
            fallbackUsed: true,
        };
    }

    const verdictById = new Map(verdicts.map((v) => [v.videoId, v]));

    // Candidates the judge skipped keep their pure rubric score.
    const ranked: MergedScore[] = input.candidates.map((c) => {
        const r = rubricById.get(c.videoId)!;
        const v = verdictById.get(c.videoId);
        if (!v) {
            return {
                videoId: c.videoId,
                finalScore: r.score,
                llmScore: null,
                rubricScore: r.score,
                reason: "Not judged (missing from LLM output); rubric only",
                flags: flagsById.get(c.videoId) ?? [],
            };
        }
        return {
            videoId: c.videoId,
            finalScore: Math.round(0.5 * r.score + 0.5 * v.score),
            llmScore: v.score,
            rubricScore: r.score,
            reason: v.reason,
            flags: flagsById.get(c.videoId) ?? [],
        };
    });

    ranked.sort((a, b) => b.finalScore - a.finalScore);

    return { ranked, usedLLM: true, fallbackUsed: false };
}
