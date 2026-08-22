"use strict";

// ═══════════════════════════════════════════════════════════════
// M6.1 Focus player + telemetry (MV3 extension page, no build step)
//
// MV3 note: extension-page CSP is `script-src 'self'`, which forbids
// loading the remote IFrame Player API script into this document. We
// therefore speak the equivalent Widget API protocol directly over
// postMessage against the youtube-nocookie embed created with
// `enablejsapi=1` — same telemetry surface (currentTime / duration /
// player state), zero remote code executed in our context.
//
// Telemetry contract: POST <platformUrl>/api/feedback with
// { userId?, videoId required, chapterKey?, signal, value? }.
// value is a free-form string on the server, so early-exit reports
// encode droppedAtSec as "<pct>|droppedAtSec=<sec>".
// ═══════════════════════════════════════════════════════════════

const POLL_MS = 2000;
const HANDSHAKE_MS = 800;
const YT_EMBED_ORIGIN = "https://www.youtube-nocookie.com";
const DEFAULT_PLATFORM_URL = "http://localhost:3000";
const MIN_REPORT_PCT = 5;
const MAX_REPORT_PCT = 95;

const params = new URLSearchParams(location.search);

const session = {
  videoId: (params.get("videoId") || "").trim(),
  chapterKey: (params.get("chapterKey") || "").trim(),
  topic: (params.get("topic") || "").trim(),
  nextHrefRaw: params.get("nextHref") || "",
  platformUrl: "",
  userId: "",
};

const progress = {
  durationSec: 0,
  lastTimeSec: 0,
  maxWatchedPct: 0,
};

const flags = {
  playerReady: false,
  endedPosted: false,
  exitPosted: false,
};

const els = {
  title: document.getElementById("lesson-title"),
  chip: document.getElementById("chapter-chip"),
  shell: document.getElementById("player-shell"),
  iframe: document.getElementById("yt-player"),
  endCard: document.getElementById("end-card"),
  endActions: document.getElementById("end-actions"),
  exitBtn: document.getElementById("exit-btn"),
  meter: document.getElementById("meter"),
  status: document.getElementById("status"),
};

function setStatus(message, kind) {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.className = kind === "ok" ? "ok" : kind === "err" ? "err" : "";
}

function setMeter() {
  if (!els.meter) return;
  els.meter.textContent =
    progress.durationSec > 0
      ? `Watched ${progress.maxWatchedPct.toFixed(0)}%`
      : "";
}

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    } catch {
      resolve({});
    }
  });
}

function storageSet(items) {
  try {
    chrome.storage.local.set(items, () => void chrome.runtime.lastError);
  } catch {
    /* non-extension context: in-memory only for this session */
  }
}

function randomId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "anon-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeOrigin(raw) {
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function resolveSessionIdentity() {
  const stored = await storageGet(["dojo_anon_id", "dojo_platform_url"]);

  session.userId =
    typeof stored.dojo_anon_id === "string" && stored.dojo_anon_id
      ? stored.dojo_anon_id
      : randomId();
  if (session.userId !== stored.dojo_anon_id) {
    storageSet({ dojo_anon_id: session.userId });
  }

  const fromParam = normalizeOrigin(params.get("platformUrl"));
  const fromStorage =
    typeof stored.dojo_platform_url === "string"
      ? normalizeOrigin(stored.dojo_platform_url)
      : null;

  // URL param wins; persist it once so later launches can omit it.
  session.platformUrl = fromParam || fromStorage || DEFAULT_PLATFORM_URL;
  if (fromParam && fromParam !== fromStorage) {
    storageSet({ dojo_platform_url: fromParam });
  }
}

function renderHeader() {
  if (els.title) els.title.textContent = session.topic || "Focus lesson";
  if (els.chip && session.chapterKey) {
    els.chip.textContent = session.chapterKey;
    els.chip.hidden = false;
  }
}

function createEmbed() {
  // enablejsapi=1 + origin lock the Widget API bridge; the nocookie host
  // plus the end-card overlay guarantee zero recommendations/comments.
  els.iframe.src =
    YT_EMBED_ORIGIN +
    "/embed/" +
    encodeURIComponent(session.videoId) +
    "?enablejsapi=1&origin=" +
    encodeURIComponent(location.origin) +
    "&playsinline=1";
}

// ── Widget API bridge over postMessage ──────────────────────────

function sendCommand(func) {
  try {
    els.iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      YT_EMBED_ORIGIN
    );
  } catch {
    /* iframe not ready yet */
  }
}

function sendListeningHandshake() {
  try {
    els.iframe.contentWindow.postMessage(
      JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
      YT_EMBED_ORIGIN
    );
  } catch {
    /* iframe not ready yet */
  }
}

function ingest(currentTime, duration) {
  if (Number.isFinite(currentTime) && currentTime >= 0) {
    progress.lastTimeSec = currentTime;
  }
  if (Number.isFinite(duration) && duration > 0) {
    progress.durationSec = duration;
  }
  if (progress.durationSec > 0) {
    const pct = (progress.lastTimeSec / progress.durationSec) * 100;
    if (pct > progress.maxWatchedPct) progress.maxWatchedPct = Math.min(pct, 100);
  }
  setMeter();
}

function handleMessage(event) {
  if (event.origin !== YT_EMBED_ORIGIN) return;
  let msg = event.data;
  if (typeof msg === "string") {
    try {
      msg = JSON.parse(msg);
    } catch {
      return;
    }
  }
  if (!msg || typeof msg !== "object") return;

  switch (msg.event) {
    case "onReady":
      if (!flags.playerReady) {
        flags.playerReady = true;
        sendCommand("getDuration");
        setStatus("Player connected.");
      }
      break;
    case "onStateChange":
      if (msg.info === 0) handleEnded(); // ENDED
      break;
    case "infoDelivery": {
      const info = msg.info;
      if (info && typeof info === "object") {
        ingest(info.currentTime, info.duration);
      }
      break;
    }
    default:
      break;
  }
}

function startBridgeTimers() {
  // Handshake until the player acknowledges; then poll every ~2s per spec.
  setInterval(() => {
    if (!flags.playerReady) sendListeningHandshake();
    sendCommand("getCurrentTime");
    sendCommand("getDuration");
  }, HANDSHAKE_MS);
  setInterval(() => {
    sendCommand("getCurrentTime");
    sendCommand("getDuration");
  }, POLL_MS);
}

// ── Feedback POSTs ──────────────────────────────────────────────

function feedbackUrl() {
  return session.platformUrl + "/api/feedback";
}

function buildFeedbackBody(signal, value) {
  const body = { userId: session.userId, videoId: session.videoId, signal };
  if (session.chapterKey) body.chapterKey = session.chapterKey;
  if (value !== undefined && value !== null) body.value = String(value);
  return body;
}

async function rawPost(url, bodyObj, keepalive) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
      keepalive,
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "network error" };
  }
  if (!response.ok) {
    return { ok: false, reason: "HTTP " + response.status };
  }
  try {
    const data = await response.json();
    if (data && data.status === "ok") return { ok: true, persisted: data.persisted };
    return { ok: false, reason: data && data.error ? String(data.error) : "unexpected payload" };
  } catch {
    return { ok: false, reason: "invalid JSON response" };
  }
}

function beaconPost(url, bodyObj) {
  try {
    if (!navigator.sendBeacon) return false;
    const blob = new Blob([JSON.stringify(bodyObj)], { type: "application/json" });
    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
}

async function postWatchComplete() {
  // ENDED path: exact value "100" per contract.
  const result = await rawPost(feedbackUrl(), buildFeedbackBody("watch_pct", "100"), false);
  if (result.ok) {
    setStatus(`Progress saved ✓ (persisted: ${result.persisted})`, "ok");
  } else {
    setStatus("Save failed: " + result.reason, "err");
  }
}

function queueEarlyExit(interactive) {
  if (flags.endedPosted || flags.exitPosted) return Promise.resolve("skipped");

  const pct = progress.maxWatchedPct;
  if (!(pct >= MIN_REPORT_PCT && pct <= MAX_REPORT_PCT)) {
    return Promise.resolve("skipped");
  }

  flags.exitPosted = true;
  // value encoding accepted by the route's free-form string validation:
  // "<pct>|droppedAtSec=<sec>" e.g. "37|droppedAtSec=412"
  const value =
    Math.round(pct) + "|droppedAtSec=" + Math.round(progress.lastTimeSec);
  const body = buildFeedbackBody("watch_pct", value);
  const url = feedbackUrl();

  if (!interactive && beaconPost(url, body)) {
    return Promise.resolve("posted-unconfirmed");
  }
  return rawPost(url, body, !interactive).then((result) => {
    if (interactive) {
      if (result.ok) setStatus("Progress saved ✓", "ok");
      else setStatus("Save failed: " + result.reason, "err");
    }
    return result.ok ? "posted" : "failed";
  });
}

// ── End states ──────────────────────────────────────────────────

function buildBackTarget() {
  const href = session.nextHrefRaw.trim();
  if (!href.startsWith("/")) return null; // same-origin paths only
  try {
    return new URL(href, session.platformUrl).toString();
  } catch {
    return null;
  }
}

function showEndCard() {
  els.endCard.hidden = false;
  els.exitBtn.disabled = true;
  els.endActions.textContent = "";

  const target = buildBackTarget();
  if (target) {
    const link = document.createElement("a");
    link.className = "btn btn-primary";
    link.href = target;
    link.textContent = "Back to your Dojo";
    els.endActions.appendChild(link);
  } else {
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn-primary";
    closeBtn.textContent = "Back to your Dojo";
    closeBtn.addEventListener("click", () => {
      window.close();
      setTimeout(() => setStatus("You can close this tab now.", ""), 300);
    });
    els.endActions.appendChild(closeBtn);
  }
}

async function handleEnded() {
  if (flags.endedPosted) return;
  flags.endedPosted = true;
  progress.maxWatchedPct = 100;
  setMeter();

  try {
    els.iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "stopVideo", args: [] }),
      YT_EMBED_ORIGIN
    );
  } catch {
    /* overlay hides the frame regardless */
  }

  await postWatchComplete();
  showEndCard();
}

async function handleExitClick() {
  els.exitBtn.disabled = true;
  const outcome = await queueEarlyExit(true);
  const delay = outcome === "failed" ? 1500 : outcome === "posted" ? 500 : 0;
  setTimeout(() => {
    window.close();
    setTimeout(() => {
      els.exitBtn.disabled = false;
      if (outcome !== "posted") setStatus("You can close this tab now.", "");
    }, 400);
  }, delay);
}

// ── Boot ────────────────────────────────────────────────────────

function renderFatal(message) {
  const app = document.getElementById("app");
  app.innerHTML = "";
  const box = document.createElement("div");
  box.id = "fatal";
  box.textContent = message;
  app.appendChild(box);
}

async function init() {
  if (!session.videoId) {
    renderFatal(
      "Missing videoId parameter. Open player.html?videoId=<id>&platformUrl=http://localhost:3000&nextHref=/learn/..."
    );
    return;
  }

  renderHeader();
  await resolveSessionIdentity();
  createEmbed();

  window.addEventListener("message", handleMessage);

  // Early-exit capture: unload events use fire-and-forget beacon first.
  window.addEventListener("pagehide", () => void queueEarlyExit(false));
  window.addEventListener("beforeunload", () => void queueEarlyExit(false));
  els.exitBtn.addEventListener("click", () => void handleExitClick());

  startBridgeTimers();
}

init();
