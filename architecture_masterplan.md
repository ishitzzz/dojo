# Architecture Masterplan v2: Learning Dojo — Full Build-Out

> Status: DRAFT for user approval. Supersedes the 7-day sprint scope (which shipped
> M1–M7 as vertical tracers). Every gap named below traces back to
> `architecture_hypothesis.md` / `video_pipeline_hypothesis.md`.

## Destination
A learning platform where ONE agent brain owns every AI interaction through a
capability/tool registry with personas + persistent memory; long videos become
gated mastery journeys; the whiteboard is driven by real diagram-planning
intelligence; the Chrome extension is a first-class brain entry point (focus
player, guided practice on any site, research copilot, resource sniffing); and
every interaction feeds a personalization engine that reshapes search,
resources, and roadmaps per learner.

---

## 1. Shipped Foundation (keep — do not rebuild)
| Layer | Assets |
|---|---|
| Brain core | TurnBus (replay bus), AgentLoop (6-round budget, ≤4 parallel tools, forced finish), Gemini streaming provider w/ key pool + dampener |
| Video pipeline | VideoSpec in chapter schema, Data-API-first search w/ spec bands, oEmbed liveness guard, scored judge (rubric + LLM {videoId,score,reason}[]), rejection index, vault w/ context keys, fast-path swap |
| Long video | /api/video-beats (eligibility, 8–12min windows, checks, no_transcript honesty), transcript forge (multi-provider, circuit breaker) |
| Whiteboard | Typed command schema, kinematic engine, DPR renderer, pacing floors, explain_board SSE capability, TTS gesture gate |
| Feedback | video_feedback store, dislike invalidation, swap UI, anon ids |
| Practice | practice-plan/outcome APIs, guide.js tracker, in-player card |
| Extension | MV3 focus player (nocookie, telemetry, deep-link), background SW, platform-linker button |
| UI | Workspace chat dock, judge badges, beats panel, practice card, /whiteboard page |
| Harness | Missions Orchestrator + omo-slim pantheon pairing |

## 2. GAP ANALYSIS (what the user rightly called missing)

### G1. DeepTutor Brain Depth (~60% unported)
Missing: UnifiedContext (tri-state tools, waitForUserReply), CapabilityRegistry +
manifests, prompt-block assembler (fixed precedence), personas (dojo-mentor/
peer/examiner) + loader, L3 memory (read/write tools over Supabase), skills
manifest + read_skill tool, compose_enabled_tools mounting policy, ask_user
pause semantics, Groq adapter (ADR-002 half-done), orchestrator shell.
Legacy: 15+ single-shot routes still bypass the brain.

### G2. Extension is MVP-only
Missing: TurnEvent transport (WS/SSE) both ways, Side Panel UI, watch-page mode
(CSS strip, autoplay-next kill), site adapters, full FolloMe practice stack
(4-layer resolver, ElementMatcher, RecoveryEngine, DOMStabilityMonitor,
SyncController — the ~1.5k LOC port + 200-line controller), Research Copilot
(arXiv/papers), cat-catch resource sniffing (media pairing, WebVTT track pull,
MSE capture, segment downloader), token auth, tab-injection upgrade for
guide.js.

### G3. Whiteboard lacks diagram intelligence
Current: one LLM call, generic prompt, no notion of diagram TYPES.
Missing: scene/diagram grammar (flowchart, sequence, comparison, timeline,
state machine, mindmap), diagram-planner sub-agents, per-scene streaming,
layout engine (no overlap), export (PNG/SVG), persistence + replay, whiteboard
as beat-fallback renderer (planned, never wired).

### G4. Long-video journey is an API, not an experience
Missing: player-integrated beat playback (jump-to-segment), pause/check gate
UI, fail→whiteboard-re-explain loop, per-beat progress persistence, resume
across sessions, mastery gating tied to Feynman/examiner.

### G5. Personalization & Resources barely exist
Missing: learner profile (level/language/goals) actually feeding prompts;
operator QueryBuilder (search-bar ops dual-artifact); learned channel authority
+ query strategy stats from video_feedback aggregation; roadmap self-healing
(👎×N → regeneration proposals); Scrapling sidecar + curated allowlist crawling;
find_resources tool; pgvector semantic match (column exists, unused);
watch-% implicit signals into rubric weights.

### G6. Platform hardening
Missing: auth flow (RLS wide open), schema repairs (nexus_cache, learning_contexts
migrations; 3 conflicting video_vault defs), unified error envelopes, quota
discipline layer (cache-first routing, daily budgets), test suite, observability.

## 3. PHASED ROADMAP (serial phases, tracer-bullet features inside)

### Phase A — Brain Completion (Wk 1–2)
| # | Feature | Ships | Blocked by |
|---|---|---|---|
| A1 | Schema repairs + auth foundation | migrations (nexus_cache, learning_contexts, video_vault reconciliation), sign-in (Supabase Auth), RLS policies on all tables, user_id threading everywhere | — |
| A2 | UnifiedContext + CapabilityRegistry + orchestrator shell | context.ts, registry.ts, manifests, startTurn() facade; /api/turn accepts capability param | A1 |
| A3 | Prompt assembler + personas | fixed block precedence, dojo-mentor/peer/examiner presets, eager injection | A2 |
| A4 | Memory L3 | memory_docs migration, read_memory/write_memory tools, auto-injection (L3-concat) | A1,A2 |
| A5 | Skills manifest + read_skill tool + composeEnabledTools | tri-state mounting policy ported verbatim | A2 |
| A6 | Capability cutover wave 1 | tutor_chat, architect (topology→research→skeleton→validate spine), examiner (Feynman gate: cannot advance until feynman_passed); delete chat-companion/generate-roadmap/validate-feynman routes | A3–A5 |
| A7 | Groq adapter + provider registry | ChatProvider interface done properly; failover absorbed as transport detail | A2 |
Acceptance highlights: every AI touchpoint goes through /api/turn; persona
switch changes tone; memory persists across sessions; Feynman gate blocks
module advance; zero direct generateContent calls outside providers/.

### Phase B — Long-Video Mastery Journey (Wk 2–3)
| # | Feature | Ships | Blocked by |
|---|---|---|---|
| B1 | Beat player integration | embedded player seeks to beat.startSec, beat list synced to playback, keyboard nav | — |
| B2 | Check gates | pause at beat end → question/summary/flowchart picker; pass→continue; fail→B3 | B1 |
| B3 | Whiteboard re-explain loop | failed beat → auto explain_board turn scoped to that beat's transcript chunk → resume | B2, M5 |
| B4 | Progress + resume | beat_progress table, cross-session resume banner, % mastery per video | B2, A1 |
| B5 | Mastery gating | video journey completion feeds examiner/Feynman state; module lock/unlock | B4, A6 |
Acceptance: a 7h course watched as gated 10-min sprints; failing a beat gets a
whiteboard re-teach; closing mid-journey resumes exactly.

### Phase C — Whiteboard Intelligence (Wk 3–4)
| # | Feature | Ships | Blocked by |
|---|---|---|---|
| C1 | Diagram grammar v2 | typed templates: flowchart/sequence/comparison/timeline/state/mindmap; layout engine (grid+collision) | — |
| C2 | Diagram-planner sub-agents | planner picks diagram type(s) per concept chunk; layout-agent assigns coordinates; drawer emits commands — runs as parallel brain sub-tasks | C1, A6 |
| C3 | Streaming scenes | planner streams scene-by-scene (kill the 9s dead time); NARRATION precedes its DRAW_DELTAs live | C2 |
| C4 | Persistence + export | save/replay boards, PNG/SVG export, share link | C1 |
| C5 | Voice upgrade | voice selection, per-persona narration style, rate control persisted | A3 |
Acceptance: "explain kubernetes operators" yields a labeled architecture
flowchart + sequence diagram, drawn scene-by-scene with zero dead time.

### Phase D — Extension v2 (Wk 4–5)
| # | Feature | Ships | Blocked by |
|---|---|---|---|
| D1 | TurnEvent transport | extension ↔ brain over SSE/WS with session continuity; side panel chat = tutor_chat anywhere | A6 |
| D2 | Watch-page mode | youtube.com content script strips feed/sidebar/comments, kills autoplay-next | — |
| D3 | Practice Engine full port | FolloMe resolver stack (~1.5k LOC): buildSelector, ElementMatcher, RecoveryEngine, DOMStabilityMonitor, SyncController + EXECUTE_GUIDANCE controller; hint ladder (nudge→explain→show-me); works on figma/docs/arxiv adapters | A6 |
| D4 | Research Copilot | arXiv/journal extractor (title/abstract/sections/figures), section-by-section walkthrough, highlights→platform notebook/memory | D1, A4 |
| D5 | Resource sniffer (cat-catch lineage) | webRequest send/response pairing for PDFs/slides/datasets; WebVTT subtitle enumeration; MSE capture; segment downloader for link-rot archives → feeds find_resources | D1 |
| D6 | Token auth + security pass | platform-issued tokens, strip telemetry monkey-patches, all_frames, event-driven MV3 lifecycle | A1, D1 |
Acceptance: Figma practice step with ghost-cursor + drift recovery; arXiv paper
walkthrough syncing notes to platform; a lecture page's PDF+slides auto-captured
as resources.

### Phase E — Personalization & Resources (Wk 5–6)
| # | Feature | Ships | Blocked by |
|---|---|---|---|
| E1 | Learner profile | onboarding v2 (role/level/language/goals) → profile table → injected into query builder, judge, resources, personas | A1 |
| E2 | Operator QueryBuilder | dual-artifact queries (operator string for scraper surfaces + strict params for Data API); anti-clickbait ops finally wired | — |
| E3 | Learned weights | nightly SQL aggregation of video_feedback → channel authority map + query-strategy stats → rubric weight overrides | M4 data |
| E4 | Roadmap self-healing | 👎×2 same module → flag; watch-completion → remedial chapter proposals via architect | E3, A6 |
| E5 | Scrapling sidecar | python service (adaptive selectors, stealth fetchers) crawling curated allowlist (MDN, official docs, awesome-lists); Resource objects | E1 |
| E6 | find_resources tool + semantic match | resources as first-class as videos; pgvector embeddings for title/concept match | E5, A1 |
| E7 | Implicit signals | extension watch-% → rubric freshness/engagement weights; drop-off heatmaps | D5 |
Acceptance: same topic, two different learners get different videos AND
different resources; two 👎s trigger a module rebalance proposal.

### Phase F — Hardening & Demo (Wk 6+, rolling)
Auth-protected demo path E2E rewrite of docs/DEMO.md · error envelope
standardization · quota dashboard + cache-first budget router · unit/integration
test suite (vitest) around rubric/judge/beats/pacing (pure modules first) ·
observability (structured logs, per-route latency) · seed script for demos ·
README/deployment story.

## 4. Execution method
Same as sprint, scaled: Missions Orchestrator protocol — Discovery Swarm per
unfamiliar subsystem (FolloMe internals, cat-catch, Scrapling), confidential
validation contracts per feature, Dual-Axis validators, Reality Checker per
phase, commit per feature (user-approved cadence: per-feature autonomous).

## Decisions carried forward (ADR log)
- ADR-001 single /api/turn SSE (extend WS only when extension demands duplex)
- ADR-002 ChatProvider interface; Gemini+Groq adapters; key-pool stays transport detail
- ADR-V1 Data API primary, yt-search dev-only; ADR-V2 spec travels in chapter; ADR-V3 feedback→weights/cache never hide results; ADR-V4 operators only in web-surface artifact; ADR-V5 extension is entry point, not brain

## Fog of War (resolved as frontier advances)
Scrapling hosting model (local sidecar vs managed) · embedding dim migration
(1536 OpenAI-shaped vs Gemini) · WS-vs-SSE for extension duplex · arXiv ToS for
bulk fetch · companion-app bundling · cost ceiling per learner/day.

## Out of Scope (unchanged)
Hosting content; non-YouTube primary curriculum medium; global rec-sys beyond
channel weights; clicking FOR users (guidance/tracking only).
