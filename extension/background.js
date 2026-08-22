"use strict";

// ═══════════════════════════════════════════════════════════════
// Dojo Companion — MV3 service worker (UX defect #4 fix)
//
// Previously the extension had NO activation path from the platform:
// the action icon opened a param-less popup that died on a missing
// videoId. This worker provides three entry points:
//
//   1. Action icon click → opens player.html in a tab; with no
//      videoId the player shows its setup form instead of breaking.
//   2. Context menu on youtube.com links/videos/pages → extracts the
//      11-char videoId and opens the focus player pre-filled.
//   3. runtime message { type:"open_focus", videoId, chapterKey?,
//      topic?, nextHref?, platformUrl? } sent by the platform-linker
//      content script's floating "🛡️ Focus Player" button.
// ═══════════════════════════════════════════════════════════════

const PLAYER_PAGE = "player.html";
const MENU_ID = "dojo-open-focus-player";

const YT_ID_PATTERNS = [
  /[?&]v=([A-Za-z0-9_-]{11})/,
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /\/embed\/([A-Za-z0-9_-]{11})/,
  /\/shorts\/([A-Za-z0-9_-]{11})/,
  /\/live\/([A-Za-z0-9_-]{11})/,
];

function extractVideoId(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  for (const re of YT_ID_PATTERNS) {
    const match = value.match(re);
    if (match) return match[1];
  }
  return null;
}

function openFocusPlayer(videoId, opts) {
  const options = opts || {};
  let url = chrome.runtime.getURL(PLAYER_PAGE);
  if (videoId) {
    const qs = new URLSearchParams();
    qs.set("videoId", videoId);
    if (options.chapterKey) qs.set("chapterKey", String(options.chapterKey));
    if (options.topic) qs.set("topic", String(options.topic));
    if (options.nextHref) qs.set("nextHref", String(options.nextHref));
    if (options.platformUrl) qs.set("platformUrl", String(options.platformUrl));
    url += "?" + qs.toString();
  }
  chrome.tabs.create({ url });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Open video in Dojo Companion focus player",
      contexts: ["link", "video", "page"],
      documentUrlPatterns: [
        "*://*.youtube.com/*",
        "*://m.youtube.com/*",
        "*://*.youtu.be/*",
      ],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  // Prefer the exact right-clicked target, then fall back to the page.
  const source = info.linkUrl || info.srcUrl || info.pageUrl || (tab && tab.url);
  const videoId = extractVideoId(source);
  if (!videoId) return;
  openFocusPlayer(videoId, {
    chapterKey: tab && tab.title ? tab.title.slice(0, 120) : "",
    topic: tab && tab.title ? tab.title.slice(0, 120) : "",
    // Platform origin is unknown from a YouTube tab; player.js falls
    // back to its stored dojo_platform_url or the dev default.
  });
});

chrome.action.onClicked.addListener(() => {
  // Param-less launch is intentional: player.html renders its paste-a-
  // link form when videoId is missing instead of a broken empty player.
  openFocusPlayer("", null);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "open_focus") return undefined;
  const videoId = extractVideoId(msg.videoId);
  if (!videoId) {
    sendResponse({ ok: false, error: "missing or invalid videoId" });
    return undefined;
  }
  let platformUrl =
    typeof msg.platformUrl === "string" ? msg.platformUrl : "";
  try {
    if (!platformUrl && sender && sender.tab && sender.tab.url) {
      platformUrl = new URL(sender.tab.url).origin;
    }
  } catch {
    /* keep empty; player falls back to stored/default platform URL */
  }
  openFocusPlayer(videoId, {
    chapterKey: msg.chapterKey,
    topic: msg.topic,
    nextHref: msg.nextHref,
    platformUrl,
  });
  sendResponse({ ok: true });
  return undefined;
});
