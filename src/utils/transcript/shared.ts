/**
 * 🧰 Shared parsing + normalization helpers for transcript providers.
 */

import type { NormalizedTranscript, TranscriptSegment } from "./types";

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
};

/** Decode HTML entities YouTube leaves inside caption text (`&amp;#39;` → `'`). */
export function decodeEntities(input: string): string {
    return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
        const lower = code.toLowerCase();
        if (lower.startsWith("#x")) {
            const point = parseInt(lower.slice(2), 16);
            return Number.isFinite(point) ? String.fromCodePoint(point) : match;
        }
        if (lower.startsWith("#")) {
            const point = parseInt(lower.slice(1), 10);
            return Number.isFinite(point) ? String.fromCodePoint(point) : match;
        }
        return NAMED_ENTITIES[lower] ?? match;
    });
}

export function normalizeText(raw: string): string {
    return decodeEntities(raw.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function buildFullText(segments: TranscriptSegment[]): string {
    return segments
        .map((s) => s.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

export function ok(transcript: NormalizedTranscript): NormalizedTranscript {
    return {
        ...transcript,
        segments: transcript.segments
            .map((s) => ({ ...s, text: normalizeText(s.text) }))
            .filter((s) => s.text.length > 0),
    };
}

// ═══════════════════════════════════════════════════════════════
// Caption track selection
// ═══════════════════════════════════════════════════════════════

export interface CaptionTrackRef {
    baseUrl?: string;
    languageCode?: string;
    language_code?: string;
    kind?: "asr" | "frc" | string;
}

function langOf(track: CaptionTrackRef): string {
    return track.languageCode || track.language_code || "";
}

const LANG_FALLBACKS = ["en", "en-US", "en-GB", "en-US-orig", "en-orig"];

/**
 * Preference order: requested language → English manual → English ASR →
 * any manual → any ASR. Manual tracks outrank machine tracks at the same
 * tier because they are human-authored.
 */
export function pickCaptionTrack(tracks: CaptionTrackRef[], preferredLang?: string): CaptionTrackRef | null {
    if (!tracks.length) return null;
    const wanted = preferredLang?.toLowerCase();
    const manual = tracks.filter((t) => t.kind !== "asr");
    const auto = tracks.filter((t) => t.kind === "asr");

    if (wanted) {
        const exact = tracks.find((t) => langOf(t).toLowerCase() === wanted);
        if (exact) return exact;
        const prefix = tracks.find((t) => langOf(t).toLowerCase().startsWith(wanted.split("-")[0]));
        if (prefix) return prefix;
    }
    for (const lang of LANG_FALLBACKS) {
        const hit = manual.find((t) => langOf(t).toLowerCase() === lang.toLowerCase())
            ?? auto.find((t) => langOf(t).toLowerCase() === lang.toLowerCase());
        if (hit) return hit;
    }
    return manual[0] ?? auto[0] ?? null;
}

export function absoluteTimedtextUrl(baseUrl: string): string {
    if (baseUrl.startsWith("//")) return `https:${baseUrl}`;
    if (baseUrl.startsWith("/")) return `https://www.youtube.com${baseUrl}`;
    return baseUrl;
}

/**
 * Timedtext URLs ship with a baked-in `fmt` (usually srv3). Appending a
 * second fmt param is silently ignored — the param must be REPLACED.
 */
export function withTimedtextFormat(baseUrl: string, fmt = "json3"): string {
    const url = absoluteTimedtextUrl(baseUrl);
    if (/[?&]fmt=/.test(url)) {
        return url.replace(/([?&])fmt=[^&]*/, `$1fmt=${fmt}`);
    }
    return `${url}${url.includes("?") ? "&" : "?"}fmt=${fmt}`;
}

// ═══════════════════════════════════════════════════════════════
// Timedtext formats — json3 and legacy XML
// ═══════════════════════════════════════════════════════════════

interface Json3Event {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: { utf8?: string }[];
}

export function parseJson3(body: string): TranscriptSegment[] {
    const parsed = JSON.parse(body) as { events?: Json3Event[] };
    const segments: TranscriptSegment[] = [];
    for (const event of parsed.events ?? []) {
        const text = (event.segs ?? []).map((seg) => seg.utf8 ?? "").join("");
        if (!text || !text.trim()) continue;
        segments.push({
            text,
            offsetMs: event.tStartMs ?? 0,
            durationMs: event.dDurationMs ?? 0,
        });
    }
    return segments;
}

/** Legacy timedtext XML: `<text start="12.34" dur="1.2">body</text>`. */
export function parseTimedtextXml(body: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const pattern = /<text[^>]*start="([\d.]+)"[^>]*(?:dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
        const text = match[3].replace(/\n/g, " ");
        if (!text.trim()) continue;
        segments.push({
            text,
            offsetMs: Math.round(parseFloat(match[1]) * 1000),
            durationMs: Math.round(parseFloat(match[2] ?? "0") * 1000),
        });
    }
    return segments;
}

// ═══════════════════════════════════════════════════════════════
// WebVTT (yt-dlp subtitle output)
// ═══════════════════════════════════════════════════════════════

function vttTimestampToMs(stamp: string): number {
    const parts = stamp.trim().replace(",", ".").split(":").map(Number);
    const [seconds, minutes = 0, hours = 0] = parts.reverse();
    return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

/**
 * Parse VTT cues and collapse the rolling duplicates that YouTube's
 * auto-generated subtitles contain (each cue repeats the previous line).
 */
export function parseVtt(body: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const cuePattern = /(\d[\d:.]+)\s+-->\s+(\d[\d:.]+)/;
    const lines = body.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const cueMatch = lines[i].match(cuePattern);
        if (!cueMatch) continue;

        const textParts: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
            if (!lines[j] || cuePattern.test(lines[j])) break;
            textParts.push(lines[j]);
            i = j;
        }

        let text = textParts.join(" ");
        // Strip inline word-timing tags (<00:00:01.359><c>) and speaker tags.
        text = text.replace(/<[^>]*>/g, " ");
        text = text.split("\n").join(" ").replace(/\s+/g, " ").trim();

        for (const line of text.split(/(?<=\S)\.(?=\s)|\n/)) {
            const cleaned = line.trim();
            if (!cleaned || cleaned === "[Music]" || cleaned === "[Applause]") continue;
            segments.push({
                text: cleaned,
                offsetMs: vttTimestampToMs(cueMatch[1]),
                durationMs: Math.max(0, vttTimestampToMs(cueMatch[2]) - vttTimestampToMs(cueMatch[1])),
            });
        }
    }

    return dedupeConsecutive(segments);
}

/** Drop consecutive segments with identical text (rolling-caption echoes). */
export function dedupeConsecutive(segments: TranscriptSegment[]): TranscriptSegment[] {
    const out: TranscriptSegment[] = [];
    for (const segment of segments) {
        const prev = out[out.length - 1];
        if (prev && prev.text === segment.text) {
            prev.durationMs = Math.max(prev.durationMs, segment.offsetMs + segment.durationMs - prev.offsetMs);
            continue;
        }
        out.push(segment);
    }
    return out;
}
