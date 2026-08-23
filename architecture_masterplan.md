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
| A2 | UnifiedContext + CapabilityRegistry + orchestrator shell | context.ts (tri-state enabledTools, metadata.waitForUserReply callback), BaseCapability {manifest; run(context, stream)}, registry keyed by string, startTurn() facade, emit_capability_result() carrying {response, completed, engine stats, cost_summary}; /api/turn accepts capability param | A1 |
| A3 | Prompt assembler + personas + Persona Studio | fixed block precedence (general → policy → loop contract → capability playbook → persona → memory → tools → skills); built-in dojo-mentor/peer/examiner loaders; **Persona Studio**: user-created personas (name, prompt block, narration voice, model pref) stored in `personas` table, CRUD API, selector in chat dock, one active, eager injection | A2 |
| A4 | Full memory stack L1+L2+L3 | **L1 working** (per-turn scratchpad: current chapter, open questions, tool results windowed); **L2 project notebook** (`learning_contexts` repaired: highlights, notes, whiteboard exports, arXiv annotations — written by UI + Research Copilot, read by capabilities); **L3 durable profile** (`memory_docs`: preferences, learned style, goals — readMemory concat-on-inject / writeMemory preference tool); all three exposed as tools AND auto-injected per layer policy (L1 always, L2 on topic match, L3 eager) | A1,A2 |
| A5 | ToolRegistry depth + mounting policy | BaseTool contract, alias map, toOpenAiSchema(), deferred/progressive tool disclosure, allowlist refusals, missing-arg guard; **parallel dispatch cap raised 4→8** with dedupe; ask_user pause semantics (WAIT_FOR_INPUT event) vs terminate outcomes; forced/suppressed finish; byte-stable system prompt with volatile seeds appended to user msg; composeEnabledTools = pure function (toggles ∩ whitelist → context-gated auto-mounts → capability-owned → always-on) | A2 |
| A6 | Deep Research capability (8–9 specialists) | `deep_research` capability fans out bounded parallel sub-loops: **scout** (decompose question), **source-hunter** (web/docs + **agent-reach** CLI: Reddit threads, X posts, community signals — real learners' opinions on the topic), **video-scout** (Data API multi-query), **transcript-miner**, **resource-curator** (Scrapling allowlist), **critic** (fact-check/contradiction pass), **synthesizer** (merge findings), **outline-architect** (teaching order), **gap-analyzer** (what's missing → follow-up queries); streams THINKING/SOURCES/STAGE events per specialist; budget-capped rounds; result = cited brief + sources + gaps → optional auto-roadmap patch proposal | A5 |
| A7 | Provider registry complete | ChatProvider interface done properly: Gemini + Groq adapters; key-pool failover absorbed as transport detail; per-capability model override (from persona/preset) | A2 |
| A8 | Capability cutover waves | Wave 1: tutor_chat, architect (topology→research→skeleton→validate spine), examiner (**Feynman gate**: cannot advance until feynman_passed). Wave 2: nexus_curator (generate-nexus/expand-node → knowledge_nodes/node_edges tables finally used), roadmap_surgeon, conversation_guide; DELETE legacy routes (chat-companion, generate-roadmap, validate-feynman, generate-nexus, expand-node, roadmap-surgeon, conversation-guide) | A3–A5 |
| A9 | Remote client session fabric (extension-as-endpoint) | capability runtime can ADDRESS external clients: a client registry (web UI, extension tabs, companion) keyed by session; duplex TurnEvent channel per client (SSE now, WS when duplex needed); **guidance sub-agents**: the brain spawns a dedicated GuideAgent loop bound to one extension tab — it holds a command vocabulary (EXECUTE_GUIDANCE steps, highlight, hint, navigate) and consumes that tab's STEP_OUTCOME/DOM-event stream; monitor semantics = same budget/forced-finish rules as any AgentLoop; this is the seam Phases B/D hang on | A2,A5 |
Acceptance highlights: every AI touchpoint goes through /api/turn with a
capability; persona switch changes tone AND voice; L1/L2/L3 each provably
read/written; Feynman gate blocks module advance; deep_research produces a
cited multi-source brief from 8–9 named specialists; zero direct
generateContent calls outside providers/.

### Phase B — Long-Video Mastery Journey (Wk 2–3)
| # | Feature | Ships | Blocked by |
|---|---|---|---|
| B1 | Beat player integration | embedded player seeks to beat.startSec, beat list synced to playback (current-beat highlight, keyboard nav), beat progress bar | — |
| B2 | Check gate suite (full test/game types) | pause at each beat end → check picker driven by beat content: **quiz** (auto-generated 2–3 question bank per beat: MCQ + short answer), **summary** (learner writes; LLM-scored vs beat transcript), **flowchart reconstruction** (place given nodes → connect edges → validated vs gold graph), **mini-games**: term-matching pairs, fill-in-the-blank commands/code, step-ordering drag, true/false rapid-fire; pass threshold configurable per depth | B1 |
| B3 | Remediation ladder on fail | fail → inline hint → **whiteboard re-explain of THAT beat** (auto explain_board turn scoped to beat transcript) → micro-recap clip (beat summary TTS) → alternative-video fallback for the segment; each rung logged as a mastery datapoint | B2, M5 |
| B4 | Progress + resume + spaced repetition | `beat_progress` table (per user/beat: attempts, score, remediation used); cross-session resume banner; **failed beats resurface** next session via simple spaced-repetition queue; % mastery per video/module; XP + streaks + badges (light gamification, no leaderboards v1) | B3, A1 |
| B5 | Mastery gating | journey completion feeds examiner/Feynman state (feynman_passed, confusion_count in user_progress — table exists, finally wired); module lock/unlock; examiner can pull any failed beat as exam material | B4, A8 |
Acceptance: a 7h course becomes gated 10-min sprints with mixed
question/summary/flowchart/mini-game checks; failing a flowchart reconstruction
gets a whiteboard re-teach then a retry; closing mid-journey resumes exactly;
two failed beats auto-surface at next session start.

### Phase C — Whiteboard Intelligence (Wk 3–4)
| # | Feature | Ships | Blocked by |
|---|---|---|---|
| C1 | Diagram grammar v2 | typed templates: flowchart/sequence/comparison/timeline/state/mindmap; layout engine (grid+collision) | — |
| C2 | Diagram-planner sub-agents | pipeline of specialist passes over each concept chunk: **concept-chunker** (splits explanation into drawable units) → **type-selector** (picks flowchart/sequence/comparison/timeline/state/mindmap per unit from the grammar) → **layout-engine** (grid assignment + collision resolution — no overlapping labels ever) → **drawer** (emits typed commands per template recipe: labeled 4-pt boxes, arrow+V-head connectors, swimlanes for sequence) → **critic** (visual-QA pass: overlap/legibility check, re-layout on fail); runs as parallel brain sub-tasks with STAGE events | C1, A6 |
| C3 | Streaming scenes | planner streams scene-by-scene (kill the 9s dead time); NARRATION precedes its DRAW_DELTAs live | C2 |
| C4 | Persistence + export | save/replay boards, PNG/SVG export, share link | C1 |
| C5 | Voice upgrade | voice selection, per-persona narration style, rate control persisted | A3 |
Acceptance: "explain kubernetes operators" yields a labeled architecture
flowchart + sequence diagram, drawn scene-by-scene with zero dead time.

### Phase D — Extension v2: The Brain's Hands (Wk 4–5)
> Design stance: the extension is NOT a telemetry sender — it is a remote
> endpoint the brain operates through. FolloMe already proved the Side Panel +
> guidance UX; the work is wiring it to Learning Dojo's brain via A9.

| # | Feature | Ships | Blocked by |
|---|---|---|---|
| D1 | TurnEvent transport + client registration (**cross-platform telemetry**: every extension surface streams PLAYER_EVENT/PRACTICE_OUTCOME/PAGE_CONTEXT into the central analytics pipeline — off-platform learning counts) | extension registers as a brain client on connect (A9 fabric); duplex channel carries commands TO the tab and events FROM it; session continuity across tab reloads; **Side Panel = ported FolloMe panel** (guidance steps / chat / progress) re-skinned to dojo theme, wired to tutor_chat + live_guidance capabilities | A9 |
| D2 | Watch-page mode | youtube.com content script strips feed/sidebar/comments, kills autoplay-next | — |
| D3 | Practice Engine full port | FolloMe resolver stack (~1.5k LOC): buildSelector, ElementMatcher (+50 text/+30 type/+20 aria), RecoveryEngine tiers, DOMStabilityMonitor (weighted mutation threshold 30), SyncController version-checked pipelines, detectCanvasHeavy CDP Input.dispatchMouseEvent flip, pre/post-click dud detection + network-idle gating, UI-TARS vision grounding as last escalation; **PracticePlan anchor chain schema**: data-testid → aria-label → text-anchor → CSS path → region fingerprint; hint ladder (nudge → explain → show-me); authoring via vendored TipTour recorder.js (797 lines, record/replay); ~200-line EXECUTE_GUIDANCE controller; offscreen document for player events; works on figma/docs/arxiv adapters | A9 |
| D4 | Recorder agent (memory writer) | extension-resident agent capturing the learner's real action traces (clicks, inputs, navigation, dud-clicks) during managed sessions → normalized into L2 notebook entries ("user did X in Figma") + exemplar store for future guidance plans; explicit consent toggle; nothing recorded outside managed sessions | D1, A4 |
| D5 | Live Guide agent (real-time helper) | brain-spawned GuideAgent bound to the active tab (A9): watches STEP_OUTCOME stream, drives overlay steps in real time, escalates hint ladder on stall, answers context-aware Side Panel questions ("what does this panel do?") with current page state injected from context-extractor; drift → re-resolve via RecoveryEngine without losing plan position | A9, D3 |
| D6 | Research Copilot | arXiv/journal extractor (title/abstract/sections/figures), section-by-section walkthrough in Side Panel, highlights → L2 notebook sync | D1, A4 |
| D7 | Resource sniffer (cat-catch lineage) | webRequest send/response pairing for PDFs/slides/datasets; WebVTT subtitle enumeration; MSE capture; segment downloader for link-rot archives → feeds find_resources; per-site rule format user-extensible | D1 |
| D9 | Universal bookmarking + native import | one-click **Save to Dojo** on ANY page/PDF/paper (extension action + context menu) → resource_feedback-tagged entry in Resource Hub dashboard (Linkwarden archive behind it); **embedded-media import**: sniffed third-party videos are pulled into the platform for NATIVE viewing — instantly eligible for the full beats/mastery journey (B1–B5) instead of sending users elsewhere | D7, E6 |
| D10 | Practice-site selector agent | brain agent that decides WHEN/WHERE the extension can facilitate live practice on ARBITRARY sites: scores the current page's context-extractor output (interactive elements present? canvas-heavy? login state?) against active chapter goals → proactively offers "you could practice X right here"; generic fallback adapter so coverage isn't limited to curated sites | A9, D3 |
| D8 | Token auth + security pass | platform-issued tokens, strip telemetry monkey-patches, all_frames support, event-driven MV3 lifecycle (replace 500ms heartbeat), rotate/remove any ported keys | A1, D1 |
Acceptance: Figma practice step with ghost-cursor + drift recovery driven by a
live Guide agent; learner actions land in L2 memory as reusable traces; arXiv
paper walkthrough syncing notes to the platform; a lecture page's PDF+slides
auto-captured as resources.

### Phase E — Personalization & Resource Intelligence (Wk 5–6)
| # | Feature | Ships | Blocked by |
|---|---|---|---|
| E1 | Learner profile | onboarding v2 (role/level/language/goals) → profile table → injected into query builder, judge, resources, personas | A1 |
| E2 | Operator QueryBuilder | dual-artifact queries (operator string for scraper surfaces + strict params for Data API): "exact phrase", -excludes, intitle:, OR, before:/after:, playlist suffix for mastery; anti-clickbait ops finally wired | — |
| E3 | Learned video weights | nightly SQL aggregation of video_feedback → channel authority map + query-strategy stats → rubric weight overrides | M4 data |
| E4 | Roadmap self-healing | 👎×2 same module → flag; watch-completion + beat failures → remedial chapter proposals via architect | E3, A8 |
| E5 | Multi-scraper resource engine | **Scrapling sidecar** (python: adaptive element fingerprints, stealth fetchers, Playwright rendering) + **cat-catch rule compatibility** (user-extensible {regex, ext} rules) + **domain recipe registry** (per-site extraction recipes for MDN/official docs/awesome-lists, fingerprinted card elements); output = normalized Resource objects (docs/repos/papers/interactive/courses) with liveness + content-type validation and dedupe/canonical ranking; extension sniffer results (D7) merge into the same pipeline; every resource carries a deep-link ("open in managed tab") so the platform POINTS to the right place | E1 |
| E6 | Resource feedback loop (mirror of M4) | `resource_feedback` table (user_id, resource_id, domain, resource_type, signal like/dislike/bookmark/time_spent/completed, value, created_at); 👍/👎/bookmark UI on every Resource Hub card; dislike invalidates cached resource + records type/domain preference; POST API mirrors /api/feedback contract | A1 |
| E7 | Resource personalization engine | aggregation of resource_feedback → per-learner TYPE weights (prefers docs over videos? interactive over papers?) + per-DOMAIN priors (MDN trusted, random blogs demoted) → feeds find_resources ranking AND Resource Hub ordering; learner profile (E1) filters language/level | E6, E1 |
| E8 | find_resources tool + semantic match | resources as first-class as videos — a brain tool the loop can call mid-turn; pgvector embeddings (1536-dim column exists) for title/concept match; judge-style scored output {resourceId,score,reason}[] | E5, A5 |
| E12 | Behavioral analytics pipeline | unified `analytics_events` stream from EVERY surface (platform clicks/navigation/session boundaries, extension watch-%/practice outcomes/pauses/abandonment): sessionizer groups events into sessions (start/end/pause/resume/return-rate), click-path capture per lesson; privacy-scoped (consent toggle, no keystrokes) | A1, D1 |
| E13 | Learning-pattern engine | aggregates E12 + beat/practice results into the **central user persona**: completion rates, time-per-resource, stuck-question clustering (which questions/concepts repeatedly failed) vs excel-zones; emits pattern signals consumed by E7 ranking weights, architect remediation proposals (E4), examiner difficulty tuning, AND the content-restructuring trigger (E14); surfaced in a Patterns Dashboard (time-of-day habits, strong/weak topic map from the interest graph) | E12, E10 |
| E14 | Content restructuring service | trigger: learner struggles with EXTERNAL content (low watch-% on imported video, repeated fails on restructured checks, explicit "explain simpler") → system fetches/analyzes that material (transcript/article text) → **reformats into their personal learning style**: native beats journey at their pace, whiteboard explainer of the hard segment, simplified-language summary, or alternative-format swap (video→docs per type weights); restructured version stored alongside original with provenance | E13, B2, C1 |
| E9 | Deep-profile onboarding (OPTIONAL, consent-gated) | "Connect more of you" step in onboarding v2: **GitHub** connector (repos/languages/stars → skill map), **LinkedIn** (agent-reach public-profile reader → career/skills signals), **YouTube self-data** (OAuth watch-history + subscriptions, or yt-dlp local import of own playlists/history); nothing mandatory — skipping yields default persona; raw ingested signals land in a `profile_signals` store (with Linkwarden archiving originals); **agent-reach integrated platform-wide** as a scraper/research transport inside source-hunter (A6), resource-curator, and gap-analyzer specialists + E5 recipes |
| E10 | Interest knowledge graph | distill profile signals + learning history + L2/L3 memory into the nexus graph (`knowledge_nodes`/`node_edges` finally load-bearing): interest nodes (k8s, IaC, ML...), strength edges from recency/frequency/proficiency signals, wiki-graph-style spine distillation for readability; visualized in existing NexusView; consumed by architect (roadmap tailoring), examiner (question grounding), Resource Hub ranking (E7), and persona inference ("you're a hands-on DevOps learner") | E9, A4, A8 |
| E11 | Linkwarden as preservation layer | integrate self-hosted Linkwarden API: every captured resource (D7 sniffer finds, E5 scrapes, beat summaries, arXiv highlights) archived/annotated/tagged there; platform reads back annotations into L2 notebook; dedupe against vault; user gets a permanent, exportable library of everything Learning Dojo collected for them | E5, D7 |
Acceptance: same topic, two different learners get different videos AND
different resources ordered by their own learned preferences; disliking an
"off-topic" blog post permanently reshapes that learner's future resource
ranking; every recommended resource opens exactly where it should.
### Phase F — Hardening & Demo (Wk 6+, rolling)
Auth-protected demo path E2E rewrite of docs/DEMO.md · error envelope
standardization · quota dashboard + cache-first budget router · unit/integration
test suite (vitest) around rubric/judge/beats/pacing (pure modules first) ·
observability (structured logs, per-route latency) · seed script for demos ·
README/deployment story.

### Cross-cutting: UI/UX Track (EVERY phase ships end-to-end UI) + Autonomous Browser Testing

Rule: no backend feature is "done" until its themed UI exists AND an
autonomous browser test proves it. Every phase carries a mandatory paired
UI/UX milestone that PATCHES the previous UI (never rebuilds from scratch).

| Phase | UI/UX deliverable (full, not basic) | Patches |
|---|---|---|
| A-UI | **Persona Studio** (persona cards, editor form, active-persona selector inside chat dock); **Memory Inspector** (L1 working / L2 notebook / L3 profile tabs; notes+highlights CRUD; write-memory affordances); tool-toggle settings drawer; capability debug drawer (live manifest view) | chat dock, Workspace sidebar |
| B-UI | **Journey View**: beat-synced player page, current-beat highlight rail, check-gate modals for EVERY type (MCQ quiz, summary w/ scored feedback, flowchart drag-drop reconstruction, matching-pairs / fill-in-blank / step-ordering / T&F rapid mini-games), remediation ladder UX (hint → whiteboard → recap), mastery dashboard (progress rings, XP, streaks, badges), cross-session resume banner | Workspace video area, examiner states |
| C-UI | **Whiteboard Studio**: diagram-type picker, scene list + reorder, live preview pane, replay/seek controls, export (PNG/SVG) menu, saved boards gallery, persisted speed/voice settings | /whiteboard page → full studio |
| D-UI | Extension **Side Panel complete port** dojo-themed: guidance step cards, hint ladder visuals, ghost-cursor/overlay polish; **Trace Viewer** ("what we remembered" — recorded action traces w/ delete); arXiv walkthrough reader; resource-captured snackbars; token auth screens; deep-link return landing | extension surface, L2 notebook |
| E-UI | **Resource Hub v2**: filter chips (type/domain/level), 👍/👎/bookmark on every card, personalized-ordering indicators ("because you prefer docs"), learner profile settings page (role/level/language/goals editor), self-healing proposal cards ("Module 3 rebalance?") w/ accept/dismiss | Resource Hub, roadmap views |

UI acceptance bar per phase: all empty/loading/error states designed;
keyboard-reachable; dark-mode AA contrast; consistent vocabulary with existing
dojo theme; no dead-end clicks.

#### Autonomous UI Testing (Playwright)
Tooling: `@Playwright/test` (dev dep), specs in `tests/ui/*.spec.ts`, artifacts
(=PNG snapshots, trace.zip, console+network logs, JSON assertions) written to
`.ui-artifacts/` (gitignored). Optional Playwright MCP for ad-hoc agent
exploration of the running app.

| Suite | Automated flow (click-level, snapshot at each step) |
|---|---|
| ui-core | open /learn?topic=Terraform → roadmap renders → chapter video pick has score badge → alternative click switches in place |
| ui-chat | open Tutor dock → send prompt → FIRST streamed CONTENT appears <30s → tool chip visible → history survives dock close/reopen |
| ui-swap | 👎 → reason chip → SWAPPING state → new pick rendered, rejected id gone, no reload (assert same DOM node updated) |
| ui-beats | seed long video → beats panel renders ≥6 beats → collapse/expand → no_transcript note case |
| ui-whiteboard | open /whiteboard?topic=X → Start lesson → scenes progress >7s apart → interrupt question → answer streams → board resumes mid-scene |
| ui-practice | get step → Mark done ✓ → outcome POST observed (route spy) → second step fetch |
| ui-extension | launch Chromium with extension loaded (playwright persistent context) → focus player opens param-less form → telemetry POST asserted via route interception |
| ui-resources | Resource Hub v2: filters work, 👎 persists, ordering changes |

**Analysis loop (the autonomous part):** each run emits `.ui-artifacts/report.json`
+ step-indexed PNGs; a Validator subagent READS the report + snapshots
(vision review: layout broken? overlap? wrong state?) → files defect list →
Fix Worker → re-run until green. Gate: `npm run test:ui` must pass before ANY
phase commit is pushed. Trace files kept for flaky-step debugging.

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
LinkedIn scraping ToS/compliance posture (public pages only via agent-reach) ·
YouTube OAuth scope approval + quota for watch-history reads · agent-reach
browser-session/cookie custody on server vs user-local CLI mode · Linkwarden
self-host sizing · privacy policy for profile_signals retention.
Scrapling hosting model (local sidecar vs managed) · embedding dim migration
(1536 OpenAI-shaped vs Gemini) · WS-vs-SSE for extension duplex · arXiv ToS for
bulk fetch · companion-app bundling · cost ceiling per learner/day.

## Out of Scope (unchanged)
Hosting content; non-YouTube primary curriculum medium; global rec-sys beyond
channel weights; clicking FOR users (guidance/tracking only).
