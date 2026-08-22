"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Scene } from "@/lib/whiteboard/commands";
import { parseDrawCommand } from "@/lib/whiteboard/canvasInterceptor";
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
    const [muted, setMuted] = useState(false);
    const [paused, setPaused] = useState(false);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");

    // Mutable playback plumbing kept in refs so event handlers never
    // operate on stale values across async SSE iterations.
    const queueRef = useRef<Scene[]>([]);
    const buildingRef = useRef<Scene | null>(null);
    const waitingRef = useRef(false); // board has nothing queued/playing
    const streamDoneRef = useRef(false);
    const pausedRef = useRef(false);
    const mutedRef = useRef(false);
    const sessionIdRef = useRef<string | null>(null);
    const explainAbortRef = useRef<AbortController | null>(null);
    const tutorAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        mutedRef.current = muted;
    }, [muted]);

    // Unmount cleanup: stop speech and any in-flight streams.
    useEffect(
        () => () => {
            window.speechSynthesis.cancel();
            explainAbortRef.current?.abort();
            tutorAbortRef.current?.abort();
        },
        []
    );

    function speak(text: string): void {
        if (mutedRef.current || text.length === 0) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.02;
        window.speechSynthesis.speak(utterance);
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
        if (waitingRef.current && !pausedRef.current) {
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
            case "RESULT":
                flushBuilding();
                break;
            case "ERROR":
                flushBuilding();
                setStatus(event.content ?? "Something went wrong");
                break;
            case "DONE":
                flushBuilding();
                streamDoneRef.current = true;
                if (waitingRef.current && !pausedRef.current) {
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
        setPaused(false);
        setActiveScene(null);
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
        if (waitingRef.current && queueRef.current.length > 0) {
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
        queueRef.current = [];
        buildingRef.current = null;
        waitingRef.current = false;
        setPhase("idle");
        setStatus("");
        setActiveScene(null);
        setAnswer("");
    }

    const live = phase !== "idle" && phase !== "done";

    // Stable identity across unrelated re-renders (typing, streamed answer
    // chunks, status flips) — a fresh array here would reset the board via
    // WhiteboardRenderer's prevScenes !== scenes check mid-playback.
    const sceneArg = useMemo(() => (activeScene ? [activeScene] : []), [
        activeScene,
    ]);

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

            <div className="mt-4">
                {activeScene ? (
                    <WhiteboardRenderer
                        scenes={sceneArg}
                        speed={BOARD_SPEED}
                        paused={paused}
                        onSceneDone={() => playNext()}
                    />
                ) : (
                    <div className="flex aspect-[8/5] w-full items-center justify-center rounded-lg border border-dashed border-neutral-800 bg-[#1e1e1e]">
                        <p className="text-sm text-neutral-600">
                            {phase === "idle"
                                ? "Enter a topic and press Explain to start the board"
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
