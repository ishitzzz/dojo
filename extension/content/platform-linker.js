"use strict";

// ═══════════════════════════════════════════════════════════════
// Dojo Companion — platform linker (UX defect #4 fix)
//
// Content script for the Learning Dojo platform (localhost /
// 127.0.0.1). The platform renders YouTube embeds/links but had no
// path INTO the extension. This script:
//   1. Finds the currently-playing YouTube videoId by scanning iframe
//      sources and anchor hrefs for 11-char ids.
//   2. Injects a small themed floating button "🛡️ Focus Player" near
//      the bottom-right of the page while a video is present.
//   3. On click, messages the service worker:
//        { type:"open_focus", videoId, chapterKey: document.title,
//          nextHref: location.pathname+search, platformUrl: origin }
//      which opens player.html pre-filled with those params.
//
// Re-scans every 2s (cheap idempotent pass) because the SPA mounts
// embeds after load and swaps them on navigation.
// ═══════════════════════════════════════════════════════════════

(() => {
  if (window.__dojoLinkerLoaded) return;
  window.__dojoLinkerLoaded = true;

  const BTN_ID = "dojo-focus-player-btn";
  const SCAN_MS = 2000;

  // Matches standard watch URLs, youtu.be short links, /embed/, /shorts/
  // and /live/ paths; captures the 11-char case-sensitive id.
  const YT_ID_RE =
    /(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/;

  function findVideoId() {
    const sources = [];
    try {
      document
        .querySelectorAll(
          'iframe[src*="youtube"], iframe[src*="youtu.be"]'
        )
        .forEach((el) => sources.push(el.getAttribute("src")));
      document
        .querySelectorAll('a[href*="youtube"], a[href*="youtu.be"]')
        .forEach((el) => sources.push(el.getAttribute("href")));
    } catch {
      return null;
    }
    for (const src of sources) {
      if (!src) continue;
      const match = String(src).match(YT_ID_RE);
      if (match) return match[1];
    }
    return null;
  }

  function injectButton(videoId) {
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.textContent = "🛡️ Focus Player";
      btn.title = "Open this video in the Dojo Companion focus player";
      // Themed to match the platform's dark/emerald aesthetic.
      btn.style.cssText =
        "position:fixed;right:18px;bottom:18px;z-index:2147483647;" +
        "display:inline-flex;align-items:center;gap:6px;" +
        "padding:10px 16px;border-radius:999px;border:1px solid #10b98155;" +
        "background:rgba(16,24,32,.92);color:#6ee7b7;font-size:13px;" +
        "font-weight:600;font-family:system-ui,sans-serif;" +
        "box-shadow:0 8px 24px rgba(0,0,0,.45);cursor:pointer;";
      btn.addEventListener("click", () => {
        const current = findVideoId();
        if (!current) return;
        try {
          chrome.runtime.sendMessage(
            {
              type: "open_focus",
              videoId: current,
              chapterKey: (document.title || "").slice(0, 120),
              topic: (document.title || "").slice(0, 120),
              nextHref: location.pathname + location.search,
              platformUrl: location.origin,
            },
            () => void chrome.runtime.lastError // no-op: swallow closed-port errors
          );
        } catch {
          /* extension context invalidated after reload — ignore */
        }
      });
      document.documentElement.appendChild(btn);
    }
    btn.dataset.dojoVideoId = videoId;
  }

  function removeButton() {
    const existing = document.getElementById(BTN_ID);
    if (existing) existing.remove();
  }

  function tick() {
    const videoId = findVideoId();
    if (videoId) injectButton(videoId);
    else removeButton();
  }

  tick();
  setInterval(tick, SCAN_MS);
})();
