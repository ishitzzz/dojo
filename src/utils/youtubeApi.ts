import type { LearningTopology } from "@/utils/topologyInference";

const USE_YT_API = !!process.env.YOUTUBE_API_KEY;

type VideoDuration = "short" | "medium" | "long";

type SearchVideosOptions = {
  maxResults?: number;
  videoDuration?: VideoDuration;
};

type YtSearchVideo = {
  videoId: string;
  title: string;
  description: string;
  author: { name: string };
  seconds: number;
  timestamp: string;
  views: number;
  thumbnail: string;
};

type FallbackYtVideo = {
  videoId: string;
  title?: string;
  description?: string;
  author?: { name?: string };
  seconds?: number;
  timestamp?: string;
  duration?: { seconds?: number; timestamp?: string };
  views?: number;
  thumbnail?: string;
};

function isoDurationToSeconds(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}

function secondsToTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function fallbackYtSearch(query: string, maxResults: number): Promise<YtSearchVideo[]> {
  const mod = await import("yt-search");
  const yts = mod.default;
  const result = await yts(query);
  return ((result.videos || []) as FallbackYtVideo[]).slice(0, maxResults).map((video) => ({
    videoId: video.videoId,
    title: video.title || "",
    description: video.description || "",
    author: { name: video.author?.name || "Unknown" },
    seconds: video.seconds || video.duration?.seconds || 0,
    timestamp: video.timestamp || video.duration?.timestamp || "0:00",
    views: video.views || 0,
    thumbnail: video.thumbnail || "",
  }));
}

export function buildSearchQuery(
  baseQuery: string,
  topology?: LearningTopology
): string {
  if (!topology?.videoStylePriority?.length) {
    return baseQuery;
  }

  const style = topology.videoStylePriority[0];

  switch (style) {
    case "documentary":
      return `${baseQuery} documentary`;
    case "tutorial":
      return `${baseQuery} tutorial step by step`;
    case "lecture":
      return `${baseQuery} lecture explained`;
    case "demonstration":
      return `${baseQuery} example walkthrough`;
    case "debate":
      return `${baseQuery} analysis discussion`;
    default:
      return baseQuery;
  }
}

export async function searchVideos(
  query: string,
  options: SearchVideosOptions = {},
  topology?: LearningTopology
): Promise<YtSearchVideo[]> {
  const maxResults = options.maxResults ?? 10;
  const finalQuery = buildSearchQuery(query, topology);

  if (!USE_YT_API) {
    return fallbackYtSearch(finalQuery, maxResults);
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return fallbackYtSearch(finalQuery, maxResults);
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("q", finalQuery);
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("key", apiKey);

    if (options.videoDuration) {
      searchUrl.searchParams.set("videoDuration", options.videoDuration);
    }

    const searchResponse = await fetch(searchUrl.toString(), { cache: "no-store" });

    if (!searchResponse.ok) {
      throw new Error(`YouTube search API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const items = Array.isArray(searchData.items) ? searchData.items : [];

    const videoIds = items
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter((id: string | undefined): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return [];
    }

    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("part", "contentDetails,statistics");
    videosUrl.searchParams.set("id", videoIds.join(","));
    videosUrl.searchParams.set("key", apiKey);

    const videosResponse = await fetch(videosUrl.toString(), { cache: "no-store" });
    if (!videosResponse.ok) {
      throw new Error(`YouTube videos API error: ${videosResponse.status}`);
    }

    const videosData = await videosResponse.json();
    const detailItems = Array.isArray(videosData.items) ? videosData.items : [];

    const detailsMap = new Map<
      string,
      { seconds: number; views: number }
    >();

    for (const item of detailItems) {
      const id = item.id as string | undefined;
      if (!id) continue;

      const duration = item.contentDetails?.duration || "PT0S";
      const seconds = isoDurationToSeconds(duration);
      const views = Number(item.statistics?.viewCount || 0);

      detailsMap.set(id, {
        seconds,
        views: Number.isNaN(views) ? 0 : views,
      });
    }

    return items
      .map((item: {
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
          thumbnails?: {
            maxres?: { url?: string };
            standard?: { url?: string };
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
      }) => {
        const videoId = item.id?.videoId;
        if (!videoId) return null;

        const details = detailsMap.get(videoId) || { seconds: 0, views: 0 };

        return {
          videoId,
          title: item.snippet?.title || "",
          description: item.snippet?.description || "",
          author: {
            name: item.snippet?.channelTitle || "Unknown",
          },
          seconds: details.seconds,
          timestamp: secondsToTimestamp(details.seconds),
          views: details.views,
          thumbnail:
            item.snippet?.thumbnails?.maxres?.url ||
            item.snippet?.thumbnails?.standard?.url ||
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url ||
            "",
        };
      })
      .filter((video: YtSearchVideo | null): video is YtSearchVideo => video !== null);
  } catch (error) {
    console.warn("⚠️ YouTube Data API failed, falling back to yt-search:", error);
    return fallbackYtSearch(finalQuery, maxResults);
  }
}

export { USE_YT_API };
