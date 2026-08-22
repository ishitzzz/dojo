"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Scene } from "@/lib/whiteboard/commands";
import { parseDrawCommand } from "@/lib/whiteboard/canvasInterceptor";
import { estimateSceneSeconds } from "@/lib/whiteboard/pacing";
import type { TurnEvent } from "@/lib/brain/types/events";
import WhiteboardRenderer from "./WhiteboardRenderer";

// ═══════════════════════════════════════════════════════════════
// ExplainBoardPlayer — M5.2 live whiteboard explainer.
//
// Streams /api/turn (mode "explain_board"), accumulates scenes from
// NARRATION + DRAW_DELTA events, feeds completed scenes to the
// renderer one at a time with speech-synthesis narration. While
// playing, an interrupt box pauses board + TTS, asks the tutor via
// the normal chat path on the same sessionId, shows the streamed
// answer, then auto-resumes when the answer's DONE arrives.
//
// UX fixes layered in:
// - Defect #2 (no voice): speechSynthesis.speak() without a prior user
//   gesture is blocked in Brave and friends. The first scene therefore
//   never auto-plays — a "▶ Start lesson" button gates playback, and
//   its click handler synchronously primes speechSynthesis (a silent
//   utterance) so every later speak() runs under that gesture's sticky
//   activation. Utterance errors and voice-less browsers surface an
//   inline "Narration unavailable" warning instead of silence. Mute
//   still works; default is unmuted.
// - Defect #3 ("scene 1 / 1"): the total scene count only becomes known
//   when the RESULT event arrives; until then the badge says
//   "Planning…"/"scene k" rather than a wrong "k / 1".
// - Defect #1b (pacing): each active scene gets a duration hint
//   (estimated natural seconds) which WhiteboardRenderer stretches into
//   the ≥7s/≤25s window.
// ═══════════════════════════════════════════════════════════════

type Phase = "idle" | "planning" | "playing" | "interrupted" | "done" | "error";

const BOARD_SPEED = 1.25;

async function* readSseEvents(res: Response): AsyncGenerator<TurnEvent> {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Streaming responses are not supported here");
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let sep = buffer.indexOf("\n\n");
            while (sep >= 0) {
                const chunk = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                for (const line of chunk.split("\n")) {
                    if (line.startsWith("data: ")) {
                        yield JSON.parse(line.slice("data: ".length)) as TurnEvent;
                    }
                }
                sep = buffer.indexOf("\n\n");
            }
        }
    } finally {
        reader.releaseLock();
    }
}

function isAbort(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

interface ExplainBoardPlayerProps {
    /** Seed for the topic input (e.g. ?topic= deep link). */
    initialTopic?: string;
}

export default function ExplainBoardPlayer({
    initialTopic = "",
}: ExplainBoardPlayerProps) {
    const [topic, setTopic] = useState(initialTopic);
    const [phase, setPhase] = useState<Phase>("idle");
    const [status, setStatus] = useState("");
    const [activeScene, setActiveScene] = useState<Scene | null>(null);
    const [muted, setMuted] = useState(false); // default: unmuted
    const [paused, setPaused] = useState(false);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    // Defect #2: playback (and thus the first speak()) waits for an
    // explicit "▶ Start lesson" click — that click is the user gesture
    // Brave requires before speechSynthesis will talk.
    const [awaitingStart, setAwaitingStart] = useState(false);
    // Defect #3: total scenes is only authoritative once RESULT arrives.
    const [sceneIndex, setSceneIndex] = useState(0);
    const [totalScenes, setTotalScenes] = useState<number | null>(null);
    const [ttsWarning, setTtsWarning] = useState(false);

    // Mutable playback plumbing kept in refs so event handlers never
    // operate on stale values across async SSE iterations.
    const queueRef = useRef<Scene[]>([]);
    const buildingRef = useRef<Scene | null>(null);
    const waitingRef = useRef(false); // board has nothing queued/playing
    const streamDoneRef = useRef(false);
    const pausedRef = useRef(false);
    const mutedRef = useRef(false);
    const awaitingStartRef = useRef(false);
    const ttsWarnedRef = useRef(false);
    const sessionIdRef = useRef<string | null>(null);
    const explainAbortRef = useRef<AbortController | null>(null);
    const tutorAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        mutedRef.current = muted;
    }, [muted]);

    // Defect #2 diagnostics: a browser with zero speech voices (or one
    // whose synthesis errors out) gets a visible inline warning instead
    // of silent failure. Voices load asynchronously in Chrome/Brave, so
    // we only flag when they're still absent after voiceschanged or a
    // grace timeout.
    useEffect(() => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
            flagTtsProblem();
            return;
        }
        const synth = window.speechSynthesis;
        const checkVoices = () => {
            if (synth.getVoices().length === 0) flagTtsProblem();
        };
        synth.addEventListener?.("voiceschanged", checkVoices);
        const timer = window.setTimeout(checkVoices, 2500);
        return () => {
            synth.removeEventListener?.("voiceschanged", checkVoices);
            window.clearTimeout(timer);
        };
    }, []);

    function flagTtsProblem(): void {
        if (ttsWarnedRef.current) return;
        ttsWarnedRef.current = true;
        setTtsWarning(true);
    }

    // Unmount cleanup: stop speech and any in-flight streams.
    useEffect(
        () => () => {
            window.speechSynthesis.cancel();
            explainAbortRef.current?.abort();
            tutorAbortRef.current?.abort();
        },
        []
    );

    /**
     * UX defect #2: called synchronously inside the "▶ Start lesson"
     * click handler chain so the very first speak() happens under user
     * activation. The silent primer utterance establishes sticky
     * activation for speechSynthesis (Brave blocks speak() on pages
     * that never had a gesture), and getVoices() kick-starts the async
     * voice-list load.
     */
    function primeSpeechSynthesis(): void {
        try {
            const synth = window.speechSynthesis;
            synth.getVoices();
            const primer = new SpeechSynthesisUtterance(" ");
            primer.volume = 0;
            primer.rate = 2;
            synth.speak(primer);
        } catch {
            flagTtsProblem();
        }
    }

    function speak(text: string): void {
        if (mutedRef.current || text.length === 0) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.02;
        utterance.onerror = () => flagTtsProblem(); // never swallow silently
        window.speechSynthesis.speak(utterance);
    }

    /** "▶ Start lesson" click: gesture chain → prime → first scene speaks. */
    function beginPlayback(): void {
        primeSpeechSynthesis(); // synchronous, same call stack as the click
        awaitingStartRef.current = false;
        setAwaitingStart(false);
        pausedRef.current = false;
        waitingRef.current = false;
        playNext();
    }

    function playNext(): void {
        // Pause barrier: never advance scenes (or speak) while interrupted.
        // The board stays on the current scene; resumePlayback re-drives this.
        if (pausedRef.current) {
            waitingRef.current = true;
            return;
        }
        const next = queueRef.current.shift() ?? null;
        setActiveScene(next);
        setSceneIndex((prev) => (next ? prev + 1 : prev));
        if (next) {
            speak(next.narration);
        } else if (streamDoneRef.current) {
            setPhase((prev) => (prev === "error" ? prev : "done"));
            setStatus("");
        } else {
            waitingRef.current = true;
        }
    }

    /** Moves a fully-received scene into the playback queue. */
    function flushBuilding(): void {
        const scene = buildingRef.current;
        buildingRef.current = null;
        if (!scene || scene.drawCommands.length === 0) return;
        queueRef.current.push(scene);
        // Defect #2: while awaiting the explicit Start click the queue
        // accumulates silently — no auto-play, no auto-speak.
        if (
            waitingRef.current &&
            !pausedRef.current &&
            !awaitingStartRef.current
        ) {
            waitingRef.current = false;
            playNext();
        }
    }

    function handleEvent(event: TurnEvent): void {
        switch (event.type) {
            case "SESSION":
                sessionIdRef.current = event.sessionId;
                break;
            case "STAGE_START":
                if (event.stage === "planning_explanation") {
                    setStatus("Planning your explanation…");
                }
                break;
            case "NARRATION": {
                flushBuilding(); // previous scene is complete now
                const meta = (event.metadata ?? {}) as {
                    index?: number;
                    title?: string;
                };
                buildingRef.current = {
                    title:
                        meta.title ?? `Scene ${(meta.index ?? 0) + 1}`,
                    narration: event.content ?? "",
                    drawCommands: [],
                };
                setPhase((prev) =>
                    prev === "idle" || prev === "planning" ? "playing" : prev
                );
                break;
            }
            case "DRAW_DELTA": {
                // Coerce untrusted payloads through the single-command
                // validator; malformed events are skipped, never cast.
                const raw = (event.metadata as { command?: unknown } | undefined)
                    ?.command;
                const command = parseDrawCommand(raw);
                if (command && buildingRef.current) {
                    buildingRef.current.drawCommands.push(command);
                }
                break;
            }
            case "RESULT": {
                flushBuilding();
                // Defect #3: RESULT metadata carries the authoritative total
                // ({ scenes: N, topic }) — until it arrives we never display
                // a fabricated "k / 1".
                const scenes = (event.metadata as { scenes?: unknown } | undefined)
                    ?.scenes;
                if (typeof scenes === "number" && Number.isFinite(scenes)) {
                    setTotalScenes(Math.round(scenes));
                } else if (typeof scenes === "string" && scenes.trim() !== "") {
                    const n = Number(scenes);
                    if (Number.isFinite(n)) setTotalScenes(Math.round(n));
                }
                break;
            }
            case "ERROR":
                flushBuilding();
                setStatus(event.content ?? "Something went wrong");
                break;
            case "DONE":
                flushBuilding();
                streamDoneRef.current = true;
                if (
                    !awaitingStartRef.current &&
                    waitingRef.current &&
                    !pausedRef.current
                ) {
                    waitingRef.current = false;
                    playNext();
                }
                break;
        }
    }

    async function start(): Promise<void> {
        const trimmed = topic.trim();
        if (trimmed.length === 0) return;

        window.speechSynthesis.cancel();
        queueRef.current = [];
        buildingRef.current = null;
        waitingRef.current = true; // board idle, awaiting first scene
        streamDoneRef.current = false;
        pausedRef.current = false;
        // Defect #2: no auto-play — the first scene waits for the
        // explicit "▶ Start lesson" gesture.
        awaitingStartRef.current = true;
        setAwaitingStart(true);
        setPaused(false);
        setActiveScene(null);
        setSceneIndex(0);
        setTotalScenes(null);
        setAnswer("");
        setPhase("planning");
        setStatus("Planning your explanation…");

        const sessionId = crypto.randomUUID();
        sessionIdRef.current = sessionId;

        const controller = new AbortController();
        explainAbortRef.current?.abort();
        explainAbortRef.current = controller;
        tutorAbortRef.current?.abort();
        tutorAbortRef.current = null;

        try {
            const res = await fetch("/api/turn", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    mode: "explain_board",
                    topic: trimmed,
                    sessionId,
                }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                throw new Error(`Turn request failed (${res.status})`);
            }
            for await (const event of readSseEvents(res)) {
                handleEvent(event);
            }
        } catch (error) {
            if (!isAbort(error)) {
                setPhase("error");
                setStatus(
                    error instanceof Error ? error.message : String(error)
                );
            }
        }
    }

    function resumePlayback(): void {
        pausedRef.current = false;
        setPaused(false);
        window.speechSynthesis.resume();
        setPhase((prev) => (prev === "done" || prev === "error" ? prev : "playing"));
        if (
            !awaitingStartRef.current &&
            waitingRef.current &&
            queueRef.current.length > 0
        ) {
            waitingRef.current = false;
            playNext();
        }
    }

    /** Interrupt: pause board + TTS, ask the tutor on the same session. */
    async function sendInterrupt(): Promise<void> {
        const q = question.trim();
        const sessionId = sessionIdRef.current;
        if (q.length === 0 || !sessionId) return;

        pausedRef.current = true;
        setPaused(true);
        window.speechSynthesis.pause();
        setQuestion("");
        setAnswer("");
        setPhase("interrupted");

        const controller = new AbortController();
        tutorAbortRef.current?.abort();
        tutorAbortRef.current = controller;

        try {
            const res = await fetch("/api/turn", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: q, sessionId }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                throw new Error(`Tutor request failed (${res.status})`);
            }
            for await (const event of readSseEvents(res)) {
                if (event.type === "CONTENT") {
                    setAnswer((prev) => prev + (event.content ?? ""));
                } else if (event.type === "DONE") {
                    break;
                } else if (event.type === "ERROR") {
                    setAnswer(
                        (prev) => prev + `\n\n[tutor error] ${event.content ?? ""}`
                    );
                    break;
                }
            }
        } catch (error) {
            if (!isAbort(error)) {
                setAnswer(
                    `Tutor unavailable: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        } finally {
            if (!pausedRef.current) return; // user resumed manually already
            resumePlayback(); // auto-resume remaining scenes after DONE/error
        }
    }

    function toggleMute(): void {
        const next = !muted;
        setMuted(next);
        mutedRef.current = next;
        if (next) {
            window.speechSynthesis.cancel();
        } else if (activeScene && !pausedRef.current) {
            speak(activeScene.narration);
        }
    }

    function stop(): void {
        explainAbortRef.current?.abort();
        tutorAbortRef.current?.abort();
        window.speechSynthesis.cancel();
        pausedRef.current = false;
        setPaused(false);
        streamDoneRef.current = true;
        awaitingStartRef.current = false;
        setAwaitingStart(false);
        queueRef.current = [];
        buildingRef.current = null;
        waitingRef.current = false;
        setPhase("idle");
        setStatus("");
        setActiveScene(null);
        setSceneIndex(0);
        setTotalScenes(null);
        setAnswer("");
    }

    const live = phase !== "idle" && phase !== "done";

    // Stable identity across unrelated re-renders (typing, streamed answer
    // chunks, status flips) — a fresh array here would reset the board via
    // WhiteboardRenderer's prevScenes !== scenes check mid-playback.
    const sceneArg = useMemo(() => (activeScene ? [activeScene] : []), [
        activeScene,
    ]);

    // Defect #1b pacing: hand the renderer an estimated natural duration
    // for the active scene; it stretches strokes into the 7-25s window.
    const durationHints = useMemo(
        () => (activeScene ? [estimateSceneSeconds(activeScene.drawCommands)] : undefined),
        [activeScene]
    );

    // Defect #3 badge: "Planning…" while scenes accumulate, "scene k"
    // once playing, "scene k / N" only after RESULT delivers N, and the
    // renderer never falls back to its own (single-scene) total.
    const sceneBadge = useMemo(() => {
        if (phase === "done") return "complete";
        if (!activeScene) return phase === "planning" ? "Planning…" : undefined;
        // N only shown once RESULT delivered it; before that "scene k".
        if (totalScenes === null) return `scene ${sceneIndex}`;
        return `scene ${sceneIndex} / ${totalScenes}`;
    }, [phase, activeScene, totalScenes, sceneIndex]);

    return (
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold">Live explainer</h2>
                <span className="text-xs text-neutral-500">
                    Gemini plans a multi-scene lesson and draws it in real time
                </span>
            </div>

            <div className="mt-3 flex gap-2">
                <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void start();
                    }}
                    placeholder="Topic to learn, e.g. Helm charts"
                    disabled={live}
                    className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <button
                    onClick={() => void start()}
                    disabled={live || topic.trim().length === 0}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                    {live ? "Playing…" : "Explain"}
                </button>
                {live && (
                    <>
                        <button
                            onClick={toggleMute}
                            className="rounded-md border border-neutral-700 px-3 py-2 text-sm"
                        >
                            {muted ? "Unmute" : "Mute"}
                        </button>
                        <button
                            onClick={stop}
                            className="rounded-md border border-neutral-700 px-3 py-2 text-sm"
                        >
                            Stop
                        </button>
                    </>
                )}
            </div>

            {(status.length > 0 || phase === "interrupted") && (
                <p className="mt-2 text-xs text-neutral-400">
                    {phase === "interrupted"
                        ? "Paused — waiting for the tutor's answer…"
                        : status}
                </p>
            )}

            {ttsWarning && (
                <p
                    role="alert"
                    className="mt-2 rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300"
                >
                    Narration unavailable in this browser — the lesson will
                    play silently. (Check the browser&rsquo;s audio permissions
                    or try Chrome/Firefox.)
                </p>
            )}

            <div className="mt-4">
                {activeScene ? (
                    <div className="relative">
                        <WhiteboardRenderer
                            scenes={sceneArg}
                            speed={BOARD_SPEED}
                            durationHints={durationHints}
                            paused={paused}
                            sceneLabelOverride={sceneBadge}
                            onSceneDone={() => playNext()}
                        />
                        {/* Defect #2: first scene waits for this click so the
                            initial speak() runs inside a real user gesture. */}
                        {awaitingStart && (
                            <button
                                onClick={beginPlayback}
                                autoFocus
                                className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-neutral-950/70 text-lg font-semibold text-emerald-300 backdrop-blur-[2px] hover:bg-neutral-950/60"
                            >
                                ▶ Start lesson
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex aspect-[8/5] w-full items-center justify-center rounded-lg border border-dashed border-neutral-800 bg-[#1e1e1e]">
                        <p className="text-sm text-neutral-600">
                            {phase === "idle"
                                ? "Enter a topic and press Explain to start the board"
                                : phase === "planning"
                                    ? "Planning…"
                                    : "Board will appear here…"}
                        </p>
                    </div>
                )}
            </div>

            {live && (
                <div className="mt-4 rounded-md border border-neutral-800 p-3">
                    <div className="flex gap-2">
                        <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter")
                                    void sendInterrupt();
                            }}
                            placeholder="Interrupt: ask a question mid-lesson…"
                            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                        />
                        <button
                            onClick={() => void sendInterrupt()}
                            disabled={
                                question.trim().length === 0 ||
                                !sessionIdRef.current ||
                                phase === "interrupted"
                            }
                            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            Ask
                        </button>
                        {phase === "interrupted" && (
                            <button
                                onClick={resumePlayback}
                                className="rounded-md border border-neutral-700 px-4 py-2 text-sm"
                            >
                                Resume
                            </button>
                        )}
                    </div>
                    {answer.length > 0 && (
                        <div className="mt-3 whitespace-pre-wrap rounded-md bg-neutral-950 p-3 text-sm leading-relaxed text-neutral-300">
                            {answer}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
