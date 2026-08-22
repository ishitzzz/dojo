import { NextResponse } from "next/server";
import { searchVideos } from "@/utils/youtubeApi";
import type { LearningTopology } from "@/utils/topologyInference";
import {
  VideoCandidate,
  rankByDensity,
  prepareForLLMRerank,
  filterByDuration,
} from "@/utils/searchScraper";
import { vibeCheckRerank } from "@/utils/geminiReranker";
import {
  checkVideoVault,
  storeInVideoVault,
  VideoVaultEntry,
} from "@/utils/videoVault";
import {
  analyzeQuery,
  filterByRelevance,
} from "@/utils/queryIntelligence";
import { fetchVideoDetails, YouTubeEnhancement } from "@/utils/youtubeClient";
import { fetchIntroTranscripts } from "@/utils/transcriptClient";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  INITIAL_FETCH_COUNT: 10,
  RERANK_CANDIDATE_COUNT: 5,
  MIN_VIDEO_DURATION: 120,      // 2 minutes minimum
  MAX_VIDEO_DURATION: 7200,     // 2 hours max
  FALLBACK_VIDEO_ID: "",
  RELEVANCE_THRESHOLD: 25,     // Minimum relevance score to pass guard
};

// Lightweight in-memory cache
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const QUICK_CACHE = new Map<string, { videos?: any[], videoId?: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// ═══════════════════════════════════════════════════════════════
// HELPER: Convert yt-search results to VideoCandidate[]
// ═══════════════════════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVideoCandidates(videos: any[], count: number): VideoCandidate[] {
  return videos.slice(0, count).map((v: any) => ({
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

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const modifier = searchParams.get("modifier") || "default";
  const userRole = searchParams.get("role") || "Student";
  const experience = searchParams.get("experience") || "Deep Dive";
  const preferredChannel = searchParams.get("preferredChannel");
  const previousTopic = searchParams.get("previousTopic");
  const playlistRef = searchParams.get("playlistRef");
  const excludeIdsParam = searchParams.get("excludeIds");
  const excludeIds = excludeIdsParam ? excludeIdsParam.split(",") : [];
  let topology: LearningTopology | undefined;

  const topologyParam = searchParams.get("topology");
  if (topologyParam) {
    try {
      topology = JSON.parse(topologyParam) as LearningTopology;
    } catch (_e) {
      topology = undefined;
    }
  } else {
    try {
      const rawBody = await request.text();
      if (rawBody) {
        const parsedBody = JSON.parse(rawBody) as { topology?: LearningTopology };
        topology = parsedBody.topology;
      }
    } catch (_e) {
      topology = undefined;
    }
  }

  if (!query) {
    return NextResponse.json({
      videos: [{ videoId: CONFIG.FALLBACK_VIDEO_ID, title: "Fallback", channel: "System", duration: "0:00", reason: "No query provided", isPick: true }],
      source: "fallback"
    });
  }

  const cacheKey = `${query}|${modifier}|${userRole}|${experience}|${preferredChannel || "none"}`;

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Check Quick Cache
  // ═══════════════════════════════════════════════════════════════
  const cached = QUICK_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const mainVideoId = cached.videos ? cached.videos[0].videoId : cached.videoId;
    if (mainVideoId && !excludeIds.includes(mainVideoId)) {
      console.log(`⚡ Quick cache hit for: "${query.slice(0, 30)}..."`);
      return NextResponse.json({ 
        videos: cached.videos || [{ videoId: cached.videoId, title: "Cached Video", channel: "Vault", duration: "0:00", reason: "Loaded from cache", isPick: true }],
        source: "quick_cache" 
      });
    } else {
      console.log(`🚫 Quick cache hit BUT excluded: ${mainVideoId}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Check Video Vault (Supabase)
  // ═══════════════════════════════════════════════════════════════
  try {
    const vaultResult = await checkVideoVault(query, userRole, experience);

    // Check if the vault result is in the excluded list
    const isExcluded = vaultResult.entry && excludeIds.includes(vaultResult.entry.video_id);

    if (vaultResult.found && vaultResult.entry && !isExcluded) {
      console.log(`💾 Vault hit for: "${query.slice(0, 30)}..." -> ${vaultResult.entry.video_id}`);
      const entryVid = {
        videoId: vaultResult.entry.video_id,
        title: vaultResult.entry.title || "Vault Video",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channel: vaultResult.entry.metadata ? (vaultResult.entry.metadata as any).author : "Unknown",
        duration: "0:00",
        reason: "Loaded from learning footprint",
        isPick: true
      };
      QUICK_CACHE.set(cacheKey, { videos: [entryVid], timestamp: Date.now() });
      return NextResponse.json({
        videos: [entryVid],
        source: "video_vault",
      });
    } else if (isExcluded) {
      console.log(`🚫 Vault hit BUT excluded: ${vaultResult.entry?.video_id}`);
    }
  } catch (error) {
    console.warn("⚠️ Vault check error:", error);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: 🧠 QUERY INTELLIGENCE (Replaces all hardcoded logic)
  // ═══════════════════════════════════════════════════════════════
  const { meaning, smartQuery } = analyzeQuery(query, modifier === "default" ? undefined : modifier);

  console.log(`🔎 Smart Search: "${smartQuery.primary.slice(0, 60)}..." [Intent: ${meaning.intent}, Type: ${meaning.contentType}]`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Fetch from YouTube with intelligent queries
  // ═══════════════════════════════════════════════════════════════
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawVideos: any[] = [];
    let searchTierUsed = "smart_primary";

    // --- TIER 0: ANCHOR CHANNEL (with relevance validation) ---
    if (preferredChannel) {
      console.log(`⚓ Attempting Anchor Channel search for: ${preferredChannel}`);
      const anchorQuery = `"${preferredChannel}" ${query}`;
      const anchorResult = await searchVideos(anchorQuery, { maxResults: CONFIG.INITIAL_FETCH_COUNT }, topology);

      if (anchorResult.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anchorVideos = anchorResult.filter((v: any) =>
          v.author.name.toLowerCase().includes(preferredChannel.toLowerCase()) ||
          v.title.toLowerCase().includes(preferredChannel.toLowerCase())
        );

        if (anchorVideos.length > 0) {
          console.log(`⚓ Anchor Channel found ${anchorVideos.length} videos — validating relevance...`);

          // Relevance check: anchor videos MUST match the query topic
          // Otherwise the channel is poisoning results with off-topic content
          const queryWords = smartQuery.subjects.length > 0
            ? smartQuery.subjects
            : query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const relevantAnchorVideos = anchorVideos.filter((v: any) => {
            const title = v.title.toLowerCase();
            const desc = (v.description || "").toLowerCase();
            const combined = `${title} ${desc}`;
            // At least 40% of query subjects must appear in title/description
            const matchCount = queryWords.filter((w: string) => combined.includes(w.toLowerCase())).length;
            const matchRatio = queryWords.length > 0 ? matchCount / queryWords.length : 0;
            return matchRatio >= 0.4;
          });

          if (relevantAnchorVideos.length > 0) {
            console.log(`✅ Anchor Channel: ${relevantAnchorVideos.length}/${anchorVideos.length} videos passed relevance check.`);
            rawVideos = relevantAnchorVideos;
            searchTierUsed = "anchor_channel";
          } else {
            console.log(`🚫 Anchor Channel SKIPPED: 0/${anchorVideos.length} videos matched topic "${query.slice(0, 40)}". Falling through to normal search.`);
          }
        }
      }
    }

    // --- TIER 1: SMART PRIMARY QUERY ---
    if (rawVideos.length === 0) {
      const primaryResult = await searchVideos(smartQuery.primary, { maxResults: CONFIG.INITIAL_FETCH_COUNT }, topology);
      if (primaryResult.length > 0) {
        rawVideos = primaryResult;
        searchTierUsed = "smart_primary";
      }
    }

    // --- TIER 2: FALLBACK QUERY (just subjects) ---
    if (rawVideos.length === 0) {
      console.warn("⚠️ Primary query returned 0. Trying fallback...");
      const fallbackResult = await searchVideos(smartQuery.fallback, { maxResults: CONFIG.INITIAL_FETCH_COUNT }, topology);
      if (fallbackResult.length > 0) {
        rawVideos = fallbackResult;
        searchTierUsed = "smart_fallback";
      }
    }

    // --- TIER 3: RAW QUERY (last resort) ---
    if (rawVideos.length === 0) {
      console.warn("⚠️ Fallback returned 0. Using raw query...");
      const rawResult = await searchVideos(query, { maxResults: CONFIG.INITIAL_FETCH_COUNT }, topology);
      if (rawResult.length > 0) {
        rawVideos = rawResult;
        searchTierUsed = "raw_query";
      } else {
        return NextResponse.json({
          videos: [{
            videoId: CONFIG.FALLBACK_VIDEO_ID,
            title: "Fallback Options",
            channel: "System",
            duration: "0:00",
            reason: "No results from YouTube",
            isPick: true
          }],
          source: "fallback"
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Convert to candidates & DEDUPLICATE
    // ═══════════════════════════════════════════════════════════════

    // Filter raw videos FIRST to ensure we don't slice away potential candidates
    let availableVideos = rawVideos;
    if (excludeIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      availableVideos = rawVideos.filter((v: any) => !excludeIds.includes(v.videoId));
      const removedCount = rawVideos.length - availableVideos.length;
      if (removedCount > 0) {
        console.log(`♻️ Pre-slice Deduplication: Ignored ${removedCount} excluded videos.`);
      }
    }

    let candidates = toVideoCandidates(availableVideos, CONFIG.INITIAL_FETCH_COUNT);

    // ═══════════════════════════════════════════════════════════════
    // STEP 5.25: 🚫 FILTER YOUTUBE SHORTS
    // Shorts disrupt learning flow — eliminate them before any scoring
    // ═══════════════════════════════════════════════════════════════
    const beforeShortsFilter = candidates.length;
    candidates = candidates.filter((v) => {
      const titleLower = v.title.toLowerCase();
      const descLower = v.description.toLowerCase();
      // Hard duration cap: Shorts are ≤ 61s (YouTube Shorts max is 60s)
      if (v.duration.seconds > 0 && v.duration.seconds <= 61) return false;
      // Tag-based Shorts detection
      if (titleLower.includes("#shorts") || titleLower.includes("#short")) return false;
      if (descLower.includes("#shorts") || descLower.includes("#short")) return false;
      return true;
    });
    if (candidates.length < beforeShortsFilter) {
      console.log(`🚫 Shorts Filter: Removed ${beforeShortsFilter - candidates.length} Short(s) from ${beforeShortsFilter} candidates.`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5.5: 🧬 ENRICHMENT (The Microscope)
    // Fetch deep metadata from YouTube API (1 unit cost)
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════

    // Extract IDs for batch fetching
    const candidateIds = candidates.map(c => c.videoId);
    let enrichedCount = 0;

    try {
      const enrichmentMap = await fetchVideoDetails(candidateIds);

      if (enrichmentMap.size > 0) {
        candidates.forEach(candidate => {
          const details = enrichmentMap.get(candidate.videoId);
          if (details) {
            // Enrich the candidate with API data
            candidate.tags = details.tags;
            candidate.category = details.categoryName;
            candidate.officialTopics = details.officialTopics;
            candidate.channelId = details.channelId;
            candidate.likeCount = details.statistics.likeCount;
            candidate.commentCount = details.statistics.commentCount;

            // Update duration if we have exact data (parsing ISO 8601 to seconds would be ideal here)
            // For now, we trust the scraper's seconds but keep the ISO string if needed for debugging

            enrichmentMap.delete(candidate.videoId);
            enrichedCount++;
          }
        });
        console.log(`✨ Enriched ${enrichedCount}/${candidates.length} candidates with API metadata.`);
      }
    } catch (err) {
      console.warn("⚠️ API Enrichment skipped:", err);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5.6: 👂 SENTINEL (The Ear)
    // Fetch first 60s of transcript for top candidates (0 cost)
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════

    // Only fetch for top 5 to save time/bandwidth (even though it's free)
    // We prioritize candidates that survived the density filter if possible, 
    // but here we just take the top ones from the API enriched list.
    const sentinelIds = candidates.slice(0, 5).map(c => c.videoId);

    try {
      const transcriptMap = await fetchIntroTranscripts(sentinelIds);

      candidates.forEach(candidate => {
        if (transcriptMap.has(candidate.videoId)) {
          candidate.transcriptSnippet = transcriptMap.get(candidate.videoId);
        }
      });
    } catch (err) {
      console.warn("⚠️ Transcript Sentinel skipped:", err);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: 🛡️ RELEVANCE GUARD (Layer 3 — The Bouncer)
    // ═══════════════════════════════════════════════════════════════
    let relevantCandidates = candidates;

    if (smartQuery.subjects.length > 0) {
      const { passed, bestEffort } = filterByRelevance(
        candidates,
        smartQuery.subjects,
        CONFIG.RELEVANCE_THRESHOLD
      );
      relevantCandidates = passed.length > 0 ? passed : bestEffort;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 7: Duration filter + Density scoring
    // ═══════════════════════════════════════════════════════════════
    let filteredCandidates = filterByDuration(relevantCandidates, CONFIG.MIN_VIDEO_DURATION);
    if (modifier !== "detailed") {
      filteredCandidates = filteredCandidates.filter(
        (v) => v.duration.seconds <= CONFIG.MAX_VIDEO_DURATION
      );
    }

    if (filteredCandidates.length === 0) {
      filteredCandidates = relevantCandidates;
    }

    const rankedCandidates = rankByDensity(filteredCandidates);

    console.log(`📊 Top ${Math.min(5, rankedCandidates.length)} by Density Score:`);
    rankedCandidates.slice(0, 5).forEach((v, i) => {
      console.log(`  ${i + 1}. [${v.densityScore}] ${v.title.slice(0, 50)}... (${v.densityFlags?.join(", ")})`);
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 8: Gemini Vibe-Check Reranker (AI only sees RELEVANT videos)
    // ═══════════════════════════════════════════════════════════════
    let selectedVideo: VideoCandidate | undefined;
    let selectionSource = "density_heuristic";

    if (playlistRef && rankedCandidates.length > 0) {
      selectedVideo = rankedCandidates.find(v => v.videoId === playlistRef) || rankedCandidates[0];
      selectionSource = "playlist_match";
      console.log(`🎬 Selected pre-computed playlist video: ${selectedVideo?.title}`);
    } else {
      const topCandidates = rankedCandidates.slice(0, CONFIG.RERANK_CANDIDATE_COUNT);
      const candidatesForLLM = prepareForLLMRerank(topCandidates);

      const contextAwareTopic = previousTopic
        ? `${query} (User previously learned: ${previousTopic})`
        : query;

      const rerankerResult = await vibeCheckRerank({
        candidates: candidatesForLLM,
        userRole,
        topic: contextAwareTopic,
        experienceLevel: experience,
      });

      if (!rerankerResult.fallbackUsed && rerankerResult.winnerId) {
        selectedVideo = topCandidates.find((v) => v.videoId === rerankerResult.winnerId);
        if (selectedVideo) {
          selectionSource = "gemini_rerank";
          console.log(`🧠 Gemini selected: ${selectedVideo.title.slice(0, 50)}...`);
        }
      }

      if (!selectedVideo) {
        selectedVideo = topCandidates.find((v) =>
          v.description.toLowerCase().includes("github.com")
        );
        if (selectedVideo) selectionSource = "github_fallback";
        else {
          selectedVideo = topCandidates[0];
          selectionSource = "density_fallback";
        }
      }
    }

    if (!selectedVideo) {
      if (candidates.length > 0) {
        selectedVideo = candidates[0];
        selectionSource = "first_result_fallback";
      } else {
        return NextResponse.json({
          videos: [{ videoId: "", title: "", channel: "", duration: "", reason: "No videos found for this topic", isPick: false }],
          source: "no_results"
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 9: Store + Cache
    // ═══════════════════════════════════════════════════════════════
    const vaultEntry: VideoVaultEntry = {
      video_id: selectedVideo.videoId,
      title: selectedVideo.title,
      description: selectedVideo.description,
      transcript_snippet: "",
      density_score: selectedVideo.densityScore || 0,
      density_flags: selectedVideo.densityFlags || [],
      metadata: {
        duration_seconds: selectedVideo.duration.seconds,
        author: selectedVideo.author.name,
        views: selectedVideo.views,
        fetched_at: new Date().toISOString(),
        query_used: query,
        user_role: userRole,
        experience_level: experience,
      },
    };

    await storeInVideoVault(vaultEntry, query, userRole, experience);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalVideos: any[] = [];
    if (selectedVideo) {
      finalVideos.push({
        videoId: selectedVideo.videoId,
        title: selectedVideo.title,
        channel: selectedVideo.author.name,
        duration: selectedVideo.duration.timestamp,
        reason: selectionSource === "gemini_rerank" ? "AI Pick - Best conceptual fit" : "Highest density match",
        isPick: true
      });
    }

    for (const cand of rankedCandidates) {
      if (finalVideos.length >= 3) break;
      if (cand.videoId === selectedVideo?.videoId) continue;
      finalVideos.push({
        videoId: cand.videoId,
        title: cand.title,
        channel: cand.author.name,
        duration: cand.duration.timestamp,
        reason: cand.densityScore && cand.densityScore > 0 ? `Good alternative (Score: ${cand.densityScore})` : "Alternative option",
        isPick: false
      });
    }

    QUICK_CACHE.set(cacheKey, {
      videos: finalVideos,
      timestamp: Date.now()
    });

    return NextResponse.json({
      videos: finalVideos,
      source: selectionSource,
      debug: {
        candidatesAnalyzed: rankedCandidates.length,
        usedAnchorChannel: searchTierUsed === "anchor_channel",
        searchTier: searchTierUsed,
      },
    });

  } catch (error) {
    console.error("❌ Video search pipeline error:", error);
    return NextResponse.json({
      videos: [{ videoId: CONFIG.FALLBACK_VIDEO_ID, title: "Error", channel: "System", duration: "0:00", reason: String(error), isPick: true }],
      source: "error_fallback",
    });
  }
}
