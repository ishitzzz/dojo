# Validation Contract — 7-Day Sprint
> CONFIDENTIAL: Validators only. Never share with Worker subagents.

## M1: VideoSpec + Data API Search

### Feature 1.1: videoSpec emission
#### Fundamental
- [ ] `POST /api/generate-roadmap` (mode=skeleton) response chapters each carry a valid videoSpec object (band ∈ {short,medium,long}, expectedMinutes[0] < expectedMinutes[1], depth ∈ 3 enums) — verify with 2 live topics.
- [ ] A chapter missing videoSpec does not crash downstream (default applied).
#### Nuance
- [ ] Deep topic ("kubernetes operators") gets long/[20+] band; basics ("what is docker") get short/medium — no inversion.

### Feature 1.2: Data API filters
#### Fundamental
- [ ] With YOUTUBE_API_KEY set, outbound search.list requests include type=video and videoDuration matching spec band (verify via logged request URL).
- [ ] Zero candidates shorter than expectedMinutes[0] appear in final selection for medium/long chapters across 5 queries.
- [ ] Without key: yt-search fallback path still returns results (no hard crash).
#### Nuance
- [ ] relevanceLanguage=en present; publishedAfter present for depth=concept (freshness) — reasonable window (≤3y).

### Feature 1.3: honest empty state
#### Fundamental
- [ ] Construct query engineered to fail duration floor → response has status:"no_good_match" and does NOT contain an off-spec videoId as primary pick.
- [ ] Old callers without videoSpec param still get a video (regression).
#### Nuance
- [ ] Response includes bestCandidates array (≥1 entry) for UI messaging.

## M2: Brain Core
### Feature 2.1/2.2: bus + loop
#### Fundamental
- [ ] SSE stream emits SESSION → ≥1 CONTENT delta → DONE for plain chat prompt (curl-verifiable).
- [ ] find_video tool call round-trips: TOOL_CALL emitted, real YouTube API invoked, TOOL_RESULT carries videoId, loop continues to final answer citing it.
- [ ] Budget cap: prompt forcing >6 tool rounds terminates with forced finish (no hang ≤60s).
#### Nuance
- [ ] THINKING deltas absent on Gemini (no reasoning field) — stream doesn't stall waiting for them.
- [ ] Two concurrent /api/turn sessions don't cross-contaminate events (session_id scoping).

## M3: Judge
#### Fundamental
- [ ] Judge output parses as array of {videoId,score,reason}; winner = max score; reason strings non-empty for top 3.
- [ ] Duration-fit signal demonstrably reorders candidates vs old density order in ≥1 live case (log both orders).
#### Nuance
- [ ] github.com-description candidate no longer auto-wins when judge scores low.

## M4: Feedback Loop
#### Fundamental
- [ ] POST feedback persists row (Supabase select confirms); dislike removes QUICK_CACHE + vault entries (subsequent get-video ≠ same pick).
- [ ] 👎→swap flow: new primary videoId ∉ rejected set, no page reload.
#### Nuance
- [ ] Re-fetch latency < 8s; failure shows inline error, not silent.

## M5: Whiteboard
#### Fundamental
- [ ] "Explain Helm charts" renders ≥3 scenes sequentially, narration text per scene, strokes animate progressively (not instant).
- [ ] Mid-explanation question ("go back to templating") redirects; after answer, remaining beats resume automatically.
- [ ] No new Function/eval anywhere in ported code (grep gate).
#### Nuance
- [ ] Drawing fits viewport on 1440px screen (logical-space transform works); speed control changes stroke pacing.

## M6: Extension
#### Fundamental
- [ ] Load unpacked → open player page with videoId param → plays with zero YouTube recommendations visible.
- [ ] ended event fires POST to platform with watchedPct ≥ 95; deep-link opens platform at correct chapter.
#### Nuance
- [ ] Early exit (~30%) also posts signal with droppedAtSec.

## M7: Practice + E2E
#### Fundamental
- [ ] Practice step highlights target element; clicking it advances state; STEP_OUTCOME persisted.
- [ ] Full demo script runs start→finish with no manual dev-tools intervention.
#### Nuance
- [ ] Demo completes < 10 minutes end-to-end.

### Integration Assertions (sprint level)
- [ ] npm run build passes with zero TS errors after every milestone.
- [ ] No secrets in any committed file at sprint end (regex sweep).
