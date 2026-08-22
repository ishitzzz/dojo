/**
 * 👂 Transcript Client — facade over the Transcript Forge orchestrator.
 *
 * Public signatures are frozen: `/api/get-transcript`, `lib/learning/beats`
 * and `get-video` Sentinel all import from here. The resilient multi-provider
 * machinery lives in `utils/transcript/`; this file only adapts it.
 */

import { getTranscript } from "./transcript";
import { TranscriptUnavailableError } from "./transcript/types";
import { mapWithConcurrency } from "./transcript/limiter";

export interface TranscriptSegment {
    text: string;
    /** Offset from video start, in milliseconds. */
    offsetMs: number;
    /** Segment duration in milliseconds. */
    durationMs: number;
}

export interface TranscriptSnippet {
    videoId: string;
    text: string;
    isAvailable: boolean;
}

/** Fetch the full timestamped transcript for a video. Throws when unavailable. */
export async function fetchTranscriptSegments(
    videoId: string
): Promise<TranscriptSegment[]> {
    const result = await getTranscript(videoId);
    return result.segments.map((segment) => ({
        text: segment.text,
        offsetMs: segment.offsetMs,
        durationMs: segment.durationMs,
    }));
}

/**
 * Fetch a short intro window (~first 60s) of a video's transcript.
 * Used by the get-video Sentinel to ground LLM judging. Never triggers ASR.
 */
export async function fetchIntroTranscript(videoId: string): Promise<TranscriptSnippet> {
    try {
        const transcript = await getTranscript(videoId, { introOnly: true });
        let text = "";
        const sixtySecondsMs = 60_000;
        for (const segment of transcript.segments) {
            if (segment.offsetMs > sixtySecondsMs) break;
            text += `${segment.text} `;
            if (text.length > 1000) break;
        }
        const trimmed = text.trim();
        return {
            videoId,
            text: trimmed,
            isAvailable: trimmed.length > 0,
        };
    } catch {
        // Captions disabled, region-blocked, network failure — honest empty.
        return { videoId, text: "", isAvailable: false };
    }
}

/**
 * Batch-fetch intros for multiple videos (parallel, rate-limit safe).
 * Returns only videos that actually produced usable text.
 */
export async function fetchIntroTranscripts(videoIds: string[]): Promise<Map<string, string>> {
    const snippets = await mapWithConcurrency(videoIds, 4, (id) => fetchIntroTranscript(id));

    const results = new Map<string, string>();
    snippets.forEach((snippet) => {
        if (snippet.isAvailable && snippet.text.length > 0) {
            results.set(snippet.videoId, snippet.text);
        }
    });

    if (results.size > 0) {
        console.log(`👂 Peaked at transcripts for ${results.size}/${videoIds.length} candidates.`);
    }

    return results;
}

export { TranscriptUnavailableError };
