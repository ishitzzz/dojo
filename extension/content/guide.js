"use strict";

// ═══════════════════════════════════════════════════════════════
// Dojo Companion — Practice guide controller (M7.1)
//
// Minimal port of followme-extension content scripts:
//   - passive-tracker.js → capture-phase listener that detects the
//     ONE armed success signal (a click OR a non-empty input event).
//     All telemetry monkey-patching / batch step machinery stripped.
//   - overlay.js + overlay.css → shadow-DOM step card pinned
//     bottom-right (glass panel + pulse dot). Ghost cursor and
//     bbox SVG layers intentionally dropped for v1.
//
// Plan source (either):
//   1. chrome.storage.local key "dojo_practice_plan", written by the
//      player page: { planId, step:{index, instruction, targetHint,
//      successSignal:"click"|"input"}, platformUrl, userId,
//      topic?, chapterTitle?, storedAt }
//   2. runtime message { type: "DOJO_GUIDE_ARM", plan }.
//
// Flow: arm tracker on load; detected signal or "Mark done" click
// → POST outcome "completed" to <platformUrl>/api/practice-outcome;
// no signal within 90 s → POST "stalled". Card closes either way.
// ═══════════════════════════════════════════════════════════════

(() => {
  if (window.__dojoGuideLoaded) return;
  window.__dojoGuideLoaded = true;

  const PLAN_KEY = "dojo_practice_plan";
  const STALL_MS = 90000;
  const PLAN_TTL_MS = 15 * 60000;

  // Mirror of extension/guide.css (shadow roots can't import files).
  const GUIDE_CSS = [
    ":host{all:initial}",
    ".card{box-sizing:border-box;margin:0;width:100%;background:rgba(15,15,17,.85);",
    "backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);",
    "border:1px solid rgba(255,255,255,.08);border-radius:12px;",
    "box-shadow:0 12px 32px rgba(0,0,0,.4);color:#ededed;font-family:system-ui,sans-serif;",
    "font-size:13px;line-height:1.5;overflow:hidden;transform:translateY(20px) scale(.96);",
    "opacity:0;transition:transform .3s cubic-bezier(.16,1,.3,1),opacity .3s ease}",
    ".card.dojo-visible{transform:translateY(0) scale(1);opacity:1}",
    ".header{display:flex;align-items:center;gap:8px;padding:10px 14px;",
    "border-bottom:1px solid rgba(255,255,255,.08)}",
    ".pulse{width:6px;height:6px;border-radius:50%;background:#f59e0b;flex-shrink:0}",
    ".title{flex:1;font-size:11px;font-weight:500;letter-spacing:.5px;",
    "text-transform:uppercase;color:#a1a1aa}",
    ".timer{font-size:11px;color:#a1a1aa;font-variant-numeric:tabular-nums}",
    ".instruction{margin:0;padding:12px 14px 4px;font-size:13px;color:#ededed}",
    ".hint{margin:0;padding:0 14px 10px;font-size:11px;color:#71717a}",
    ".footer{display:flex;align-items:center;gap:8px;padding:10px 14px 12px}",
    ".btn-done{appearance:none;border:0;border-radius:8px;padding:8px 14px;",
    "font-size:13px;font-weight:600;cursor:pointer;background:#22c55e;color:#052e14}",
    ".btn-done:hover{background:#16a34a}",
    ".btn-done[disabled]{cursor:default;opacity:.6}",
  ].join("");

  const state = {
    plan: null,
    armed: false,
    finished: false,
    stallTimer: 0,
    tickTimer: 0,
    deadline: 0,
    host: null,
    card: null,
    timerEl: null,
    doneBtn: null,
  };

  // ── Passive tracker (minimal port) ─────────────────────────────

  const SIGNAL_EVENTS = {
    click: ["click"],
    input: ["input", "keydown"],
  };

  function onCapture(event) {
    if (!state.armed || state.finished) return;
    if (state.host && event.target instanceof Node && state.host.contains(event.target)) {
      return; // ignore interactions with our own card
    }
    const types = SIGNAL_EVENTS[state.plan?.step?.successSignal] || SIGNAL_EVENTS.click;
    if (!types.includes(event.type)) return;
    if (event.type === "input" || event.type === "keydown") {
      const target = event.target;
      const value =
        target && typeof target.value === "string"
          ? target.value
          : target && target.textContent
            ? target.textContent
            : "";
      if (!value.trim()) return; // require actual typed content
    }
    disarmTracker();
    report("completed");
  }

  function armTracker() {
    disarmTracker();
    const types = SIGNAL_EVENTS[state.plan?.step?.successSignal] || SIGNAL_EVENTS.click;
    for (const evt of types) {
      document.addEventListener(evt, onCapture, { capture: true, passive: true });
    }
    state.armed = true;
  }

  function disarmTracker() {
    for (const evt of ["click", "input", "keydown"]) {
      document.removeEventListener(evt, onCapture, { capture: true });
    }
    state.armed = false;
  }

  // ── Outcome reporting ──────────────────────────────────────────

  async function report(outcome) {
    if (state.finished || !state.plan || !state.plan.planId) return;
    state.finished = true;
    stopTimers();
    disarmTracker();
    const origin = String(state.plan.platformUrl || "").replace(/\/+$/, "");
    try {
      await fetch(origin + "/api/practice-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: state.plan.planId,
          outcome,
          userId: state.plan.userId || undefined,
        }),
        keepalive: true,
      });
      setCardStatus(outcome === "completed" ? "Saved ✓" : "Reported (" + outcome + ")");
    } catch {
      setCardStatus("Could not reach platform");
    }
    clearStoredPlan();
    setTimeout(closeCard, outcome === "completed" ? 1600 : 2600);
  }

  // ── Card UI (shadow DOM) ───────────────────────────────────────

  function ensureCard() {
    if (state.card) return;
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;bottom:24px;right:24px;width:340px;max-width:calc(100vw - 32px);" +
      "z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = GUIDE_CSS;
    shadow.appendChild(style);

    const card = document.createElement("section");
    card.className = "card";
    const header = document.createElement("div");
    header.className = "header";
    const pulse = document.createElement("span");
    pulse.className = "pulse";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = "Practice step";
    state.timerEl = document.createElement("span");
    state.timerEl.className = "timer";
    header.append(pulse, title, state.timerEl);

    const instruction = document.createElement("p");
    instruction.className = "instruction";
    instruction.id = "dojo-guide-instruction";

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.id = "dojo-guide-hint";

    const footer = document.createElement("div");
    footer.className = "footer";
    state.doneBtn = document.createElement("button");
    state.doneBtn.className = "btn-done";
    state.doneBtn.type = "button";
    state.doneBtn.textContent = "Mark done";
    state.doneBtn.addEventListener("click", () => report("completed"));
    footer.appendChild(state.doneBtn);

    card.append(header, instruction, hint, footer);
    shadow.appendChild(card);
    (document.body || document.documentElement).appendChild(host);

    state.host = host;
    state.card = card;
  }

  function setCardStatus(text) {
    if (state.doneBtn) state.doneBtn.textContent = text;
  }

  function closeCard() {
    stopTimers();
    disarmTracker();
    if (state.host && state.host.parentNode) state.host.parentNode.removeChild(state.host);
    state.host = null;
    state.card = null;
  }

  function renderTimer() {
    if (!state.timerEl) return;
    const left = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    state.timerEl.textContent = left > 0 ? Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0") : "";
  }

  function startTimers() {
    state.deadline = Date.now() + STALL_MS;
    renderTimer();
    state.tickTimer = setInterval(renderTimer, 1000);
    state.stallTimer = setInterval(() => {
      if (Date.now() >= state.deadline) {
        clearInterval(state.tickTimer);
        state.stallTimer = 0;
        if (state.doneBtn) state.doneBtn.disabled = true;
        report("stalled");
      }
    }, 1000);
  }

  function stopTimers() {
    clearInterval(state.stallTimer);
    clearInterval(state.tickTimer);
    state.stallTimer = 0;
    state.tickTimer = 0;
  }

  // ── Controller ─────────────────────────────────────────────────

  function armWith(plan) {
    if (!plan || !plan.planId || !plan.step || !plan.step.instruction) return false;
    closeCard();
    state.finished = false;
    state.plan = plan;
    ensureCard();
    const shadow = state.host.shadowRoot;
    shadow.getElementById("dojo-guide-instruction").textContent = plan.step.instruction;
    shadow.getElementById("dojo-guide-hint").textContent = plan.step.targetHint
      ? "Where: " + plan.step.targetHint
      : "";
    requestAnimationFrame(() => state.card.classList.add("dojo-visible"));
    armTracker();
    startTimers();
    return true;
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (res) =>
          resolve(res && res[key] ? res[key] : null)
        );
      } catch {
        resolve(null);
      }
    });
  }

  function clearStoredPlan() {
    try {
      chrome.storage.local.remove(PLAN_KEY, () => void chrome.runtime.lastError);
    } catch {
      /* non-extension context */
    }
  }

  async function boot() {
    const stored = await storageGet(PLAN_KEY);
    if (
      stored &&
      typeof stored === "object" &&
      stored.planId &&
      typeof stored.storedAt === "number" &&
      Date.now() - stored.storedAt <= PLAN_TTL_MS
    ) {
      armWith(stored);
    }
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "DOJO_GUIDE_ARM" && msg.plan) armWith(msg.plan);
    });
  } catch {
    /* not in an extension context */
  }

  window.DojoPracticeGuide = { armWith, complete: () => report("completed") };
  boot();
})();
