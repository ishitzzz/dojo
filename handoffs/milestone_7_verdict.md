# Validation Verdict: M7 Practice Loop + Demo

## Final Verdict: PASS

## Scope Shipped
- **7.1**: GET /api/practice-plan (single-step plan, Gemini-generated imperative
  exercise w/ deterministic fallback, in-memory plan store cap 200 via
  globalThis share surviving HMR); POST /api/practice-outcome
  {planId,outcome:completed|stalled|skipped} → Supabase practice_progress.sql
  (permissive RLS v1) or capped memory fallback; unknown planIds recorded so
  signals survive restarts. Extension: guide.js content-script controller
  (~295 lines ported from FolloMe passive-tracker lineage — capture-phase armed
  signal detection, shadow-DOM step card, 90s stall timer) + end-card "Start
  practice step" inline flow in player.js (injection upgrade deferred;
  scripting/tabs permissions pre-added).
- **7.2**: docs/DEMO.md — 8-step scripted run (Terraform → roadmap → stage
  videos → 👎 swap → whiteboard SSE → video-beats → extension telemetry →
  practice completion) with exact curls, expected outputs, [API]/[Chrome] tags.

## Evidence (live)
- practice-plan round-trip: Gemini-sourced instruction, valid planId JSON;
  outcome completed → {"status":"ok","persisted:"memory"}; bad outcome/missing
  planId → 400s; unknown-planId recorded by design.
- EXECUTE_GUIDANCE↔STEP_OUTCOME loop code-traced CLOSED both client paths.
- tsc clean, node --check clean, eslint clean on new routes.

## Known Deferred
- Tab-injection of guide.js into platform pages (permissions shipped; needs
  service-worker message relay) — v1 uses in-player practice card instead.
- practice_progress Supabase insert not exercised live (env unavailable).
- Watch-% scrubber inflation (position-based) from M6 noted.

## State
STATUS: M7_COMPLETE — awaiting commit
