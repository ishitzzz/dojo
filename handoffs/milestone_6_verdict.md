# Validation Verdict: M6 Extension Focus Player

## Final Verdict: PASS_WITH_PENDING_LIVE (static validation complete; Chrome manual test pending user)

## Scope Shipped
- extension/ MV3: manifest (storage only + localhost/nocookie hosts), player.html/js/css,
  README with load-unpacked + param table.
- youtube-nocookie embed, enablejsapi=1, origin-bound Widget postMessage protocol
  (MV3 CSP forbids remote API script — protocol re-implemented, ground-truthed
  against the live official www-widgetapi.js runtime).
- Telemetry: ENDED → POST watch_pct "100"; early exit → sendBeacon/keepalive
  fetch with "NN|droppedAtSec=SS" encoding (route-validated); dedupe guards;
  status line surfaces success AND failures; end-card overlay covers iframe on
  ENDED (zero recommendations by construction).

## Validator Evidence (all static checks)
- Manifest/JSON/syntax: PASS. MV2 leftovers: none.
- Payload round-trip: route.ts validation re-implemented in Node — all extension
  payloads accepted incl. pipe-encoded exit value.
- Protocol: wire shapes byte-equivalent to official runtime builders; state 0 =
  ENDED; strict origin checks both directions.
- No youtube.com/watch, no rel param; nothing remote loads into extension page.

## PENDING_USER_TEST (requires Chrome, cannot be automated here)
1. Load unpacked per extension/README.md; open
   player.html?videoId=<id>&platformUrl=http://localhost:3000&nextHref=/learn
2. Confirm: plays with zero recommendations; on end → "Progress saved ✓" and
   GET /api/feedback?videoId=<id> shows watch_pct 100; deep-link opens platform.
3. Early exit ~30% → row with droppedAtSec encoding.

## Known Deferred (folded into M7 worker)
- HARDENING (recommended): explicit addEventListener commands for
  onStateChange/onReady — removes reliance on listening-only auto-push.
- onError handling for non-embeddable videos (101/150).
- Least-privilege: unused youtube.com/googleapis host_permissions trim.
- Position-based watch pct inflates for scrubbers (acceptable v1).

## State
STATUS: M6_COMMITTED
