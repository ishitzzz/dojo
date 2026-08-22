"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ExplainBoardPlayer from "@/components/whiteboard/ExplainBoardPlayer";

// ═══════════════════════════════════════════════════════════════
// /whiteboard — in-app chrome around ExplainBoardPlayer (M5.2).
// Topic is prefilled from ?topic= (deep-linked from Workspace).
// useSearchParams requires a Suspense boundary for prerender.
// ═══════════════════════════════════════════════════════════════

function WhiteboardShell() {
    const searchParams = useSearchParams();
    const topic = searchParams.get("topic") || "";

    return (
        <div
            className="min-h-screen w-full px-4 md:px-6 pb-10"
            style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
        >
            <div className="mx-auto max-w-4xl">
                {/* Header — same vocabulary/weight as the Workspace header */}
                <div
                    className="flex items-center justify-between mb-3 pb-3 mt-6 lg:mt-12"
                    style={{ borderBottom: "1px solid var(--border)" }}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <Link
                            href="/learn"
                            className="flex items-center gap-1.5 text-sm shrink-0 active:scale-[0.97] hover-text-primary"
                            style={{ color: "var(--text-secondary)" }}
                        >
                            <span>← Back</span>
                        </Link>
                        <div className="h-5 w-px" style={{ background: "var(--border)" }} />
                        <div className="min-w-0">
                            <h1 className="text-base font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                🧑‍🏫 Live Whiteboard
                            </h1>
                            <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                                Explain Board
                            </span>
                        </div>
                    </div>
                </div>

                <ExplainBoardPlayer initialTopic={topic} />
            </div>
        </div>
    );
}

export default function WhiteboardPage() {
    return (
        <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--bg-primary)" }} />}>
            <WhiteboardShell />
        </Suspense>
    );
}
