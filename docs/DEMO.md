# Learning Dojo — Scripted Demo Run

End-to-end walkthrough of the platform + extension loop: roadmap → focused
videos → feedback swap → live whiteboard explainer → long-video beats →
extension telemetry → practice-step completion (M7.1 closed loop).

Legend: **[API]** = works with plain `curl`; **[Chrome]** = needs the browser.

## Prerequisites

- `.env.local` with at least `GEMINI_API_KEY` (see `.env.example`;
  `SUPABASE_URL`/`SUPABASE_KEY`, `YOUTUBE_API_KEY` optional — every step has a
  no-cloud fallback).
- Node ≥ 18. No extra services required.

## 1. Start the dev server **[API]**

```bash
npm run dev
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
# expected: 200
```

## 2. Generate a Terraform roadmap **[API]** (or **[Chrome]** via `/onboarding`)

```bash
curl -s -X POST http://localhost:3000/api/generate-roadmap \
  -H "Content-Type: application/json" \
  -d '{
        "userGoal": "Terraform",
        "priorKnowledge": "basic CLI",
        "timeContext": { "type": "deadline", "date": "in 2 weeks" },
        "successDefinition": "ship one real module to a cloud provider",
        "mode": "skeleton"
      }' | head -c 600; echo
```

Expected: JSON with `modules[]` where each module has `moduleTitle` and
`chapters[]` (`chapterTitle`, `youtubeQuery`, …), plus an enriched `playlist`
object. On total Gemini failure it returns a `_isBackup: true` roadmap or a
500 with `details`. Save a chapter title for later steps, e.g.
`Terraform state basics`.

UI alternative: open `http://localhost:3000/onboarding` **[Chrome]** and answer
the prompts with goal "Terraform".

## 3. Open Workspace stage videos **[Chrome]**

1. Go to `http://localhost:3000/learn?mode=dojo&topic=Terraform`.
2. Pick a module → its Workspace opens with stage cards, each backed by a
   chapter video.
3. Click through a couple of stages so videos load.

No curl equivalent — this is the React Dojo view.

## 4. 👎 Force swap (feedback loop) **[Chrome]**, verify **[API]**

1. In the Workspace video card, click the 👎 button (optionally add a reason).
2. The platform rejects that video for the chapter and swaps in a fresh pick.

Verify the recorded signal:

```bash
curl -s "http://localhost:3000/api/feedback?videoId=<VIDEO_ID>"
```

Expected: JSON `{"status":"ok","count":N,"signals":[…,{"signal":"dislike",…}]}`.
A repeat fetch of the same chapter now resolves a different video (cache was
invalidated for that chapter).

## 5. Live whiteboard explainer with interrupt **[Chrome]** (API-only variant below)

1. Open `http://localhost:3000/whiteboard-demo`.
2. Type `Terraform state` into the topic field and press **Explain** — the
   board plans scenes and narrates them live (SSE from `/api/turn`,
   `mode:"explain_board"`).
3. Mid-explanation, type an interrupt question (e.g. *“what happens if two
   people run apply at once?”*) into the question box and send — playback
   pauses, the tutor answers on the same session, then you resume.

API-only peek (streams SSE; Ctrl-C when done):

```bash
curl -N -X POST http://localhost:3000/api/turn \
  -H "Content-Type: application/json" \
  -d '{"mode":"explain_board","topic":"Terraform state"}'
# expected: streamed SSE events: PLAN/SCENE/CONTENT/DONE frames
```

## 6. Long-video beats via `/api/video-beats` **[API]**

Only videos > 40 min are beat-split. Pass `durationSeconds` if
`YOUTUBE_API_KEY` is unset:

```bash
curl -s "http://localhost:3000/api/video-beats?videoId=<LONG_VIDEO_ID>&topic=Terraform%20state&durationSeconds=5400"
```

Expected: JSON beats result (segments with titles/timestamps built by
`buildBeats`). For a short video:

```bash
curl -s "http://localhost:3000/api/video-beats?videoId=dQw4w9WgXcQ&durationSeconds=212"
# expected: {"status":"not_eligible","reason":"Video is 4 min; beat-splitting requires > 40 min …"}
```

Missing duration entirely:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/video-beats?videoId=x"
# expected: 400 (no YOUTUBE_API_KEY and no durationSeconds)
```

## 7. Extension focus player telemetry **[Chrome]**

1. `chrome://extensions` → Developer mode ON → **Load unpacked** → select the
   `extension/` folder.
2. Copy the extension ID and open:
   ```
   chrome-extension://<EXTENSION_ID>/player.html?videoId=dQw4w9WgXcQ&topic=Terraform%20state%20basics&platformUrl=http://localhost:3000&nextHref=/learn?mode=dojo%26topic=Terraform
   ```
3. Watch to the end (or click **Exit lesson** between 5–95%).

Verify telemetry on the platform:

```bash
curl -s "http://localhost:3000/api/feedback?videoId=dQw4w9WgXcQ"
# expected: signals containing {"signal":"watch_pct","value":"100"}
#           (early exit instead encodes "<pct>|droppedAtSec=<sec>")
```

## 8. Practice step completion (M7.1 closed loop) **[API]**, full UX **[Chrome]**

Issue a single-step plan:

```bash
curl -s "http://localhost:3000/api/practice-plan?topic=Terraform&chapterTitle=Terraform%20state%20basics"
```

Expected:

```json
{
  "status": "ok",
  "source": "gemini",
  "planId": "dec26226-c15d-4a68-a37f-8100a4271d6d",
  "step": {
    "index": 0,
    "instruction": "Run `terraform init` in a new directory to initialize a Terraform backend.",
    "targetHint": "your terminal",
    "successSignal": "input"
  },
  "createdAt": "2026-08-22T19:29:08.238Z"
}
```

(`source:"fallback"` with instruction
`Open your terminal and run one real command practicing: <title>` when no
Gemini key is configured.) Close the loop with the returned `planId`:

```bash
curl -s -X POST http://localhost:3000/api/practice-outcome \
  -H "Content-Type: application/json" \
  -d '{"planId":"<PLAN_ID>","outcome":"completed","note":"demo run"}'
# expected: {"status":"ok","persisted":"memory"}   ("supabase" when configured)
```

Validation edges: missing `planId` or `outcome` ∉ {completed, stalled,
skipped} → 400 with `{"status":"error","error":…}`.

Full UX **[Chrome]**: after the end-card in step 7, click **Start practice
step** — the card renders the generated instruction inside the player with
**Mark done**/**Skip**; doing nothing for 90 s reports `stalled`. The same
plan is mirrored to `chrome.storage.local` (`dojo_practice_plan`) for the
`content/guide.js` controller, which arms its capture-phase tracker wherever
it is injected and auto-completes on the armed click/input signal.
