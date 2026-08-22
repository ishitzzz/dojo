/**
 * 📚 Resource Hub v2 — Web-Wide Dynamic Discovery
 * 
 * KILLS the old arXiv/OpenLibrary-only approach.
 * 
 * New strategy:
 * 1. YouTube: Multiple videos with different perspectives (via yt-search, FREE)
 * 2. Gemini: ONE smart call to generate curated web resources
 *    - Categories are DYNAMIC (not hardcoded)
 *    - AI decides what resource types are relevant for this topic
 *    - Could be: articles, tools, interactive demos, free PDFs, 
 *      visualizations, courses, docs, blog posts, etc.
 *    - Each resource includes a "keyInsight" for hover preview
 * 
 * JIT Loading: Only called when user opens a node's workspace.
 */

import { NextResponse } from "next/server";
import { generateContentWithFailover } from "@/utils/gemini";
import { safeParseJsonArray } from "@/utils/safeJsonParser";
import { validateResourceUrls, isSearchEngineUrl } from "@/utils/validateResourceUrls";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const yts = require("yt-search");

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface ResourceRequest {
    topic: string;
    nodeTitle: string;
}

interface VideoResource {
    type: "video";
    title: string;
    url: string;
    thumbnail: string;
    channel: string;
    duration: string;
    views: string;
    keyInsight: string;
}

interface WebResource {
    type: string;     // Dynamic: "article", "tool", "interactive", "documentation", "free_book", "visualization", etc.
    title: string;
    url: string;
    source: string;   // e.g., "MDN Web Docs", "Khan Academy", "3Blue1Brown"
    keyInsight: string;
    emoji: string;     // Visual indicator for the card
    urlStatus?: "ok" | "unverified"; // set by validateResourceUrls
}

// ═══════════════════════════════════════════════════════════════
// YOUTUBE — Multiple Videos with Different Angles
// ═══════════════════════════════════════════════════════════════

async function fetchMultipleVideos(nodeTitle: string): Promise<VideoResource[]> {
    try {
        // Search with multiple queries for diversity
        const queries = [
            `${nodeTitle} explained`,
            `${nodeTitle} tutorial`,
            `${nodeTitle} visual guide`,
        ];

        const allResults: VideoResource[] = [];
        const seenIds = new Set<string>();

        // Fetch all queries in parallel
        const searchPromises = queries.map(q =>
            yts({ query: q, pages: 1 }).catch(() => null)
        );

        const results = await Promise.all(searchPromises);

        for (const result of results) {
            if (!result?.videos) continue;

            for (const video of result.videos.slice(0, 5)) {
                if (seenIds.has(video.videoId)) continue;
                seenIds.add(video.videoId);

                // Basic quality filter
                const durationSec = video.seconds || 0;
                if (durationSec < 60 || durationSec > 7200) continue; // Skip <1min or >2hr

                allResults.push({
                    type: "video",
                    title: video.title,
                    url: video.url,
                    thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`,
                    channel: video.author?.name || "Unknown",
                    duration: video.timestamp || "",
                    views: formatViews(video.views),
                    keyInsight: "", // Will be filled by Gemini
                });
            }
        }

        // Return top 6, sorted by a rough quality heuristic
        return allResults
            .sort((a, b) => {
                // Prefer videos with reasonable titles (not all caps clickbait)
                const aScore = a.title === a.title.toUpperCase() ? -1 : 0;
                const bScore = b.title === b.title.toUpperCase() ? -1 : 0;
                return bScore - aScore;
            })
            .slice(0, 6);
    } catch (err) {
        console.warn("⚠️ YouTube fetch failed:", err);
        return [];
    }
}

function formatViews(views: number): string {
    if (!views) return "";
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K views`;
    return `${views} views`;
}

// ═══════════════════════════════════════════════════════════════
// GEMINI — Smart Web Resource Discovery
// One call generates categorized resources with key insights
// ═══════════════════════════════════════════════════════════════

async function discoverWebResources(
    nodeTitle: string,
    topic: string,
    videoTitles: string[]
): Promise<WebResource[]> {
    try {
        const prompt = `You are a learning resource curator. For the topic "${nodeTitle}" (in the context of learning "${topic}"), 
find the BEST free web resources a student should check out.

IMPORTANT RULES:
- Return resources from REAL, well-known, FREE websites (Wikipedia, MDN, Khan Academy, freeCodeCamp, Coursera audit, MIT OCW, GeeksForGeeks, W3Schools, Brilliant.org, 3Blue1Brown, Visualgo, ChatGPT, Claude, YouTube channels, official docs, etc.)
- Each resource MUST have a real, working URL
- Categories are DYNAMIC — pick what's most relevant for THIS specific topic
- Each resource needs a "keyInsight" (1 sentence: what makes THIS resource uniquely useful)
- Include diverse types: articles, interactive tools, visualizations, free books/PDFs, documentation, courses, cheat sheets, practice problems, etc.
- Return 6-10 resources total
- DO NOT include these videos (already shown): ${videoTitles.slice(0, 3).join(", ")}

Return a JSON array. Each object has these fields:
- type: string (lowercase, e.g. "article", "interactive_tool", "documentation", "free_course", "visualization", "cheat_sheet", "practice", "video_series", "reference", "blog_post")
- title: string (clear, descriptive)  
- url: string (real, working URL)
- source: string (site name, e.g. "MDN Web Docs")
- keyInsight: string (1 sentence: why this resource is worth checking)
- emoji: string (single emoji that represents this resource type)

Return ONLY the JSON array, nothing else.`;

        const result = await generateContentWithFailover(prompt, {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 1500,
        });

        const parsed = safeParseJsonArray<WebResource>(result.text);
        if (parsed && Array.isArray(parsed)) {
            return parsed
                .slice(0, 10)
                .map((r: WebResource) => ({
                    type: r.type || "article",
                    title: r.title || "Unknown",
                    url: r.url || "#",
                    source: r.source || "Web",
                    keyInsight: r.keyInsight || "",
                    emoji: r.emoji || "🔗",
                }))
                // Generation-parse guard: the LLM sometimes lazily emits search
                // links instead of a real resource URL. Reject those here so a
                // search page can never reach the UI dressed up as a resource.
                .filter((r) => {
                    if (isSearchEngineUrl(r.url)) {
                        console.warn(`📚 Rejected LLM search-engine URL for "${r.title}": ${r.url}`);
                        return false;
                    }
                    return true;
                });
        }

        return [];
    } catch (err) {
        console.warn("⚠️ Web resource discovery failed:", err);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════
// Gemini — Video Insights (adds key insights to videos)
// ═══════════════════════════════════════════════════════════════

async function addVideoInsights(
    videos: VideoResource[],
    nodeTitle: string
): Promise<VideoResource[]> {
    if (videos.length === 0) return videos;

    try {
        const videoList = videos.map((v, i) => `${i + 1}. "${v.title}" by ${v.channel}`).join("\n");

        const prompt = `For each of these YouTube videos about "${nodeTitle}", write a 1-sentence "keyInsight" — what unique perspective or value this specific video provides to a learner. Be specific to the video title, not generic.

Videos:
${videoList}

Return a JSON array of objects with just: index (1-based) and keyInsight.
Example: [{"index":1,"keyInsight":"Great visual walkthrough of the concept using real-world examples"}]
Return ONLY the JSON array.`;

        const result = await generateContentWithFailover(prompt, {
            responseMimeType: "application/json",
            temperature: 0.5,
            maxOutputTokens: 600,
        });

        const insights = safeParseJsonArray<{ index: number; keyInsight: string }>(result.text);
        if (insights && Array.isArray(insights)) {
            for (const item of insights) {
                const idx = (item.index || 0) - 1;
                if (idx >= 0 && idx < videos.length) {
                    videos[idx].keyInsight = item.keyInsight || "";
                }
            }
        }
    } catch (err) {
        console.warn("⚠️ Video insight generation failed (non-critical):", err);
        // Non-critical — videos still work without insights
    }

    return videos;
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export async function POST(req: Request) {
    try {
        const body: ResourceRequest = await req.json();
        const { topic, nodeTitle } = body;

        if (!topic || !nodeTitle) {
            return NextResponse.json(
                { error: "topic and nodeTitle are required" },
                { status: 400 }
            );
        }

        console.log(`📚 Resource Hub v2: Discovering resources for "${nodeTitle}"`);

        // Phase 1: Fetch YouTube videos (fast, free, no Gemini needed)
        const rawVideos = await fetchMultipleVideos(nodeTitle);

        // Phase 2: In parallel — discover web resources AND add video insights
        const videoTitles = rawVideos.map(v => v.title);
        const [webResources, videosWithInsights] = await Promise.all([
            discoverWebResources(nodeTitle, topic, videoTitles),
            addVideoInsights(rawVideos, nodeTitle),
        ]);

        // Phase 3: Validate LLM-suggested URLs — working links pass through
        // untouched; unreachable links KEEP their original url flagged
        // {urlStatus:"unverified"} (never substituted with a search page);
        // only literally malformed URLs are dropped. Parallel HEAD/GET, 6s.
        let safeWebResources = webResources;
        try {
            safeWebResources = await validateResourceUrls(webResources, topic);
        } catch (err) {
            console.warn("⚠️ Resource URL validation failed (serving unvalidated):", err);
        }

        console.log(`📚 Found: ${videosWithInsights.length} videos, ${safeWebResources.length} web resources`);

        return NextResponse.json({
            videos: videosWithInsights,
            resources: safeWebResources,
            fetchedAt: new Date().toISOString(),
        });

    } catch (error) {
        console.error("❌ Resource Hub error:", error);
        return NextResponse.json(
            { error: "Failed to fetch resources", details: String(error) },
            { status: 500 }
        );
    }
}
