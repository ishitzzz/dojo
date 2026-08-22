import { NextResponse } from "next/server";
import { normalizeVideoSpec } from "@/utils/videoSpec";
import { shouldBeatSplit, buildBeats } from "@/lib/learning/beats";
import { parseIsoDurationToSeconds } from "@/utils/youtubeApi";

async function fetchDurationSeconds(
    videoId: string
): Promise<number | null> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

    try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(
            videoId
        )}&key=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const items = data?.items;
        if (!Array.isArray(items) || items.length === 0) return null;
        const iso = items[0]?.contentDetails?.duration;
        if (typeof iso !== "string") return null;
        const seconds = parseIsoDurationToSeconds(iso);
        return seconds > 0 ? Math.round(seconds) : null;
    } catch (error) {
        console.error("YouTube duration fetch error:", error);
        return null;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");
    const topic = searchParams.get("topic") ?? undefined;
    const specParam = searchParams.get("spec");

    if (!videoId) {
        return NextResponse.json(
            { status: "error", message: "videoId is required" },
            { status: 400 }
        );
    }

    try {
        let spec;
        if (specParam) {
            try {
                spec = normalizeVideoSpec(JSON.parse(specParam));
            } catch {
                return NextResponse.json(
                    { status: "error", message: "spec must be valid JSON" },
                    { status: 400 }
                );
            }
        }

        // Determine video duration: YouTube Data API first, query param fallback.
        let durationSeconds = await fetchDurationSeconds(videoId);
        if (durationSeconds === null) {
            const fallback = Number(searchParams.get("durationSeconds"));
            if (Number.isFinite(fallback) && fallback > 0) {
                durationSeconds = Math.round(fallback);
            }
        }

        if (durationSeconds === null) {
            return NextResponse.json(
                {
                    status: "error",
                    message:
                        "Cannot determine video duration. Set YOUTUBE_API_KEY or pass a durationSeconds query param.",
                },
                { status: 400 }
            );
        }

        if (!shouldBeatSplit(durationSeconds, spec)) {
            return NextResponse.json({
                status: "not_eligible",
                reason: `Video is ${Math.round(durationSeconds / 60)} min; beat-splitting requires > 40 min with depth=mastery or targetDurationBand=long.`,
            });
        }

        const result = await buildBeats({ videoId, topic });
        return NextResponse.json(result);
    } catch (error) {
        console.error("video-beats error:", error);
        return NextResponse.json(
            { status: "error", message: String(error) },
            { status: 500 }
        );
    }
}
