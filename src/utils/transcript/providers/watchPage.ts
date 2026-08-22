/**
 * 🥸 Provider 2 — Watch-page scrape
 *
 * Fetches youtube.com/watch as a desktop browser (UA + consent cookies),
 * extracts `ytInitialPlayerResponse`, and pulls captions from the embedded
 * timedtext URLs. Completely independent of any library — if every package
 * breaks, this still works until YouTube changes its HTML contract.
 */

import type { FetchContext, ProviderOutcome, TranscriptProvider } from "../types";
import {
    absoluteTimedtextUrl,
    parseJson3,
    parseTimedtextXml,
    pickCaptionTrack,
    type CaptionTrackRef,
} from "../shared";
import { withRetry } from "../limiter";

const DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

interface PlayerResponse {
    playabilityStatus?: { status?: string; reason?: string };
    captions?: {
        playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrackRef[] };
    };
}

/** Brace-matching extraction of an inline JSON assignment from page HTML. */
export function extractInlineJson(html: string, varName: string): unknown | null {
    const marker = `${varName} = `;
    const start = html.indexOf(marker);
    if (start === -1) return null;

    let cursor = start + marker.length;
    while (cursor < html.length && html[cursor] !== "{") {
        if (html[cursor] === ";" || html[cursor] === "<") return null;
        cursor++;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = cursor; i < html.length; i++) {
        const ch = html[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(html.slice(cursor, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

async function fetchPlayerResponse(videoId: string): Promise<PlayerResponse | null> {
    const response = await withRetry(
        () =>
            fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`, {
                headers: {
                    "User-Agent": DESKTOP_UA,
                    "Accept-Language": "en-US,en;q=0.9",
                    Accept: "text/html,application/xhtml+xml",
                    Cookie: "CONSENT=YES+cb.20240101-01-p0.en+FX+100; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMTAxLjA4X3AwGgJlbiACGgYIgJ2VrQY",
                },
            }),
        { attempts: 2 }
    );

    if (!response.ok) return null;
    const html = await response.text();
    const parsed = extractInlineJson(html, "ytInitialPlayerResponse");
    return parsed ? (parsed as PlayerResponse) : null;
}

async function fetchTimedtext(baseUrl: string): Promise<string | null> {
    let url = absoluteTimedtextUrl(baseUrl);
    if (!url.includes("fmt=")) url += "&fmt=json3";

    const response = await withRetry(() => fetch(url, { headers: { "User-Agent": DESKTOP_UA } }), {
        attempts: 2,
    });
    if (!response.ok) return null;
    const body = await response.text();
    return body.trim() ? body : null;
}

function segmentsFromBody(body: string) {
    const trimmed = body.trim();
    if (trimmed.startsWith("{")) return parseJson3(trimmed);
    return parseTimedtextXml(trimmed);
}

export const watchPageProvider: TranscriptProvider = {
    name: "watchpage",

    async isAvailable(): Promise<boolean> {
        return true;
    },

    async fetch(ctx: FetchContext): Promise<ProviderOutcome> {
        try {
            const playerResponse = await fetchPlayerResponse(ctx.videoId);
            if (!playerResponse) {
                return { status: "error", detail: "ytInitialPlayerResponse not found in watch page" };
            }

            const status = playerResponse.playabilityStatus?.status ?? "UNKNOWN";

            if (status !== "OK") {
                // Login-required / age-gated pages never expose caption tracks.
                if (status === "LOGIN_REQUIRED" || status === "CHECK_REQUIRED") {
                    return { status: "error", detail: `playability=${status}` };
                }
                return { status: "no_captions", detail: `playability=${status}, reason=${playerResponse.playabilityStatus?.reason ?? "n/a"}` };
            }

            const tracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
            if (!tracks.length) {
                return { status: "no_captions", detail: "playability OK, zero caption tracks" };
            }

            const track = pickCaptionTrack(tracks, ctx.preferredLang);
            if (!track?.baseUrl) {
                return { status: "no_captions", detail: "caption tracks present but no usable baseUrl" };
            }

            const body = await fetchTimedtext(track.baseUrl);
            if (!body) {
                return { status: "error", detail: "timedtext request failed" };
            }

            const segments = segmentsFromBody(body);
            if (!segments.length) {
                return { status: "error", detail: "timedtext returned unparsable payload" };
            }

            return {
                status: "ok",
                transcript: {
                    segments,
                    language: track.languageCode || track.language_code || undefined,
                    isAutoGenerated: track.kind === "asr",
                },
            };
        } catch (error) {
            return {
                status: "error",
                detail: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
