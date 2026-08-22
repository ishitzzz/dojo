# Project: Learning Dojo — 7-Day Closed-Loop Sprint

## Destination
One demo-able vertical slice: topic → roadmap with VideoSpec → best-fit video via Data
API → 👍/👎 feedback with instant swap → AI whiteboard gap-filler for missing resources →
extension focus-player telemetry → one guided practice step. Every module verified by
build + targeted runtime scripts.

## Milestone 1: VideoSpec + Data API Search Rewrite (Day 1)
### Feature 1.1: VideoSpec in chapter schema
- Description: generate-roadmap skeleton + module_details prompts emit `videoSpec` per chapter.
- Schema: `{ targetDurationBand: "short"|"medium"|"long", expectedMinutes: [min,max], stylePriority: string[], depth: "concept"|"implementation"|"mastery" }`
- **Soft-band rule (updated):** `expectedMinutes` is a *preference window*, not a hard wall. 26-32 min on a [12,35] spec = zero penalty. Scoring (M3) applies distance-based penalty, not hard reject. Only truly absurd mismatches are filtered. Reserve `long` for `depth: mastery` deep-dives; most basics stay medium.
- Acceptance criteria:
  - Skeleton JSON schema includes videoSpec; safeJsonParser tolerates absence (back-compat default).
  - LLM assigns "long"/[25,90]-style bands to deep topics, short/intro bands to basics (spot-check 3 topics).
  - A 30-min video on a [12,35] spec is NOT rejected (soft scoring check).
- Blocked by: None

### Feature 1.2: Data API search with server-side filters
- Description: rewrite `src/utils/youtubeApi.ts` searchVideos to require YOUTUBE_API_KEY; pass videoDuration (short|medium|long), relevanceLanguage ("en"), publishedAfter (freshness by depth), maxResults 10; yt-search only when key absent.
- Acceptance criteria:
  - No sub-expectedMinutes[0] video can be selected for a chapter whose spec band is "long" or "medium" (filter at candidate intake).
  - With no key: falls back to current scraper behavior unchanged.
- Blocked by: Feature 1.1

### Feature 1.3: get-video consumes spec
- Description: `/api/get-video` accepts `videoSpec` param; MIN duration floor comes from spec.expectedMinutes[0] instead of global 120s; empty pool returns honest `{status:"no_good_match", bestCandidates:[...]}` instead of unfiltered revert.
- Acceptance criteria:
  - The self-erasing filter revert path (route.ts ~368-377) is gone; response carries status field.
  - Existing callers (Workspace/DojoView) still work without passing spec (optional param).
- Blocked by: Feature 1.2

## Milestone 2: Brain Core (Day 2)
### Feature 2.1: TurnEvent types + TurnBus
- `src/lib/brain/types/events.ts` discriminated union (SESSION, STAGE_START/END, CONTENT, THINKING, TOOL_CALL, TOOL_RESULT, SOURCES, RESULT, ERROR, DONE); `runtime/turnBus.ts` async-generator fan-out w/ history replay + close sentinel.
- Blocked by: None

### Feature 2.2: Gemini streaming provider + AgentLoop
- `providers/gemini.ts`: streaming chat with function calling over @google/generative-ai, reusing key-pool failover from utils/gemini.ts as transport detail.
- `runtime/agentLoop.ts`: round = 1 call; no-tool-call round = final; parallel tool dispatch cap 4; forced finish on budget(6 rounds); emits CONTENT deltas + TOOL_CALL/RESULT events.
- Blocked by: 2.1

### Feature 2.3: /api/turn SSE route + find_video tool
- Single POST route streams TurnEvents; tools registry with ONE tool `find_video(q, videoSpec?)` wrapping the existing pipeline; tutor_chat capability hardcoded (no registry yet).
- Acceptance criteria: curl SSE session shows streamed text + a real tool call resolving a real videoId.
- Blocked by: 2.2, M1

## Milestone 3: Scored Judge (Day 3)
### Feature 3.1: Rubric + judge
- `src/lib/brain/scoring/rubric.ts` (deterministic signals incl. **soft duration-fit vs spec** + **scope-fit/coverage penalty**) + `judge.ts` (LLM returns {videoId,score,reason}[] not winner-only). Selection = top score above threshold; UI alternatives ordered.
- **Soft duration-fit:** score = 0 inside expectedMinutes window, gentle linear penalty outside (±20%), heavy penalty only at >3x. A 27-min video on a [12,25] spec loses ~2 pts, not disqualified.
- **Scope-fit penalty (C++ 7hr fix):** title/description containing "full course"/"complete" + broad topic coverage when chapter is narrow subtopic → heavy penalty. Judge sees sibling chapter titles to detect over-scoped videos.
- Blocked by: M1

### Feature 3.2: 7-hour video digest plan (beat-chapterization)
- When a picked video is genuinely long (duration > 40 min) and spec is `depth: mastery` or `targetDurationBand: long`, transcript is auto-beat-split into 8-12 min segments. At each beat: pause → comprehension check (1 question / summary / flowchart / mini-game). Pass → continue; fail → whiteboard re-explains that beat. Transcript fetcher fixed to use `youtube-transcript` (not failing python bridge).
- Blocked by: 3.1

### Feature 3.3: Wire into get-video; delete dead fallbacks
- Remove github.com-description fallback and index-0 blind picks; keep vault but key includes chapter context hash. Replace hard duration filter with soft rubric call (see 3.1).
- Blocked by: 3.1

## Milestone 4: Feedback Loop (Day 4)
### Feature 4.1: video_feedback table + API
- Supabase migration `(user_id, video_id, chapter_key, signal watch_pct|like|dislike|reason, value, created_at)`; POST endpoint; dislike invalidates QUICK_CACHE + vault entry permanently.
- Blocked by: None

### Feature 4.2: Real-time swap in Workspace UI
- 👎 button → POST + immediate re-fetch with excludeIds += rejected + reason folded into query; new pick swaps in-place without reload.
- Blocked by: 4.1

## Milestone 5: explain_board Whiteboard v1 (Day 5)
### Feature 5.1: Port rendering core into src/lib/whiteboard/
- CanvasInterceptor.ts + kinematicEngine.ts from ai-whiteboard repo (strip eval — typed draw commands only); renderer loop component with DPR + logical 800x500 transform.
- Blocked by: M2

### Feature 5.2: explain_board capability
- Beats planner (LLM emits {title, narration, drawCommands}[] scenes); streams DRAW_DELTA/NARRATION TurnEvents; TTS per scene (speechSynthesis); interrupt = new turn, return-to-thread = beat queue resume. Also serves as fallback renderer for 7-hour beat summaries (flowchart/whiteboard for a failed beat).
- Acceptance: "Explain Helm charts" produces ≥3 narrated scenes; mid-scene question redirects then resumes remaining beats.
- Blocked by: 5.1, M2, M3 (reuses transcript beat logic)

## Milestone 6: Extension MVP (Day 6)
### Feature 6.1: Focus player + telemetry
- New extension folder `extension/` (MV3): embedded youtube-nocookie player page, IFrame API watch-%/ended events → POST platform /api/feedback, deep-link back with next-chapter context.
- Blocked by: M4

## Milestone 7: Practice Step + Integration (Day 7)
### Feature 7.1: EXECUTE_GUIDANCE ↔ STEP_OUTCOME closed
- Port FolloMe overlay.js + passive-tracker.js into extension; platform emits single-step PracticePlan; completion event stored to progress table.
- Blocked by: M6

### Feature 7.2: Demo path E2E
- Scripted run: Terraform topic → roadmap → stage videos → forced gap → whiteboard fills → practice step completes → next module suggestion. Recorded as docs/DEMO.md.
- Blocked by: all

## Execution Method
Serial features; each verified by `npm run build` + targeted node verification script before next starts. Commits per milestone on dojo-clean branch after user confirmation.
