import { NextResponse } from "next/server";
import { searchVideos } from "@/utils/youtubeApi";

interface BuildPlaylistRequest {
  topic?: string;
  tableOfContents?: string[];
  preferences?: {
    studentType?: "high_school" | "undergrad" | "post_grad";
    language?: "english" | "hindi";
    learningMode?: "from_scratch" | "revision" | "one_shot";
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BuildPlaylistRequest;
    const topic = (body.topic || "").trim();
    const tableOfContents = Array.isArray(body.tableOfContents)
      ? body.tableOfContents.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

    if (!topic || tableOfContents.length === 0 || !body.preferences) {
      return NextResponse.json({ error: "playlist_unavailable", entries: [] }, { status: 200 });
    }

    const isHindi = body.preferences.language === "hindi";

    const promises = tableOfContents.map(async (tocItem, index) => {
      const query = `${tocItem} ${isHindi ? "in Hindi " : ""}tutorial`;
      
      const results = await searchVideos(query, { maxResults: 10 });
      
      const validVideo = results.find(video => {
        const minutes = video.seconds / 60;
        return minutes >= 3 && minutes <= 60;
      });

      if (!validVideo) {
        throw new Error(`No valid video found for ${tocItem}`);
      }

      return {
        position: index + 1,
        videoId: validVideo.videoId,
        title: validVideo.title,
        channelName: validVideo.author.name,
        durationDisplay: validVideo.timestamp,
        topicMatched: tocItem,
        source: "gap_fill"
      };
    });

    const settledResults = await Promise.allSettled(promises);
    
    const entries = settledResults
      .filter((result): result is PromiseFulfilledResult<any> => result.status === "fulfilled")
      .map(result => result.value)
      .sort((a, b) => a.position - b.position);

    return NextResponse.json({
      syllabusTitle: topic,
      totalVideos: entries.length,
      entries
    });

  } catch (error) {
    console.warn("⚠️ build-playlist route failed:", error);
    return NextResponse.json({ error: "playlist_unavailable", entries: [] }, { status: 200 });
  }
}
