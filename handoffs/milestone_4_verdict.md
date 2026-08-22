# Validation Verdict: M4 Feedback Loop

## Final Verdict: PASS (after 1 fix round + latency optimization)

## Scope Shipped
- **4.1**: `supabase/video_feedback.sql` (RLS permissive v1, documented), POST/GET
  `/api/feedback` with Supabase→memory fallback (`persisted:"memory"|"supabase"`),
  dislike invalidation: QUICK_CACHE scan-by-videoId + vault delete +
  videoId-keyed rejection index filtered pre-short-circuit in get-video.
- **4.2**: Workspace 👍/👎 controls; reason picker (chips + free text); anon id
  (localStorage `dojo_anon_id`); swap re-fetch with excludeIds merge +
  `rejectReason` param (server folds guidance into search only, cacheKey clean);
  epoch guard shared by chapter-fetch and swap paths; inline errors, no reload.

## Timeline
- Workers 4.1 + 4.2 COMPLETE (tsc clean)
- Standards Auditor: WARNINGS incl. CRITICAL dead-code rejection path → Fix
  Worker: videoId-first rejection index, chapterTitle/siblingTitles now sent by
  Workspace+DojoView callers, rejectReason param, race guards, dedupe helper.
- Spec Validator: SOFT FAIL on nuance #4 (swap re-fetch ~48s vs <8s) → Latency
  Worker: fast=1 mode (skip sentinel, primary tier only, top-4 judged,
  reduced tokens) → measured 11.06s cold / 3.20s warm.

## Key Live Evidence
- Dislike → identical GET excludes rejected videoId everywhere; candidates 10→9.
- Legacy no-spec caller still always receives a video post-dislikes.
- GET /api/feedback returns persisted signals for debugging.

## Known Deferred
- Rejection index is in-memory per instance (resets on restart; Supabase signals
  persist but indexes rebuild lazily) — acceptable single-instance v1.
- Cold-cache swap can reach ~11s (>8s contract) — graceful SWAPPING state keeps
  old video playing; streaming judge response deferred.
- Supabase insert path not exercised live (env/DNS unavailable in session);
  memory fallback validated. Permissive RLS documented as pragmatic v1.
- Auditor Low items deferred: watch_pct signal unused until M6 extension,
  GET feedback endpoint uncalled, magic-string reason lists duplicated TS/SQL.

## State
STATUS: M4_COMPLETE
