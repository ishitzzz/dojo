import { NextResponse } from "next/server";
import { searchVideos } from "@/utils/youtubeApi";
import {
  VideoCandidate,
  rankByDensity,
} from "@/utils/searchScraper";

/**
 * Break Video Fetcher
 * Finds edutainment videos matching user's break preferences.
 * Videos should be entertaining but informational — documentaries, explainers, fascinating facts.
 */

// Genre → search query mapping (edutainment focused)
const GENRE_QUERIES: Record<string, string[]> = {
  "Tech & Science": [
    "mind-blowing science facts explained short documentary",
    "fascinating technology explained simply",
    "science documentary explained minutes",
  ],
  "History & Culture": [
    "fascinating history stories explained short",
    "historical events that changed the world explained",
    "cultural traditions explained documentary short",
  ],
  "Comedy & Satire": [
    "comedy documentary explained satire",
    "funny educational video explained",
    "satirical explainer documentary short",
  ],
  "Travel & Nature": [
    "amazing nature documentary short explained",
    "travel documentary hidden places explained",
    "wildlife fascinating facts explained minutes",
  ],
  "Business & Finance": [
    "business case study explained short",
    "fascinating economics explained simply",
    "startup stories documentary explained minutes",
  ],
  "Sports & Games": [
    "sports science explained fascinating",
    "incredible sports moments explained documentary",
    "game theory explained short documentary",
  ],
};

// Convert yt-search results to VideoCandidate[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVideoCandidates(videos: any[]): VideoCandidate[] {
  return videos.map((v) => ({
    videoId: v.videoId,
    title: v.title || "",
    description: v.description || "",
    duration: {
      seconds: v.seconds || 0,
      timestamp: v.timestamp || "0:00",
    },
    views: v.views || 0,
    author: {
      name: v.author?.name || "Unknown",
      url: v.author?.url,
    },
  }));
}

export async function POST(req: Request) {
  try {
    const { genres, breakMinutes } = await req.json();

    if (!genres || !Array.isArray(genres) || genres.length === 0) {
      return NextResponse.json(
        { error: "genres array is required" },
        { status: 400 }
      );
    }

    const breakDuration = breakMinutes || 10;
    const minSeconds = Math.max(60, (breakDuration - 2) * 60);
    const maxSeconds = (breakDuration + 3) * 60;

    // Collect candidates from all genres
    const allCandidates: VideoCandidate[] = [];
    const seenIds = new Set<string>();

    // Pick 1-2 queries per genre to avoid too many API calls
    for (const genre of genres.slice(0, 3)) {
      const queries = GENRE_QUERIES[genre] || [`${genre} documentary explained short`];
      const query = queries[Math.floor(Math.random() * queries.length)];

      // Add duration hint to query
      const durationHint = breakDuration <= 10 ? "short" : breakDuration <= 15 ? "" : "full";
      const searchQuery = `${query} ${durationHint}`.trim();

      try {
        const results = await searchVideos(searchQuery, { maxResults: 8 });

        if (results && results.length > 0) {
          const candidates = toVideoCandidates(results);

          for (const c of candidates) {
            if (!seenIds.has(c.videoId)) {
              seenIds.add(c.videoId);
              allCandidates.push(c);
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ Break video search failed for genre "${genre}":`, err);
      }
    }

    // Filter by duration window
    const durationFiltered = allCandidates.filter(
      (v) => v.duration.seconds >= minSeconds && v.duration.seconds <= maxSeconds
    );

    // If not enough in duration window, relax to broader range
    const candidates =
      durationFiltered.length >= 3
        ? durationFiltered
        : allCandidates.filter(
            (v) => v.duration.seconds >= 60 && v.duration.seconds <= maxSeconds + 120
          );

    // Filter out Shorts
    const noShorts = candidates.filter((v) => {
      const titleLower = v.title.toLowerCase();
      if (v.duration.seconds > 0 && v.duration.seconds <= 61) return false;
      if (titleLower.includes("#shorts") || titleLower.includes("#short")) return false;
      return true;
    });

    // Rank by density
    const ranked = rankByDensity(noShorts.length > 0 ? noShorts : candidates);

    // Return top 6
    const top = ranked.slice(0, 6).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      channel: v.author.name,
      duration: v.duration.timestamp,
      durationSeconds: v.duration.seconds,
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
    }));

    return NextResponse.json({ videos: top });
  } catch (error) {
    console.error("❌ Break video fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch break videos" },
      { status: 500 }
    );
  }
}
