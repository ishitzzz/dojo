/**
 * 🎯 M3.2 Beat-Chapterization
 *
 * Splits a genuinely long video's transcript into 8–12 minute "beats"
 * (chapters). Each beat carries a title, focus summary, and a comprehension
 * check that gates progression (learner flow lands in future milestones).
 *
 * Guarantees:
 * - NEVER fabricates beats: no transcript → `{ status: "no_transcript" }`.
 * - No Gemini key / bad output → deterministic DEGRADED MODE beats.
 */

import { fetchTranscriptSegments } from "@/utils/transcriptClient";
import { generateContentWithFailover, hasAnyApiKey } from "@/utils/gemini";
import { safeParseJsonArray } from "@/utils/safeJsonParser";
import type { VideoSpec } from "@/utils/videoSpec";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type CheckType = "question" | "summary" | "flowchart" | "mini_game";

export interface ComprehensionCheck {
    type: CheckType;
    prompt: string;
}

export interface VideoBeat {
    /** Zero-based beat position. */
    index: number;
    startSec: number;
    endSec: number;
    title: string;
    focus: string;
    comprehensionCheck: ComprehensionCheck;
}

export interface BuildBeatsOk {
    status: "ok";
    videoId: string;
    totalDurationSec: number;
    beats: VideoBeat[];
}

export interface BuildBeatsNoTranscript {
    status: "no_transcript";
    videoId: string;
}

export type BuildBeatsResult = BuildBeatsOk | BuildBeatsNoTranscript;

export interface BuildBeatsOpts {
    videoId: string;
    topic?: string;
}

interface RawCheck {
    type?: unknown;
    prompt?: unknown;
}

interface RawBeatMeta {
    index?: unknown;
    title?: unknown;
    focus?: unknown;
    check?: RawCheck;
}

// ═══════════════════════════════════════════════════════════════
// ELIGIBILITY
// ═══════════════════════════════════════════════════════════════

const BEAT_SPLIT_MIN_DURATION_SEC = 2400; // 40 minutes

/** True when the video is long AND the learner asked for depth/band that merits digest pacing. */
export function shouldBeatSplit(
    durationSeconds: number,
    spec?: VideoSpec
): boolean {
    if (!(durationSeconds > BEAT_SPLIT_MIN_DURATION_SEC)) return false;
    return spec?.depth === "mastery" || spec?.targetDurationBand === "long";
}

// ═══════════════════════════════════════════════════════════════
// BEAT WINDOWING
// ═══════════════════════════════════════════════════════════════

const BEAT_TARGET_MS = 10 * 60 * 1000;
const BEAT_MAX_MS = 12 * 60 * 1000;
const NATURAL_GAP_MS = 800;

interface SegmentRange {
    startIdx: number;
    endIdx: number; // inclusive
}

/**
 * Greedy windowing: accumulate segments until adding the next would push the
 * beat past 12 minutes from its start, then close at the last natural gap
 * (a pause > 0.8s between segments), falling back to the latest segment.
 */
function windowSegments(
    offsets: number[],
    durations: number[]
): SegmentRange[] {
    const ranges: SegmentRange[] = [];
    const n = offsets.length;
    let startIdx = 0;

    while (startIdx < n) {
        const beatStartMs = offsets[startIdx];
        let lastIdx = startIdx;
        let lastNaturalBreak = -1;

        let i = startIdx;
        while (i < n) {
            const segEndMs = offsets[i] + durations[i];
            if (segEndMs - beatStartMs > BEAT_MAX_MS) break;
            lastIdx = i;
            const nextOffset = i + 1 < n ? offsets[i + 1] : Number.POSITIVE_INFINITY;
            const gapAfter = nextOffset - segEndMs;
            const elapsed = segEndMs - beatStartMs;
            if (
                i + 1 < n &&
                gapAfter > NATURAL_GAP_MS &&
                elapsed >= BEAT_TARGET_MS
            ) {
                lastNaturalBreak = i;
            }
            i++;
        }

        // Final stretch of the video — take everything that's left.
        if (lastIdx >= n - 1) {
            ranges.push({ startIdx, endIdx: n - 1 });
            break;
        }

        const closeAt =
            lastNaturalBreak >= startIdx ? lastNaturalBreak : lastIdx;
        ranges.push({ startIdx, endIdx: closeAt });
        startIdx = closeAt + 1;
    }

    return ranges;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** First-sentence-ish slice, capped at maxChars. */
function firstSentenceSlice(text: string, maxChars: number): string {
    const trimmed = text.trim();
    if (trimmed.length <= maxChars) return trimmed;
    const windowText = trimmed.slice(0, maxChars);
    const sentenceEnd = Math.max(
        windowText.lastIndexOf(". "),
        windowText.lastIndexOf("! "),
        windowText.lastIndexOf("? ")
    );
    if (sentenceEnd >= Math.floor(maxChars * 0.3)) {
        return windowText.slice(0, sentenceEnd + 1);
    }
    return `${windowText.slice(0, maxChars - 3).trimEnd()}...`;
}

function degradedTitle(index: number): string {
    return `Part ${index + 1}`;
}

function degradedCheck(index: number): ComprehensionCheck {
    return {
        type: "summary",
        prompt: `Summarize Part ${index + 1} in your own words`,
    };
}

const VALID_CHECK_TYPES: readonly CheckType[] = [
    "question",
    "summary",
    "flowchart",
    "mini_game",
];

function coerceCheck(raw: RawCheck | undefined): ComprehensionCheck | null {
    if (!raw || typeof raw !== "object") return null;
    const type = typeof raw.type === "string" ? raw.type : undefined;
    const prompt =
        typeof raw.prompt === "string" && raw.prompt.trim().length > 0
            ? raw.prompt.trim()
            : undefined;
    if (!type || !prompt) return null;
    if (!(VALID_CHECK_TYPES as readonly string[]).includes(type)) return null;
    return { type: type as CheckType, prompt };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

export async function buildBeats(opts: BuildBeatsOpts): Promise<BuildBeatsResult> {
    const { videoId, topic } = opts;

    // (b) Transcript failure → honest no_transcript, never fabricate.
    let segments;
    try {
        segments = await fetchTranscriptSegments(videoId);
    } catch {
        return { status: "no_transcript", videoId };
    }

    if (segments.length === 0) {
        return { status: "no_transcript", videoId };
    }

    const offsets = segments.map((s) => s.offsetMs);
    const durations = segments.map((s) => s.durationMs);
    const ranges = windowSegments(offsets, durations);

    const lastSegment = segments[segments.length - 1];
    const totalDurationSec = Math.round(
        (lastSegment.offsetMs + lastSegment.durationMs) / 1000
    );

    // Truncated transcripts fed to Gemini (~1200 chars per beat).
    const beatTexts = ranges.map((range) => {
        const joined = segments
            .slice(range.startIdx, range.endIdx + 1)
            .map((s) => s.text)
            .join(" ");
        return joined.slice(0, 1200);
    });

    // Default: deterministic DEGRADED MODE metadata.
    const titles: string[] = ranges.map((_, i) => degradedTitle(i));
    const focuses: string[] = beatTexts.map((text) =>
        firstSentenceSlice(text, 160)
    );
    const checks: ComprehensionCheck[] = ranges.map((_, i) => degradedCheck(i));

    if (hasAnyApiKey()) {
        try {
            const beatList = beatTexts
                .map((text, i) => `--- Beat ${i} ---\n${text}`)
                .join("\n\n");

            const prompt =
                `You are chapterizing a long educational video${topic ? ` about "${topic}"` : ""}. ` +
                `The transcript was split into ${ranges.length} sequential beats of 8-12 minutes each.\n\n` +
                `${beatList}\n\n` +
                `For EACH beat, return an object with:\n` +
                `- "index": the beat number shown above\n` +
                `- "title": a punchy 3-7 word chapter title\n` +
                `- "focus": one sentence (max 160 chars) describing what this beat teaches\n` +
                `- "check": an object {"type": "question"|"summary"|"flowchart"|"mini_game", "prompt": "..."} — ` +
                `ONE comprehension check for this beat. Prefer variety across beats.\n\n` +
                `Respond with ONLY a JSON array of these objects, ordered by index.`;

            const result = await generateContentWithFailover(prompt, {
                responseMimeType: "application/json",
                temperature: 0.4,
            });

            const parsed = safeParseJsonArray<RawBeatMeta>(result.text);
            if (parsed && parsed.length > 0) {
                parsed.forEach((item, pos) => {
                    if (!item || typeof item !== "object") return;
                    const idxFromItem =
                        typeof item.index === "number" ? item.index : pos;
                    if (idxFromItem < 0 || idxFromItem >= ranges.length) return;

                    if (typeof item.title === "string" && item.title.trim()) {
                        titles[idxFromItem] = item.title.trim();
                    }
                    if (typeof item.focus === "string" && item.focus.trim()) {
                        const focus = item.focus.trim();
                        focuses[idxFromItem] =
                            focus.length <= 160 ? focus : `${focus.slice(0, 157)}...`;
                    }
                    const check = coerceCheck(item.check);
                    if (check) checks[idxFromItem] = check;
                });
            }
        } catch (error) {
            console.warn("🎯 Beat metadata generation failed, using degraded mode:", error);
        }
    }

    const beats: VideoBeat[] = ranges.map((range, i) => ({
        index: i,
        startSec: Math.round(segments[range.startIdx].offsetMs / 1000),
        endSec: Math.round(
            (segments[range.endIdx].offsetMs + segments[range.endIdx].durationMs) / 1000
        ),
        title: titles[i],
        focus: focuses[i],
        comprehensionCheck: checks[i],
    }));

    return { status: "ok", videoId, totalDurationSec, beats };
}
