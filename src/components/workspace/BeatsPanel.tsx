"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// BeatsPanel — M3.2 beat-chapterization timeline for long videos.
//
// Fetches GET /api/video-beats for the active video and renders a
// collapsible vertical timeline: numbered chip + title + mm:ss
// range + focus line, with a bordered comprehension-check callout
// under each beat. not_eligible renders nothing (common case);
// no_transcript renders one muted note; errors render inline.
// ═══════════════════════════════════════════════════════════════

interface BeatCheck {
    type: string;
    prompt: string;
}

interface Beat {
    index: number;
    startSec: number;
    endSec: number;
    title: string;
    focus: string;
    comprehensionCheck: BeatCheck;
}

type BeatsState =
    | { kind: "ok"; beats: Beat[] }
    | { kind: "not_eligible" }
    | { kind: "no_transcript" }
    | { kind: "error"; message: string };

interface FetchedBeats {
    /** Request key this outcome belongs to (video+params identity). */
    key: string;
    state: BeatsState;
}

interface BeatsPanelProps {
    videoId: string | null;
    durationSeconds?: number;
    topic?: string;
    spec?: Record<string, unknown>;
}

function formatClock(totalSeconds: number): string {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(sec).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const CHECK_LABELS: Record<string, string> = {
    question: "Check yourself",
    summary: "Summarize",
    flowchart: "Draw the flow",
    mini_game: "Mini game",
};

export default function BeatsPanel({
    videoId,
    durationSeconds,
    topic,
    spec,
}: BeatsPanelProps) {
    const [outcome, setOutcome] = useState<FetchedBeats | null>(null);
    const [open, setOpen] = useState(true);

    const epochRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    // Serialized once so object identity never re-triggers the fetch.
    const specJson = useMemo(() => (spec ? JSON.stringify(spec) : ""), [spec]);
    const requestKey = `${videoId ?? ""}|${durationSeconds ?? ""}|${(topic ?? "").trim()}|${specJson}`;

    // Display state is fully derived: idle without a video, loading while
    // no outcome matches the current request key. Effects only ever call
    // setState after an await, never synchronously in the effect body.
    const state: BeatsState | null = !videoId
        ? null
        : outcome && outcome.key === requestKey
            ? outcome.state
            : null;
    const loading = Boolean(videoId) && state === null;

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    useEffect(() => {
        if (!videoId) return;

        const epoch = ++epochRef.current;
        const isStale = () => epochRef.current !== epoch;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const params = new URLSearchParams({ videoId });
        const trimmedTopic = (topic ?? "").trim();
        if (trimmedTopic) params.append("topic", trimmedTopic);
        if (durationSeconds && durationSeconds > 0) {
            params.append("durationSeconds", String(Math.round(durationSeconds)));
        }
        if (specJson) params.append("spec", specJson);

        (async () => {
            try {
                const res = await fetch(`/api/video-beats?${params.toString()}`, {
                    signal: controller.signal,
                });
                if (isStale()) return;
                const data = await res.json();
                if (isStale()) return;
                if (data?.status === "ok" && Array.isArray(data.beats)) {
                    setOutcome({ key: requestKey, state: { kind: "ok", beats: data.beats } });
                } else if (data?.status === "not_eligible") {
                    setOutcome({ key: requestKey, state: { kind: "not_eligible" } });
                } else if (data?.status === "no_transcript") {
                    setOutcome({ key: requestKey, state: { kind: "no_transcript" } });
                } else {
                    throw new Error(
                        typeof data?.message === "string"
                            ? data.message
                            : `Beats request failed (${res.status})`
                    );
                }
            } catch (e) {
                if (isStale()) return;
                if (e instanceof DOMException && e.name === "AbortError") return;
                setOutcome({
                    key: requestKey,
                    state: {
                        kind: "error",
                        message:
                            e instanceof Error ? e.message : "Failed to load beats",
                    },
                });
            }
        })();
    }, [videoId, durationSeconds, topic, specJson, requestKey]);

    if (!videoId || state === null || state.kind === "not_eligible") {
        if (loading) {
            return <BeatsSkeleton open={open} onToggle={() => setOpen((v) => !v)} />;
        }
        return null;
    }

    return (
        <div
            className="rounded-lg shrink-0"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
            <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-4 py-2.5 active:scale-[0.99]"
                style={{ borderBottom: open ? "1px solid var(--border)" : "1px solid transparent" }}
            >
                <span className="flex items-center gap-2">
                    <span
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--accent)" }}
                    >
                        📑 Video Beats
                    </span>
                    {state.kind === "ok" && (
                        <span
                            className="font-mono text-[10px] font-semibold px-1.5 rounded-full leading-4"
                            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                        >
                            {state.beats.length}
                        </span>
                    )}
                </span>
                <span
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)", transition: "transform 150ms ease" }}
                >
                    {open ? "▾" : "▸"}
                </span>
            </button>

            {open && (
                <div className="px-4 pt-3 pb-4">
                    {state.kind === "no_transcript" && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            No captions available for this video — beats unavailable.
                        </p>
                    )}

                    {state.kind === "error" && (
                        <div
                            role="alert"
                            className="p-2.5 rounded-md text-xs"
                            style={{
                                background: "rgba(239,68,68,0.05)",
                                border: "1px solid rgba(239,68,68,0.25)",
                                color: "#EF4444",
                            }}
                        >
                            ⚠ {state.message}
                        </div>
                    )}

                    {state.kind === "ok" && state.beats.length === 0 && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            No beats returned for this video.
                        </p>
                    )}

                    {state.kind === "ok" && state.beats.length > 0 && (
                        <div>
                            {state.beats.map((beat, i) => (
                                <div key={beat.index} className="flex gap-3">
                                    <div className="flex flex-col items-center shrink-0">
                                        <span
                                            className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold"
                                            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                                        >
                                            {beat.index + 1}
                                        </span>
                                        {i < state.beats.length - 1 && (
                                            <span
                                                className="w-px flex-1 my-1"
                                                style={{ background: "var(--border)" }}
                                            />
                                        )}
                                    </div>
                                    <div className={`min-w-0 flex-1 ${i < state.beats.length - 1 ? "pb-4" : ""}`}>
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            <span
                                                className="text-sm font-semibold"
                                                style={{ color: "var(--text-primary)" }}
                                            >
                                                {beat.title}
                                            </span>
                                            <span
                                                className="font-mono text-[10px] px-1.5 rounded-full leading-4"
                                                style={{
                                                    background: "var(--bg-primary)",
                                                    border: "1px solid var(--border)",
                                                    color: "var(--text-muted)",
                                                }}
                                            >
                                                {formatClock(beat.startSec)}–{formatClock(beat.endSec)}
                                            </span>
                                        </div>
                                        <p
                                            className="text-xs mt-0.5 leading-relaxed"
                                            style={{ color: "var(--text-secondary)" }}
                                        >
                                            {beat.focus}
                                        </p>
                                        {beat.comprehensionCheck?.prompt && (
                                            <div
                                                className="mt-1.5 p-2 rounded-md text-[11px] leading-relaxed"
                                                style={{
                                                    background: "var(--bg-primary)",
                                                    border: "1px dashed var(--border)",
                                                    color: "var(--text-secondary)",
                                                }}
                                            >
                                                <span
                                                    className="font-semibold uppercase tracking-wide mr-1"
                                                    style={{ color: "var(--accent)" }}
                                                >
                                                    {CHECK_LABELS[beat.comprehensionCheck.type] ?? "Check"}:
                                                </span>
                                                {beat.comprehensionCheck.prompt}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function BeatsSkeletonBody() {
    return (
        <div className="space-y-3 animate-pulse">
            <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full shrink-0" style={{ background: "var(--border)" }} />
                <div className="h-3 rounded flex-1 max-w-[45%]" style={{ background: "var(--border)" }} />
            </div>
            <div className="h-3 rounded w-2/3 ml-9" style={{ background: "var(--border)" }} />
            <div className="h-3 rounded w-1/2 ml-9" style={{ background: "var(--border)" }} />
        </div>
    );
}

function BeatsSkeleton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    return (
        <div
            className="rounded-lg shrink-0"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
            <button
                onClick={onToggle}
                aria-expanded={open}
                className="w-full flex items-center justify-between px-4 py-2.5 active:scale-[0.99]"
                style={{ borderBottom: open ? "1px solid var(--border)" : "1px solid transparent" }}
            >
                <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--accent)" }}
                >
                    📑 Video Beats
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {open ? "▾" : "▸"}
                </span>
            </button>
            {open && (
                <div className="px-4 pt-3 pb-4">
                    <BeatsSkeletonBody />
                </div>
            )}
        </div>
    );
}
