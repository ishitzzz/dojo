import { NextResponse } from "next/server";
import { searchVideos, secondsToTimestamp } from "@/utils/youtubeApi";
import type { LearningTopology } from "@/utils/topologyInference";
import { VideoCandidate } from "@/utils/searchScraper";
import { isAbsurdMismatch } from "@/lib/brain/scoring/rubric";
import {
  judgeCandidates,
  SELECTION_THRESHOLD,
  type MergedScore,
} from "@/lib/brain/scoring/judge";
import {
  checkVideoVault,
  storeInVideoVault,
  VideoVaultEntry,
} from "@/utils/videoVault";
import {
  analyzeQuery,
  filterByRelevance,
  checkRelevance,
} from "@/utils/queryIntelligence";
import { fetchVideoDetails, YouTubeEnhancement } from "@/utils/youtubeClient";
import { fetchIntroTranscripts } from "@/utils/transcriptClient";
import { normalizeVideoSpec, bandToApiDuration, VideoSpec } from "@/utils/videoSpec";
import { getFreshCacheEntry, setCacheEntry } from "@/lib/feedback/videoCache";
import { getRejections, isRejectedForChapter } from "@/lib/feedback/rejections";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  INITIAL_FETCH_COUNT: 10,
  MIN_VIDEO_DURATION: 120,      // 2 minutes minimum
  MAX_VIDEO_DURATION: 7200,     // 2 hours max
  FALLBACK_VIDEO_ID: "",
  RELEVANCE_THRESHOLD: 25,     // Minimum relevance score to pass guard
};

// Lightweight in-memory cache lives in src/lib/feedback/videoCache.ts
// (shared with the feedback route for dislike invalidation).

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

// Top candidates by relevance score BEFORE any duration filtering — used for
// honest "no_good_match" reporting when the duration spec empties the pool.
// When judged scores are available they are merged in; otherwise callers fall
// back to relevanceScore alone.
function buildBestCandidates(
  candidates: VideoCandidate[],
  subjects: string[],
  scoredById?: Map<string, MergedScore>
) {
  return candidates
    .map((c) => {
      const judged = scoredById?.get(c.videoId);
      return {
        videoId: c.videoId,
        title: c.title,
        channel: c.author.name,
        duration: secondsToTimestamp(Math.round(c.duration.seconds)),
        relevanceScore:
          subjects.length > 0
            ? checkRelevance(c.title, c.description, subjects, CONFIG.RELEVANCE_THRESHOLD).score
            : 0,
        score: judged?.finalScore ?? null,
        reason: judged?.reason ?? "",
      };
    })
    .sort(
      (a, b) =>
        (b.score ?? b.relevanceScore) - (a.score ?? a.relevanceScore)
    )
    .slice(0, 5);
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
  const chapterTitle = searchParams.get("chapterTitle") || undefined;
  const siblingTitlesParam = searchParams.get("siblingTitles");
  const siblingTitles = siblingTitlesParam
    ? siblingTitlesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  // M4.2: dislike reason guidance. Folded into SEARCH queries only — the
  // cacheKey stays derived from the ORIGINAL q so cache identity is stable.
  const rejectReason = (searchParams.get("rejectReason") || "").trim().toLowerCase();
  // M4 fast-path: post-dislike swaps trade grounding depth for latency —
  // primary search tier only, no transcript sentinel, capped judge budget.
  const fast = searchParams.get("fast") === "1";
  const REJECT_SEARCH_GUIDANCE: Record<string, string> = {
    "too basic": "advanced in-depth",
    "too advanced": "beginner introduction",
  };
  const searchGuidance = REJECT_SEARCH_GUIDANCE[rejectReason] || "";
  const withGuidance = (searchQuery: string): string =>
    searchGuidance ? `${searchQuery} ${searchGuidance}` : searchQuery;
  let topology: LearningTopology | undefined;

  const topologyParam = searchParams.get("topology");
  let rawSpecInput: unknown;

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
        const parsedBody = JSON.parse(rawBody) as { topology?: LearningTopology; spec?: unknown };
        topology = parsedBody.topology;
        rawSpecInput = parsedBody.spec;
      }
    } catch (_e) {
      topology = undefined;
    }
  }

  // Spec can also arrive as a JSON-encoded query param; it takes precedence over body.
  const specParam = searchParams.get("spec");
  let specIgnored = false;
  if (specParam) {
    try {
      rawSpecInput = JSON.parse(specParam);
    } catch (_e) {
      console.warn("⚠️ Invalid spec param ignored:", specParam.slice(0, 80));
      specIgnored = true;
    }
  }

  const spec: VideoSpec | undefined =
    rawSpecInput !== undefined && rawSpecInput !== null
      ? normalizeVideoSpec(rawSpecInput)
      : undefined;
  const effectiveMinDuration = spec
    ? Math.round(spec.expectedMinutes[0] * 60)
    : CONFIG.MIN_VIDEO_DURATION;

  // "wrong duration" dislike → relax the spec floor by 50% for this request
  // only (search/gating); the cacheKey keeps the ORIGINAL floor.
  const searchMinDuration =
    rejectReason === "wrong duration"
      ? Math.round(effectiveMinDuration * 0.5)
      : effectiveMinDuration;

  // Shared across all search tiers so every tier honors the same constraints.
  const videoDuration = spec ? bandToApiDuration(spec.targetDurationBand) : undefined;
  const publishedAfter =
    spec && spec.depth === "concept"
      ? new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString()
      : undefined;

  if (!query) {
    return NextResponse.json({
      videos: [{ videoId: CONFIG.FALLBACK_VIDEO_ID, title: "Fallback", channel: "System", duration: "0:00", reason: "No query provided", isPick: true }],
      source: "fallback"
    });
  }

  // Chapter context hash — prevents cross-chapter cache/vault collisions where
  // the same search phrase appears in different roadmap positions.
  const contextHash = [chapterTitle || "", (siblingTitles || []).join("|")].join("::");
  const cacheKey = `${query}|${modifier}|${userRole}|${experience}|${preferredChannel || "none"}|${
    spec ? `${spec.targetDurationBand}:${effectiveMinDuration}` : "nospec"
  }|${contextHash}`;

  // Merge stored dislike-rejections (M4.1) into the exclusion list so
  // previously rejected videos are filtered even when excludeIds is absent.
  const rejectedIds = [
    ...getRejections(cacheKey),
    ...(chapterTitle ? getRejections(chapterTitle) : []),
  ];
  const effectiveExcludeIds = Array.from(new Set([...excludeIds, ...rejectedIds]));
  if (rejectedIds.length > 0) {
    console.log(`🚫 Merging ${rejectedIds.length} stored rejection(s) for: "${query.slice(0, 30)}..."`);
  }

  // M4.2 structural fix: also consult the by-video-id rejection index so a
  // dislike is honored even when no client echoes query/chapter keys.
  const isRejected = (videoId: string | undefined | null): boolean =>
    Boolean(videoId) &&
    (effectiveExcludeIds.includes(String(videoId)) ||
      isRejectedForChapter(String(videoId), chapterTitle));

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Check Quick Cache
  // ═══════════════════════════════════════════════════════════════
  const cached = getFreshCacheEntry(cacheKey);
  if (cached) {
    // Filter rejected/excluded videos out of the cached list BEFORE any
    // short-circuit — a cached pick whose id is rejected must not be served.
    const usableVideos = (cached.videos || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => !isRejected(v?.videoId)
    );
    const mainVideoId = cached.videos ? cached.videos[0].videoId : cached.videoId;
    if (usableVideos.length > 0 && !isRejected(mainVideoId)) {
      console.log(`⚡ Quick cache hit for: "${query.slice(0, 30)}..."`);
      return NextResponse.json({
        videos: usableVideos,
        source: "quick_cache",
        status: "ok",
        ...(specIgnored ? { specIgnored: true } : {}),
      });
    } else {
      console.log(`🚫 Quick cache hit BUT excluded: ${mainVideoId}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Check Video Vault (Supabase)
  // ═══════════════════════════════════════════════════════════════
  try {
    const vaultResult = await checkVideoVault(query, userRole, experience, contextHash);

    // Check if the vault result is in the excluded list or rejected by id
    const isExcluded = vaultResult.entry && isRejected(vaultResult.entry.video_id);

    // Spec-awareness guard: a cached entry is only usable when its recorded
    // duration provably satisfies the requested spec floor — otherwise the hit
    // is ignored and the normal search pipeline runs.
    const entryDurationSeconds = vaultResult.entry?.metadata?.duration_seconds;
    const meetsSpecFloor =
      !spec ||
      (typeof entryDurationSeconds === "number" &&
        Number.isFinite(entryDurationSeconds) &&
        entryDurationSeconds >= searchMinDuration);

    if (vaultResult.found && vaultResult.entry && !isExcluded && meetsSpecFloor) {
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
      setCacheEntry(cacheKey, { videos: [entryVid] });
      return NextResponse.json({
        videos: [entryVid],
        source: "video_vault",
        status: "ok",
        ...(specIgnored ? { specIgnored: true } : {}),
      });
    } else if (isExcluded) {
      console.log(`🚫 Vault hit BUT excluded: ${vaultResult.entry?.video_id}`);
    } else if (vaultResult.found && !meetsSpecFloor) {
      console.log(`⏭️ Vault hit ignored, below spec floor (${effectiveMinDuration}s): ${vaultResult.entry?.video_id}`);
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
    // Fast-path skips the anchor tier: it costs an extra search round-trip and
    // the swap contract only needs a good-enough pick quickly.
    if (preferredChannel && !fast) {
      console.log(`⚓ Attempting Anchor Channel search for: ${preferredChannel}`);
      const anchorQuery = withGuidance(`"${preferredChannel}" ${query}`);
      const anchorResult = await searchVideos(
        anchorQuery,
        {
          maxResults: CONFIG.INITIAL_FETCH_COUNT,
          videoDuration,
          relevanceLanguage: "en",
          publishedAfter,
        },
        topology
      );

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
      const primaryResult = await searchVideos(
        withGuidance(smartQuery.primary),
        {
          maxResults: CONFIG.INITIAL_FETCH_COUNT,
          videoDuration,
          relevanceLanguage: "en",
          publishedAfter,
        },
        topology
      );
      if (primaryResult.length > 0) {
        rawVideos = primaryResult;
        searchTierUsed = "smart_primary";
      }
    }

    // --- TIER 2: FALLBACK QUERY (just subjects) ---
    if (rawVideos.length === 0) {
      console.warn("⚠️ Primary query returned 0. Trying fallback...");
      const fallbackResult = await searchVideos(
        withGuidance(smartQuery.fallback),
        {
          maxResults: CONFIG.INITIAL_FETCH_COUNT,
          videoDuration,
          relevanceLanguage: "en",
          publishedAfter,
        },
        topology
      );
      if (fallbackResult.length > 0) {
        rawVideos = fallbackResult;
        searchTierUsed = "smart_fallback";
      }
    }

    // --- TIER 3: RAW QUERY (last resort) ---
    if (rawVideos.length === 0) {
      console.warn("⚠️ Fallback returned 0. Using raw query...");
      const rawResult = await searchVideos(
        withGuidance(query),
        {
          maxResults: CONFIG.INITIAL_FETCH_COUNT,
          videoDuration,
          relevanceLanguage: "en",
          publishedAfter,
        },
        topology
      );
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
    if (effectiveExcludeIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      availableVideos = rawVideos.filter((v: any) => !effectiveExcludeIds.includes(v.videoId));
      const removedCount = rawVideos.length - availableVideos.length;
      if (removedCount > 0) {
        console.log(`♻️ Pre-slice Deduplication: Ignored ${removedCount} excluded videos.`);
      }
    }
    // By-video-id rejection index (M4.2): catch dislikes recorded under any
    // scope, independent of client-sent excludeIds.
    availableVideos = availableVideos.filter((v: { videoId?: string }) => !isRejected(v?.videoId));

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

      // An empty map = enrichment failed entirely (quota/network/missing key)
      // — we learned nothing, so every candidate stays in play. A non-empty
      // map proves the Data API answered, so any candidate it did NOT return
      // is deleted/private/stale (yt-search serves such ghost ids).
      if (enrichmentMap.size > 0) {
        // ═════════════════════════════════════════════════════════
        // STEP 5.55: ☠️ DEAD-VIDEO GUARD
        // Drop candidates the Data API doesn't recognize instead of letting
        // the judge pick a "This video isn't available anymore" corpse.
        // ═════════════════════════════════════════════════════════
        const beforeGuard = candidates.length;
        const guardedCandidates = candidates.filter((c) =>
          enrichmentMap.has(c.videoId)
        );
        const droppedCount = beforeGuard - guardedCandidates.length;

        if (beforeGuard > 0 && droppedCount === beforeGuard) {
          // Data API recognized 0/N ids — likely a partial/anomalous response
          // rather than mass deletion. Keep the pool to preserve the
          // always-return-a-video contract.
          console.warn(
            `☠️ Dead-video guard: Data API recognized 0/${beforeGuard} ids — keeping pool intact (possible API anomaly).`
          );
        } else {
          candidates = guardedCandidates;
          if (droppedCount > 0) {
            console.log(
              `☠️ Dead-video guard: Dropped ${droppedCount}/${beforeGuard} candidate(s) unknown to the Data API (dead/private/stale ids).`
            );
          }
        }

        candidates.forEach((candidate) => {
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
    // Fast-path skips the sentinel entirely — transcript snippets are grounding
    // sugar for the judge, not a correctness requirement, and they cost the
    // swap pipeline its biggest wall-clock chunk.
    const sentinelIds = candidates.slice(0, 5).map(c => c.videoId);

    if (!fast) {
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
    // STEP 7: SOFT DURATION GATE (absurd mismatches only)
    // The old hard 120s–7200s filter (and its self-erasing revert) is gone.
    // Everything except >3x-window outliers flows into soft scoring.
    // Legacy callers WITHOUT a spec bypass the gate entirely — the
    // always-return-video contract must hold for them.
    // ═══════════════════════════════════════════════════════════════
    const contextAwareTopic = previousTopic
      ? `${query} (User previously learned: ${previousTopic})`
      : query;

    const maxCapSeconds = modifier === "detailed" ? Number.POSITIVE_INFINITY : CONFIG.MAX_VIDEO_DURATION;
    const poolCandidates = spec
      ? relevantCandidates.filter(
          (v) => !isAbsurdMismatch(v, spec, maxCapSeconds)
        )
      : relevantCandidates;

    if (poolCandidates.length === 0) {
      console.warn(
        `⏱️ All ${relevantCandidates.length} relevant candidate(s) are absurd duration mismatches for "${query.slice(0, 40)}..." — reporting no_good_match.`
      );
      // Judge the full relevant pool so bestCandidates carries real scores;
      // on total judging failure we fall back to relevanceScore alone.
      let scoredById: Map<string, MergedScore> | undefined;
      try {
        const judgeResult = await judgeCandidates({
          candidates: relevantCandidates,
          topic: contextAwareTopic,
          userRole,
          experienceLevel: experience,
          spec,
          context: { chapterTitle, siblingTitles },
        }, fast ? { maxOutputTokens: 512, maxCandidates: 4 } : undefined);
        scoredById = new Map(judgeResult.ranked.map((v) => [v.videoId, v]));
      } catch (err) {
        console.warn("⚠️ Judging for no_good_match report failed:", err);
      }
      return NextResponse.json({
        status: "no_good_match",
        reason:
          `${relevantCandidates.length} relevant candidate(s) found, but every one is a >3x ` +
          `duration mismatch vs the target window (${Math.round(searchMinDuration / 60)} min minimum).`,
        videos: [],
        bestCandidates: buildBestCandidates(
          relevantCandidates,
          smartQuery.subjects,
          scoredById
        ),
        query,
        ...(specIgnored ? { specIgnored: true } : {}),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 8: 🧑‍⚖️ SCORED JUDGE (rubric signals + LLM semantic scores)
    // Returns {videoId,score,reason}[] — never a winner-only pick.
    // ═══════════════════════════════════════════════════════════════
    const judgeOptions = fast
      ? { maxOutputTokens: 512, maxCandidates: 4 }
      : undefined;
    const judgeResult = await judgeCandidates({
      candidates: poolCandidates,
      topic: contextAwareTopic,
      userRole,
      experienceLevel: experience,
      spec,
      context: { chapterTitle, siblingTitles },
    }, judgeOptions);

    const rankedByScore: MergedScore[] = judgeResult.ranked;
    const candidateById = new Map(poolCandidates.map((c) => [c.videoId, c]));

    const top = rankedByScore[0];
    let selectedVideo: VideoCandidate | undefined;
    let selectionSource = "scored_judge";
    let belowThreshold = false;

    if (playlistRef && rankedByScore.some((v) => v.videoId === playlistRef)) {
      if (top) {
        selectedVideo = candidateById.get(playlistRef);
      }
      selectionSource = "playlist_match";
      console.log(`🎬 Selected pre-computed playlist video: ${selectedVideo?.title}`);
    } else if (!top) {
      selectedVideo = undefined;
    } else if (top.finalScore >= SELECTION_THRESHOLD || !spec) {
      // Threshold gating applies to spec-aware calls; legacy callers without a
      // spec keep the always-return-video contract and take the top-ranked.
      selectedVideo = candidateById.get(top.videoId);
      console.log(
        `🧠 Judge picked [${top.finalScore}] ${selectedVideo?.title.slice(0, 50)}... (llm=${top.llmScore ?? "n/a"}, usedLLM=${judgeResult.usedLLM})`
      );
    } else {
      belowThreshold = true;
    }

    if (!selectedVideo) {
      // Honest scored empty state — carries the judged order for UI messaging.
      console.warn(
        `🚫 No candidate cleared SELECTION_THRESHOLD=${SELECTION_THRESHOLD} for "${query.slice(0, 40)}..."${belowThreshold ? ` (best=${top?.finalScore})` : ""}`
      );
      return NextResponse.json({
        status: "no_good_match",
        reason:
          `${poolCandidates.length} candidate(s) scored, but none reached the quality threshold (${SELECTION_THRESHOLD}/100).` +
          (belowThreshold ? ` Best score was ${top?.finalScore}.` : ""),
        videos: [],
        bestCandidates: rankedByScore.slice(0, 5).map((v) => ({
          videoId: v.videoId,
          title: candidateById.get(v.videoId)?.title ?? "",
          channel: candidateById.get(v.videoId)?.author.name ?? "",
          duration: candidateById.get(v.videoId)?.duration.timestamp ?? "0:00",
          score: v.finalScore,
          reason: v.reason,
        })),
        query,
        ...(specIgnored ? { specIgnored: true } : {}),
      });
    }

    console.log(`📊 Top ${Math.min(5, rankedByScore.length)} by Judge Score:`);
    rankedByScore.slice(0, 5).forEach((v, i) => {
      console.log(`  ${i + 1}. [${v.finalScore}] ${candidateById.get(v.videoId)?.title.slice(0, 50)}... — ${v.reason}`);
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 9: Store + Cache
    // ═══════════════════════════════════════════════════════════════
    const winnerVerdict = rankedByScore.find((v) => v.videoId === selectedVideo.videoId);

    const vaultEntry: VideoVaultEntry = {
      video_id: selectedVideo.videoId,
      title: selectedVideo.title,
      description: selectedVideo.description,
      transcript_snippet: selectedVideo.transcriptSnippet?.slice(0, 500) || "",
      density_score: winnerVerdict?.finalScore || 0,
      density_flags: winnerVerdict?.flags || [],
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

    await storeInVideoVault(vaultEntry, query, userRole, experience, contextHash);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalVideos: any[] = [];
    if (selectedVideo) {
      finalVideos.push({
        videoId: selectedVideo.videoId,
        title: selectedVideo.title,
        channel: selectedVideo.author.name,
        duration: selectedVideo.duration.timestamp,
        reason: winnerVerdict?.reason ?? "Top scored match",
        score: winnerVerdict?.finalScore ?? 0,
        isPick: true
      });
    }

    for (const verdict of rankedByScore) {
      if (finalVideos.length >= 3) break;
      const cand = candidateById.get(verdict.videoId);
      if (!cand || cand.videoId === selectedVideo?.videoId) continue;
      finalVideos.push({
        videoId: cand.videoId,
        title: cand.title,
        channel: cand.author.name,
        duration: cand.duration.timestamp,
        reason: verdict.reason,
        score: verdict.finalScore,
        isPick: false
      });
    }

    setCacheEntry(cacheKey, { videos: finalVideos });

    return NextResponse.json({
      status: "ok",
      videos: finalVideos,
      source: selectionSource,
      debug: {
        candidatesAnalyzed: rankedByScore.length,
        usedAnchorChannel: searchTierUsed === "anchor_channel",
        searchTier: searchTierUsed,
        judgeUsedLLM: judgeResult.usedLLM,
        fastMode: fast,
      },
      ...(specIgnored ? { specIgnored: true } : {}),
    });

  } catch (error) {
    console.error("❌ Video search pipeline error:", error);
    return NextResponse.json({
      videos: [{ videoId: CONFIG.FALLBACK_VIDEO_ID, title: "Error", channel: "System", duration: "0:00", reason: String(error), isPick: true }],
      source: "error_fallback",
    });
  }
}
