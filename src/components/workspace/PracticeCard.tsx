"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// PracticeCard — M7.1 single-step practice loop for a chapter.
//
// "🎯 Get practice step" → GET /api/practice-plan (topic +
// chapterTitle) → instruction card with Mark done ✓ / Skip →
// POST /api/practice-outcome → inline "Logged ✓" note. Another
// step can be fetched after logging. Errors render inline.
// ═══════════════════════════════════════════════════════════════

type Outcome = "completed" | "skipped";

interface ActiveStep {
    planId: string;
    instruction: string;
    targetHint: string;
}

interface PracticeCardProps {
    topic: string;
    chapterTitle: string;
}

export default function PracticeCard({ topic, chapterTitle }: PracticeCardProps) {
    const [step, setStep] = useState<ActiveStep | null>(null);
    const [loading, setLoading] = useState(false);
    const [logging, setLogging] = useState(false);
    const [loggedOutcome, setLoggedOutcome] = useState<Outcome | null>(null);
    const [error, setError] = useState<string | null>(null);

    const epochRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const fetchStep = useCallback(async () => {
        const t = topic.trim();
        const c = chapterTitle.trim();
        if (!t && !c) {
            setError("No topic available for practice.");
            return;
        }

        const epoch = ++epochRef.current;
        const isStale = () => epochRef.current !== epoch;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);
        setLoggedOutcome(null);
        setStep(null);

        try {
            const params = new URLSearchParams();
            if (t) params.append("topic", t);
            if (c) params.append("chapterTitle", c);

            const res = await fetch(`/api/practice-plan?${params.toString()}`, {
                signal: controller.signal,
            });
            if (!res.ok && isStale()) return;
            const data = await res.json();
            if (isStale()) return;

            if (
                data?.status !== "ok" ||
                typeof data.planId !== "string" ||
                typeof data.step?.instruction !== "string"
            ) {
                throw new Error(
                    typeof data?.error === "string"
                        ? data.error
                        : `Practice plan request failed (${res.status})`
                );
            }

            setStep({
                planId: data.planId,
                instruction: data.step.instruction,
                targetHint:
                    typeof data.step.targetHint === "string" ? data.step.targetHint : "",
            });
        } catch (e) {
            if (!isStale() && !(e instanceof DOMException && e.name === "AbortError")) {
                setError(
                    e instanceof Error ? e.message : "Could not get a practice step."
                );
            }
        } finally {
            if (!isStale()) setLoading(false);
        }
    }, [topic, chapterTitle]);

    const reportOutcome = useCallback(
        async (outcome: Outcome) => {
            if (!step || logging) return;

            const epoch = ++epochRef.current;
            const isStale = () => epochRef.current !== epoch;
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setLogging(true);
            setError(null);

            try {
                const res = await fetch("/api/practice-outcome", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ planId: step.planId, outcome }),
                    signal: controller.signal,
                });
                if (!res.ok && isStale()) return;
                const data = await res.json();
                if (isStale()) return;
                if (!res.ok || data.status !== "ok") {
                    throw new Error(
                        typeof data?.error === "string"
                            ? data.error
                            : `Outcome request failed (${res.status})`
                    );
                }
                setLoggedOutcome(outcome);
            } catch (e) {
                if (!isStale() && !(e instanceof DOMException && e.name === "AbortError")) {
                    setError(
                        e instanceof Error ? e.message : "Could not log the outcome."
                    );
                }
            } finally {
                if (!isStale()) setLogging(false);
            }
        },
        [step, logging]
    );

    return (
        <div
            className="rounded-lg p-3 mb-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--accent)" }}>
                🎯 Practice Step
            </div>

            {loading && (
                <div className="space-y-2 animate-pulse">
                    <div className="h-3 rounded w-full" style={{ background: "var(--border)" }} />
                    <div className="h-3 rounded w-4/5" style={{ background: "var(--border)" }} />
                </div>
            )}

            {!loading && !step && !loggedOutcome && (
                <button
                    onClick={() => void fetchStep()}
                                className="px-3 py-1.5 rounded-md text-xs font-medium text-white active:scale-[0.97] bg-[#6366F1] hover:bg-[#5558E3] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                    🎯 Get practice step
                </button>
            )}

            {!loading && step && (
                <div className="slide-up">
                    <p
                        className="text-sm leading-relaxed"
                        style={{ color: "var(--text-primary)", opacity: 0.85 }}
                    >
                        {step.instruction}
                    </p>
                    {step.targetHint && (
                        <span
                            className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full"
                            style={{
                                background: "var(--bg-primary)",
                                border: "1px solid var(--border)",
                                color: "var(--text-muted)",
                            }}
                        >
                            📍 {step.targetHint}
                        </span>
                    )}

                    {loggedOutcome ? (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium" style={{ color: "#10B981" }}>
                                Logged ✓
                            </span>
                            <button
                                onClick={() => void fetchStep()}
                                disabled={loading}
                                className="text-xs font-medium px-3 py-1 rounded active:scale-[0.97] resource-link-hover disabled:opacity-50"
                                style={{
                                    background: "var(--accent-soft)",
                                    color: "var(--accent)",
                                    border: "1px solid transparent",
                                }}
                            >
                                ↻ Get another step
                            </button>
                        </div>
                    ) : (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => void reportOutcome("completed")}
                                disabled={logging}
                                className="px-3 py-1.5 rounded-md text-xs font-medium text-white active:scale-[0.97] bg-[#6366F1] hover:bg-[#5558E3] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            >
                                {logging ? "Logging…" : "Mark done ✓"}
                            </button>
                            <button
                                onClick={() => void reportOutcome("skipped")}
                                disabled={logging}
                                className="px-3 py-1.5 rounded-md text-xs active:scale-[0.97] hover-text-primary disabled:opacity-40 disabled:pointer-events-none"
                                style={{
                                    background: "var(--bg-primary)",
                                    border: "1px solid var(--border)",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                Skip
                            </button>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div
                    role="alert"
                    className="mt-2 p-2.5 rounded-md text-xs"
                    style={{
                        background: "rgba(239,68,68,0.05)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        color: "#EF4444",
                    }}
                >
                    ⚠ {error}
                </div>
            )}
        </div>
    );
}
