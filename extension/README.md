# Dojo Companion (M6.1 — Focus player + telemetry)

Distraction-free Chrome extension (Manifest V3) that plays a lesson video
inside a youtube-nocookie embed and reports watch progress to the Learning
Dojo platform's `POST /api/feedback`.

## Load unpacked (10 steps)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** ON (top-right).
3. Click **Load unpacked**.
4. Select this `extension/` folder.
5. Copy the extension's ID from its card (used in the URL below).
6. Open a new tab and go to:
   `chrome-extension://<EXTENSION_ID>/player.html?videoId=dQw4w9WgXcQ&platformUrl=http://localhost:3000`
7. Add `&nextHref=/learn/<course>/<next-chapter>` to get the deep-link back
   button after the video ends.
8. Add `&chapterKey=<key>&topic=<title>` for chapter scoping and a title.
9. Watch to the end (auto-posts `watch_pct = 100`) or click **Exit lesson** /
   close the tab mid-watch (posts early-exit if 5–95% watched).
10. Verify on the platform: `GET http://localhost:3000/api/feedback?videoId=<id>`.

## URL parameters for `player.html`

| Param         | Required | Example                  | Purpose                                                                 |
| ------------- | -------- | ------------------------ | ----------------------------------------------------------------------- |
| `videoId`     | yes      | `dQw4w9WgXcQ`            | YouTube video id; player fails fast without it.                         |
| `chapterKey`  | no       | `react-hooks-3`          | Chapter scope stored with each feedback row.                            |
| `topic`       | no       | `useEffect cleanup`      | Displayed as the lesson title.                                          |
| `platformUrl` | no*      | `http://localhost:3000`  | Base origin of the Learning Dojo app. *Persisted to `chrome.storage.local` (`dojo_platform_url`) on first use; later launches may omit it. |
| `nextHref`    | no       | `/learn/x/y`             | Same-origin path for the "Back to your Dojo" deep link after ENDED; without it the end card closes the window instead. |

## Telemetry behavior

- **ENDED** → `POST {videoId, chapterKey?, signal:"watch_pct", value:"100"}`.
- **Early exit** (Exit lesson button, tab close, `pagehide`/`beforeunload`)
  when max watched is 5–95% → `signal:"watch_pct"`,
  `value:"<pct>|droppedAtSec=<sec>"` (e.g. `37|droppedAtSec=412`), sent via
  `navigator.sendBeacon` first, `fetch {keepalive:true}` as fallback.
- **userId** → stable anonymous id in `chrome.storage.local` under
  `dojo_anon_id` (`crypto.randomUUID()` once).
- Successes and failures both surface in the status line (`Progress saved ✓` /
  `Save failed: …`); nothing fails silently.

## Notes

- MV3 extension-page CSP (`script-src 'self'`) forbids loading the remote
  IFrame Player API script into the page, so `player.js` speaks the same
  Widget API protocol over `postMessage` against the `enablejsapi=1`
  nocookie embed (identical `currentTime`/`duration`/state telemetry).
- Host permissions cover `localhost`/`127.0.0.1` (dev) and YouTube/Google
  origins. For a deployed platform, add its origin (e.g.
  `https://your-dojo.example/*`) to `host_permissions` in `manifest.json`.
- No build step, no npm dependencies, vanilla ES2020+ JS.
