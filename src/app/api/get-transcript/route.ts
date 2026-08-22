import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) {
        return NextResponse.json(
            { error: "videoId is required" },
            { status: 400 }
        );
    }

    try {
        // Fetch transcript from YouTube
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);

        // Combine all transcript segments into a single text
        const fullText = transcript
            .map((segment) => segment.text)
            .join(" ");

        // Also return timestamped segments for potential future use
        const segments = transcript.map((segment) => ({
            text: segment.text,
            offset: segment.offset,
            duration: segment.duration,
        }));

        return NextResponse.json({
            videoId,
            fullText,
            segments,
            wordCount: fullText.split(" ").length,
        });
    } catch (error) {
        console.error("Transcript fetch error:", error);

        // Handle cases where transcript is unavailable
        return NextResponse.json(
            {
                error: "Transcript not available",
                message: "This video may not have captions enabled or may be restricted.",
                videoId,
            },
            { status: 404 }
        );
    }
}
