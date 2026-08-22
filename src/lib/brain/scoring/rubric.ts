import type { VideoCandidate } from "@/utils/searchScraper";
import type { VideoSpec } from "@/utils/videoSpec";

// ═══════════════════════════════════════════════════════════════
// Rubric — deterministic scoring signals for video candidates.
//
// Soft-band philosophy: expectedMinutes is a preference window, not a
// hard wall. Inside the window = zero penalty. Just outside (±20%) =
// gentle linear penalty. Only >3x mismatches are "absurd" and get
// near-zero duration credit + a flag the caller may hard-filter on.
//
// Scope-fit: a "full course"/"complete guide" video covering an entire
// domain is WRONG for a narrow subtopic chapter. When sibling chapter
// titles are provided (proving this chapter is one slice of a roadmap),
// course-shaped videos take a heavy penalty. For depth=mastery chapters
// with a long band, broad content is intended and not penalized.
// ═══════════════════════════════════════════════════════════════

export interface ChapterContext {
    /** The specific chapter/subtopic this video is being picked for. */
    chapterTitle?: string;
    /** Sibling chapter titles in the same module/roadmap — proves narrowness. */
    siblingTitles?: string[];
}

export interface RubricInput {
    candidate: VideoCandidate;
    spec?: VideoSpec;
    context?: ChapterContext;
}

export interface RubricBreakdown {
    /** 0–20: soft duration fit vs spec.expectedMinutes. */
    durationFit: number;
    /** −35..0: scope-fit penalty for over-scoped course videos on narrow topics. */
    scopePenalty: number;
    /** 0–15: engagement quality band from likes/views. */
    engagement: number;
    /** 0–10: transcript snippet present & topic-adjacent. */
    transcriptSignal: number;
    /** ≤0: clickbait / engagement-bait penalties. */
    clickbaitPenalty: number;
}

export interface RubricScore {
    videoId: string;
    /** 0–100 deterministic score. */
    score: number;
    breakdown: RubricBreakdown;
    flags: string[];
}

/** Duration ratio beyond which a mismatch is treated as absurd (>3x window). */
const ABSURD_RATIO = 3;
const DURATION_MAX = 20;
const ENGAGEMENT_MAX = 15;
const TRANSCRIPT_MAX = 10;

const COURSE_MARKERS =
    /\b(full|complete|entire)\s+(course|tutorial|guide|bootcamp|class)\b|\ball[- ]in[- ]one\b|\bzero to hero\b|\bbeginner(s)?\s+(to|→)\s+(advanced|pro|expert)\b|\bcrash\s+course\b.*\beverything\b/i;

const BROAD_COVERAGE_MARKERS =
    /\b(everything you need|all concepts|every topic|a to z|from scratch to)\b/i;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Soft duration fit: 0..20.
 * - inside [min,max] window → full 20
 * - outside but within ±20% → lose at most ~5 points linearly
 * - up to 3x → gentle decay toward ~4
 * - beyond 3x → 0 + ABSURD flag
 */
export function scoreDurationFit(
    seconds: number,
    spec?: VideoSpec
): { fit: number; absurd: boolean } {
    if (!spec || seconds <= 0) return { fit: DURATION_MAX * 0.7, absurd: false };

    const minSec = spec.expectedMinutes[0] * 60;
    const maxSec = spec.expectedMinutes[1] * 60;

    if (seconds >= minSec && seconds <= maxSec) {
        return { fit: DURATION_MAX, absurd: false };
    }

    const ratio =
        seconds > maxSec ? seconds / maxSec : minSec / seconds;

    if (ratio <= 1.2) {
        // Gentle zone: linear, loses ≤5 points total.
        return { fit: DURATION_MAX - (ratio - 1) * 100 * 0.25, absurd: false };
    }

    if (ratio <= ABSURD_RATIO) {
        // Gentle decay from ~15 down to ~4 across (1.2x .. 3x].
        const t = (ratio - 1.2) / (ABSURD_RATIO - 1.2);
        return { fit: 15 - t * 11, absurd: false };
    }

    return { fit: 0, absurd: true };
}

/** Scope-fit penalty: 0 (fine) down to −35 (course-shaped on narrow chapter). */
export function scoreScopeFit(
    candidate: VideoCandidate,
    spec: VideoSpec | undefined,
    context: ChapterContext | undefined
): { penalty: number; flags: string[] } {
    const haystack = `${candidate.title} ${candidate.description}`;
    const isCourseShaped =
        COURSE_MARKERS.test(haystack) ||
        (BROAD_COVERAGE_MARKERS.test(haystack) && candidate.duration.seconds > 3600);

    if (!isCourseShaped) return { penalty: 0, flags: [] };

    // Mastery deep-dives with a long band are ALLOWED to be courses.
    const masteryIntent =
        spec?.depth === "mastery" || spec?.targetDurationBand === "long";
    if (masteryIntent) return { penalty: 0, flags: ["course_allowed_mastery"] };

    const hasSiblings =
        Array.isArray(context?.siblingTitles) &&
        context!.siblingTitles!.length >= 2;

    if (hasSiblings) {
        // Narrow subtopic + course-shaped video → heavy penalty.
        return {
            penalty: -35,
            flags: ["SCOPE_OVERFLOW", "broad_course_on_narrow_chapter"],
        };
    }

    // Course-shaped but no proof of narrowness → mild caution only.
    return { penalty: -8, flags: ["course_shaped_no_context"] };
}

/** Engagement quality band from like/view ratio (0..15). Falls back to views log-scale. */
export function scoreEngagement(candidate: VideoCandidate): number {
    const views = candidate.views ?? 0;
    const likes = candidate.likeCount ?? 0;

    if (views > 100 && likes > 0) {
        const ratio = likes / views;
        if (ratio >= 0.05) return ENGAGEMENT_MAX;
        if (ratio >= 0.03) return ENGAGEMENT_MAX * 0.85;
        if (ratio >= 0.02) return ENGAGEMENT_MAX * 0.65;
        if (ratio >= 0.01) return ENGAGEMENT_MAX * 0.45;
        return ENGAGEMENT_MAX * 0.25;
    }

    // No reliable stats: weak log-scale credit so big channels aren't blind-spotted.
    if (views >= 100_000) return ENGAGEMENT_MAX * 0.6;
    if (views >= 10_000) return ENGAGEMENT_MAX * 0.45;
    if (views >= 1_000) return ENGAGEMENT_MAX * 0.3;
    return ENGAGEMENT_MAX * 0.2;
}

/** Transcript presence signal (0..10). Content relevance is left to the judge LLM. */
export function scoreTranscriptSignal(candidate: VideoCandidate): number {
    const snippet = candidate.transcriptSnippet?.trim();
    if (!snippet) return 0;
    return Math.min(TRANSCRIPT_MAX, 4 + Math.min(snippet.length / 250, 6));
}

/** Clickbait penalties (≤0). Small curated list; density-rank leftovers are gone. */
const CLICKBAIT_PATTERNS: Array<[RegExp, number]> = [
    [/mind[- ]blowing|you won'?t believe|shocking (truth|result)/i, -15],
    [/\binsane\b|\bcrazy\b|\binsane(ly)? (easy|fast)\b/i, -8],
    [/#shorts?\b/i, -25],
    [/\b(giveaway|subscribe or|like and subscribe)\b/i, -10],
];

export function scoreClickbait(title: string, description: string): {
    penalty: number;
    flags: string[];
} {
    let penalty = 0;
    const flags: string[] = [];
    const haystack = `${title} ${description}`;
    for (const [pattern, cost] of CLICKBAIT_PATTERNS) {
        if (pattern.test(haystack)) {
            penalty += cost;
            flags.push(`clickbait:${pattern.source.slice(0, 24)}`);
        }
    }
    return { penalty, flags };
}

export function scoreRubric(input: RubricInput): RubricScore {
    const { candidate, spec, context } = input;

    const duration = scoreDurationFit(candidate.duration.seconds, spec);
    const scope = scoreScopeFit(candidate, spec, context);
    const clickbait = scoreClickbait(candidate.title, candidate.description);
    const engagement = scoreEngagement(candidate);
    const transcriptSignal = scoreTranscriptSignal(candidate);

    const raw =
        duration.fit +
        scope.penalty +
        engagement +
        transcriptSignal +
        clickbait.penalty;

    // Map [-60..55] raw onto 0..100 deterministically.
    const score = clamp(Math.round(((raw + 60) / 115) * 100), 0, 100);

    const flags = [...scope.flags, ...clickbait.flags];
    if (duration.absurd) flags.push("ABSURD_DURATION_MISMATCH");

    return {
        videoId: candidate.videoId,
        score,
        breakdown: {
            durationFit: Math.round(duration.fit * 10) / 10,
            scopePenalty: scope.penalty,
            engagement: Math.round(engagement * 10) / 10,
            transcriptSignal: Math.round(transcriptSignal * 10) / 10,
            clickbaitPenalty: clickbait.penalty,
        },
        flags,
    };
}

/**
 * Absurd-mismatch gate — the ONLY remaining hard filter. A candidate whose
 * duration exceeds 3x the spec window (or the global cap when no spec) can
 * never win selection; everything else passes through to soft scoring.
 */
export function isAbsurdMismatch(
    candidate: VideoCandidate,
    spec: VideoSpec | undefined,
    fallbackMaxSeconds: number
): boolean {
    const duration = scoreDurationFit(candidate.duration.seconds, spec);
    if (duration.absurd) return true;
    if (!spec && candidate.duration.seconds > fallbackMaxSeconds) return true;
    return false;
}
