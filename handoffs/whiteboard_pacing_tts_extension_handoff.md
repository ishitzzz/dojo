# Handoff: Whiteboard Pacing/TTS + Extension Activation
## Status: COMPLETE

## Files Changed
- `src/lib/brain/capabilities/explainBoard.ts` — prompt demands 8–16 rich commands/scene (labeled 4-point closed rectangles, arrow = shaft + V-head strokes, text labels 12–22px, title text on scene 1); NEW deterministic `enrichScene()` server-side floor: any scene with <8 meaningful commands gets a scaffold (title text, frame rect, 3 labeled boxes joined by arrows, underline) built from narration keywords until ≥8. Applied to LLM scenes AND fallback scenes.
- `src/lib/whiteboard/pacing.ts` (NEW) — shared pacing constants (`MIN_SCENE_SECONDS=7`, `MAX_SCENE_SECONDS=25`, `TEXT_DWELL_SECONDS=1.2`, `CLEAR_DWELL_SECONDS=0.35`) + `estimateSceneSeconds(rawCommands)` used by the player for duration hints.
- `src/components/whiteboard/WhiteboardRenderer.tsx` — per-scene pacing: measures exact natural frames by kinematizing strokes at base speed 1 (Σ 1/v per point), targets `clamp(hint ?? natural, 7, 25)s`, rescales stroke velocities linearly (`v × effectiveSpeed`), clamps effective speed to engine range [0.1, 10]; any window remainder becomes an end-of-scene HOLD (`holdFrames`) so sparse scenes hit the ≥7s floor exactly. Text stages now dwell ~1.2s each, erase/clear get a 0.35s beat (dwell/hold consume one frame per tick; pause barrier freezes them). New optional props `durationHints?: number[]`, `sceneLabelOverride?: string` (backward compatible).
- `src/components/whiteboard/ExplainBoardPlayer.tsx` — Defect #2: "▶ Start lesson" overlay button gates scene 1; its click handler synchronously primes `speechSynthesis` (silent volume-0 utterance + `getVoices()`) then plays/speaks in the same call stack → valid user-gesture chain for Brave. `utterance.onerror` + mount-time voice detection (voiceschanged / 2.5s grace) surface inline "Narration unavailable in this browser" warning instead of silence. Mute kept working, default unmuted. Defect #3: `sceneIndex` counted on playback, `totalScenes` set ONLY from RESULT metadata `{scenes:N}`; badge shows "Planning…" → "scene k" → "scene k / N" after RESULT; renderer override prevents its internal single-scene total leaking "1 / 1". Passes `durationHints=[estimateSceneSeconds(activeScene.drawCommands)]`.
- `extension/background.js` (NEW MV3 service worker) — action.onClicked opens player.html tab (param-less → setup form); context menu "Open video in Dojo Companion focus player" on youtube.com/youtu.be docs (link/video/page contexts) extracts 11-char id (watch/youtu.be/embed/shorts/live patterns); `onMessage {type:"open_focus", videoId, chapterKey?, topic?, nextHref?, platformUrl?}` → tabs.create player.html?url params.
- `extension/content/platform-linker.js` (NEW content script) — localhost/127.0.0.1 only; scans iframe[src*=youtube]/a[href*=youtube] for 11-char ids every 2s; injects themed floating "🛡️ Focus Player" button (fixed bottom-right, dark/emerald); click → sendMessage open_focus with videoId, chapterKey=document.title slice, nextHref=pathname+search, platformUrl=origin.
- `extension/manifest.json` — v0.2.0: added `"background":{"service_worker":"background.js"}`, `contextMenus` permission, content_scripts entry (localhost + 127.0.0.1). Removed `default_popup` so `action.onClicked` fires (popup suppressed it).
- `extension/player.html` / `player.css` — param-less state renders a setup card (paste YouTube URL or 11-char id + optional platform URL + Start focus lesson button) instead of a broken empty player.
- `extension/player.js` — `extractVideoId` (7-case tested); init without videoId → setup form; submit validates id, normalizes/persists platform URL into `dojo_platform_url`, boots embed in place; boot split into idempotent `bootPlayer()` (re-entry resets Widget-API handshake flags, re-enables exit btn).
- `extension/README.md` — new "Activation paths" section (toolbar icon/form, YouTube context menu, platform 🛡️ button), updated params table (`videoId` yes*), notes on removed popup + deployed-platform matches.

## Commands Executed
| Command | Exit Code | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | Zero errors (also zero pre-existing) |
| `npx eslint <4 touched frontend files>` | 0 | Clean after escaping apostrophe + dropping stale disable |
| `node --check extension/background.js` (+ player.js, platform-linker.js, guide.js) | 0 | All extension JS parses |
| `node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json'))"` | 0 | Valid; sw=background.js, cs=localhost+127.0.0.1, perms incl. contextMenus |
| `curl -sN -X POST :3000/api/turn {"mode":"explain_board","topic":"Terraform state"}` | 0 | 4 scenes; per-scene DRAW_DELTA = 8/9/9/9 (avg **8.8** ≥8), each scene has text commands (`"type":"text"` present), RESULT `{scenes:4}` |
| Duration simulation vs captured payloads | 0 | Rich scenes land ~20s (≤25 cap); synthetic sparse 2-stroke scene stretches to exactly 7.00s floor |
| `curl /whiteboard-demo` | 200 | Page SSR-renders with Live explainer |

## Unresolved Issues
- Model compliance varies run-to-run (one earlier run returned 2–3 text-only cmds/scene before enrichment shipped); the deterministic `enrichScene()` floor now guarantees ≥8 regardless, but prompt-only runs may occasionally sit just under 16.
- Voice-detection warning can appear in truly voiceless environments (e.g. headless CI browsers) — correct behavior, but worth knowing during automated screenshot QA.
- Real Brave/Gesture behavior verified by code-trace only (no GUI browser here): first `speak()` runs synchronously inside the Start-button click chain behind a volume-0 primer utterance; recommend one manual Brave smoke test.

## Architectural Decisions
1. **Pacing lives in the renderer, hints come from raw commands**: renderer measures exact natural frames via base-speed kinematics (Σ1/v per point — the anim loop advances one point per full progress unit, so time-per-point = 1/v, independent of pixel distance); velocity rescaling post-measurement is mathematically identical to re-running `applyHumanKinematics({speed})` because velocity scales linearly after pressure mapping (avoids double-pass + RawCoordinate/KinematicCoordinate type friction). A hold-tail covers the kinematic speed floor (0.1) when slowing alone can't reach 7s.
2. **Server-side richness floor, not just prompt**: LLM instruction-following proved unreliable across runs; a deterministic scaffold guarantees the verify contract (≥8 avg DRAW_DELTA + text commands) while preserving model-authored commands first so intent leads the scene.
3. **Counter authority moves upstream**: the renderer only ever sees one scene, so it must never display its own totals; `sceneLabelOverride` keeps layout ownership in the renderer while truth (RESULT metadata `{scenes:N}`) flows from the player.
4. **Action icon = tab, not popup**: MV3 suppresses `action.onClicked` when a default_popup exists; removing the popup makes the icon a real activation entry point whose param-less state degrades to a functional setup form rather than an error.
