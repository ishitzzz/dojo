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
//
// M7.1 Practice loop: after ENDED the end-card offers "Start practice
// step", which fetches <platformUrl>/api/practice-plan, renders the
// single step inside the end-card itself (fallback v1 — see handoff)
// and POSTs completed / stalled / skipped to /api/practice-outcome.
// The plan is also mirrored into chrome.storage.local
// ("dojo_practice_plan") so the content/guide.js controller can arm
// its capture-phase tracker on any tab it gets injected into.
// ═══════════════════════════════════════════════════════════════

const POLL_MS = 2000;
const HANDSHAKE_MS = 800;
const YT_EMBED_ORIGIN = "https://www.youtube-nocookie.com";
const DEFAULT_PLATFORM_URL = "http://localhost:3000";
const MIN_REPORT_PCT = 5;
const MAX_REPORT_PCT = 95;
const PRACTICE_STALL_MS = 90000;

const params = new URLSearchParams(location.search);

const session = {
  videoId: (params.get("videoId") || "").trim(),
  chapterKey: (params.get("chapterKey") || "").trim(),
  topic: (params.get("topic") || "").trim(),
  chapterTitle: (params.get("chapterTitle") || "").trim(),
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

// Platform URL remembered from storage for the setup-form placeholder.
let storedPlatformUrlForForm = "";

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
  // UX defect #4d: param-less setup form elements.
  setupCard: document.getElementById("setup-card"),
  setupVideoInput: document.getElementById("setup-video-input"),
  setupPlatformInput: document.getElementById("setup-platform-input"),
  setupError: document.getElementById("setup-error"),
  setupStartBtn: document.getElementById("setup-start-btn"),
};

// Same patterns as background.js — duplicated here because extension
// pages can't import from the service worker.
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

  // Surface the stored platform URL to the setup form placeholder.
  storedPlatformUrlForForm =
    typeof stored.dojo_platform_url === "string"
      ? stored.dojo_platform_url
      : "";

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

function sendCommand(func, args) {
  try {
    els.iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args: args || [] }),
      YT_EMBED_ORIGIN
    );
  } catch {
    /* iframe not ready yet */
  }
}

function sendEventSubscriptions() {
  // Explicit subscriptions: don't rely on the widget auto-pushing
  // onStateChange/onReady — without these, ENDED may never fire.
  sendCommand("addEventListener", ["onStateChange"]);
  sendCommand("addEventListener", ["onReady"]);
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
        sendEventSubscriptions();
        sendCommand("getDuration");
        setStatus("Player connected.");
      }
      break;
    case "onStateChange":
      if (msg.info === 0) handleEnded(); // ENDED
      break;
    case "onError": {
      // 101/150: embedder disallowed the video; others: playback failure.
      const code = typeof msg.info === "number" ? msg.info : NaN;
      const message =
        code === 101 || code === 150
          ? "Video unavailable (embedding disabled)"
          : "Player error" + (Number.isFinite(code) ? " (code " + code + ")" : "");
      setStatus(message, "err");
      break;
    }
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

  // M7.1: practice step launcher (fallback v1 renders in this card).
  if (session.topic || session.chapterKey || session.chapterTitle) {
    const practiceBtn = document.createElement("button");
    practiceBtn.type = "button";
    practiceBtn.className = "btn btn-plain";
    practiceBtn.id = "practice-start-btn";
    practiceBtn.textContent = "Start practice step";
    practiceBtn.addEventListener("click", () => void startPracticeStep(practiceBtn));
    els.endActions.appendChild(practiceBtn);
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

// ── M7.1 Practice step (closed loop) ────────────────────────────

function practicePlanUrl() {
  return session.platformUrl + "/api/practice-plan";
}

function practiceOutcomeUrl() {
  return session.platformUrl + "/api/practice-outcome";
}

async function startPracticeStep(button) {
  button.disabled = true;
  setStatus("Fetching practice step…");

  const chapterTitle = session.chapterTitle || session.chapterKey;
  const query = new URLSearchParams();
  if (session.topic) query.set("topic", session.topic);
  if (chapterTitle) query.set("chapterTitle", chapterTitle);

  let plan;
  try {
    const response = await fetch(practicePlanUrl() + "?" + query.toString());
    if (!response.ok) throw new Error("HTTP " + response.status);
    plan = await response.json();
    if (!plan || !plan.planId || !plan.step || !plan.step.instruction) {
      throw new Error("unexpected payload");
    }
  } catch (err) {
    setStatus(
      "Practice plan failed: " + (err instanceof Error ? err.message : "error"),
      "err"
    );
    button.disabled = false;
    return;
  }

  // Mirror for the content/guide.js controller (capture-phase
  // tracker flavor) — it arms wherever it gets injected next.
  storageSet({
    dojo_practice_plan: {
      planId: plan.planId,
      step: plan.step,
      platformUrl: session.platformUrl,
      userId: session.userId,
      topic: session.topic,
      chapterTitle,
      storedAt: Date.now(),
    },
  });

  renderPracticeCard(plan);
  setStatus("Do the step in your own tool, then mark done.");
}

function renderPracticeCard(plan) {
  const existing = document.getElementById("practice-card");
  if (existing) existing.remove();

  const box = document.createElement("div");
  box.id = "practice-card";
  box.style.cssText =
    "display:flex;flex-direction:column;gap:6px;align-items:center;max-width:100%;" +
    "max-height:100%;overflow:auto;background:#141b22;border:1px solid #2c3642;" +
    "border-radius:8px;padding:10px;margin-top:8px;";

  const label = document.createElement("span");
  label.textContent = "Practice step";
  label.style.cssText = "font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);";
  box.appendChild(label);

  const instruction = document.createElement("p");
  instruction.id = "practice-instruction";
  instruction.textContent = plan.step.instruction;
  instruction.style.cssText =
    "margin:0;font-size:13px;line-height:1.45;text-align:center;max-width:340px;";
  box.appendChild(instruction);

  if (plan.step.targetHint) {
    const hint = document.createElement("span");
    hint.textContent = "Where: " + plan.step.targetHint;
    hint.style.cssText = "font-size:11px;color:var(--muted);";
    box.appendChild(hint);
  }

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;margin-top:2px;";

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "btn btn-primary";
  doneBtn.id = "practice-done-btn";
  doneBtn.textContent = "Mark done";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "btn btn-plain";
  skipBtn.id = "practice-skip-btn";
  skipBtn.textContent = "Skip";

  row.append(doneBtn, skipBtn);
  box.appendChild(row);
  els.endCard.insertBefore(box, els.endActions);

  let finished = false;
  const finish = (outcome) => {
    if (finished) return;
    finished = true;
    clearTimeout(stallTimer);
    doneBtn.disabled = true;
    skipBtn.disabled = true;
    return rawPost(
      practiceOutcomeUrl(),
      { planId: plan.planId, outcome, userId: session.userId },
      false
    ).then((result) => {
      if (result.ok) {
        setStatus(`Practice ${outcome} ✓ saved`, "ok");
        doneBtn.textContent = outcome === "completed" ? "Done ✓" : outcome === "stalled" ? "Timed out" : "Skipped";
      } else {
        setStatus("Outcome save failed: " + result.reason, "err");
        doneBtn.disabled = false;
        doneBtn.textContent = "Retry mark done";
        doneBtn.addEventListener("click", () => finish(outcome), { once: true });
      }
    });
  };

  doneBtn.addEventListener("click", () => void finish("completed"));
  skipBtn.addEventListener("click", () => void finish("skipped"));

  // Same closed-loop contract as guide.js: silence means stalled.
  const stallTimer = setTimeout(() => void finish("stalled"), PRACTICE_STALL_MS);
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

const boot = {
  bound: false, // one-time listeners already attached
  started: false, // bridge timers already running
};

function showSetupForm() {
  if (els.shell) els.shell.hidden = true;
  if (els.setupCard) els.setupCard.hidden = false;
  if (els.exitBtn) els.exitBtn.disabled = true;
  setStatus("Paste a YouTube link or video id to begin.");
}

async function startFromSetupForm() {
  const parsedId = extractVideoId(
    els.setupVideoInput ? els.setupVideoInput.value : ""
  );
  if (!parsedId) {
    if (els.setupError) {
      els.setupError.textContent =
        "Could not find a YouTube video id — paste a watch URL (youtube.com/watch?v=…), a youtu.be link, or an 11-char id.";
      els.setupError.hidden = false;
    }
    return;
  }
  if (els.setupError) els.setupError.hidden = true;

  session.videoId = parsedId;
  const platformRaw =
    els.setupPlatformInput && els.setupPlatformInput.value.trim().length > 0
      ? els.setupPlatformInput.value
      : "";
  const normalizedPlatform = normalizeOrigin(platformRaw);
  if (platformRaw && !normalizedPlatform) {
    if (els.setupError) {
      els.setupError.textContent = "Platform URL must be an http(s) origin.";
      els.setupError.hidden = false;
      return;
    }
  }

  // Hide the form and bring up the player in place.
  if (els.setupCard) els.setupCard.hidden = true;
  if (els.shell) els.shell.hidden = false;
  await bootPlayer(normalizedPlatform || "");
}

/** Shared launch path for both URL-param and setup-form starts. */
async function bootPlayer(platformUrlOverride) {
  if (els.exitBtn) els.exitBtn.disabled = false;
  renderHeader();
  await resolveSessionIdentity();
  // Explicit form entry wins over stored/default; persist it like a
  // URL param would be.
  if (platformUrlOverride && platformUrlOverride !== session.platformUrl) {
    session.platformUrl = platformUrlOverride;
    storageSet({ dojo_platform_url: platformUrlOverride });
  }
  createEmbed();

  if (!boot.bound) {
    boot.bound = true;
    window.addEventListener("message", handleMessage);

    // Early-exit capture: unload events use fire-and-forget beacon first.
    window.addEventListener("pagehide", () => void queueEarlyExit(false));
    window.addEventListener("beforeunload", () => void queueEarlyExit(false));
    if (els.exitBtn) {
      els.exitBtn.addEventListener("click", () => void handleExitClick());
    }
  }

  if (!boot.started) {
    boot.started = true;
    startBridgeTimers();
  } else {
    // Re-entered from the form: the embed src changed, so the Widget API
    // handshake must run against the fresh frame.
    flags.playerReady = false;
    flags.endedPosted = false;
  }
}

async function init() {
  // UX defect #4d: no videoId param no longer fatal — show the setup
  // form (paste YouTube URL / id + optional platform URL) instead of a
  // broken empty player.
  if (!session.videoId) {
    showSetupForm();
    await resolveSessionIdentity(); // still resolve anon id + stored platform URL
    if (
      els.setupPlatformInput &&
      typeof storedPlatformUrlForForm === "string" &&
      storedPlatformUrlForForm
    ) {
      els.setupPlatformInput.placeholder =
        "Platform URL (default: " + storedPlatformUrlForForm + ")";
    }
    if (els.setupStartBtn) {
      els.setupStartBtn.addEventListener("click", () =>
        void startFromSetupForm()
      );
    }
    if (els.setupVideoInput) {
      els.setupVideoInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") void startFromSetupForm();
      });
    }
    els.setupVideoInput?.focus();
    return;
  }

  await bootPlayer("");
}

init();
