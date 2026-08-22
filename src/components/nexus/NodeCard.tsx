"use client";

import { memo, useState, useCallback } from "react";
import { Handle, Position, NodeProps } from "reactflow";

interface ContentSection {
    heading: string;
    body: string;
}

interface NodeContent {
    introduction?: string;
    sections?: ContentSection[];
}

interface NodeCardData {
    title: string;
    summary: string;
    content?: NodeContent;
    status: "ghost" | "active" | "mastered";
    zoomLevel: number;
    visitCount: number;
    onExpand: (question: string) => void;
    onOpen: () => void;
    onLaunchCourse: () => void;
}

function NodeCard({ data }: NodeProps<NodeCardData>) {
    const [followUpInput, setFollowUpInput] = useState("");
    const { title, summary, content, status, zoomLevel, visitCount, onExpand, onOpen, onLaunchCourse } = data;

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && followUpInput.trim()) {
                onExpand(followUpInput.trim());
                setFollowUpInput("");
            }
        },
        [followUpInput, onExpand]
    );

    const statusStyles = {
        ghost: "opacity-75 border-dashed border-[var(--border-hover)] bg-[var(--bg-card)]/60",
        active: "opacity-100 border-solid border-[#6366F1]/40 bg-[#111114]",
        mastered: "opacity-100 border-solid border-[#818CF8]/60 bg-[#111114]",
    };

    const showFullContent = zoomLevel > 0.7;
    const showFollowUp = zoomLevel > 0.6 && status !== "ghost";

    return (
        <div
            className={`
                group relative rounded-lg border cursor-pointer
                hover:border-[#6366F1]/60
                ${statusStyles[status]}
                ${visitCount >= 3 ? "ring-1 ring-[#6366F1]/30" : ""}
                ${showFullContent ? 'p-5 min-w-[340px] max-w-[400px]' : 'p-4 min-w-[260px] max-w-[320px]'}
            `}
            style={{ transition: "border-color 150ms ease" }}
            onClick={status !== "ghost" ? onOpen : undefined}
        >
            <Handle type="target" position={Position.Top} className="!bg-[#6366F1] !w-2 !h-2 !border-[1px] !border-[#09090B] !-top-1" />
            <Handle type="source" position={Position.Bottom} className="!bg-[#6366F1] !w-2 !h-2 !border-[1px] !border-[#09090B] !-bottom-1" />

            {/* Status badge */}
            <div className="absolute -top-2 -right-2">
                {status === "mastered" && (
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-[#6366F1] rounded-full text-white text-[10px] font-bold">✓</span>
                )}
            </div>

            <h3 className={`font-semibold text-sm mb-1.5 leading-tight ${status === "mastered" ? "text-[#818CF8]" : "text-[#F4F4F5]"}`}>
                {title}
            </h3>

            <p className={`text-[#71717A] mb-3 leading-relaxed ${showFullContent ? 'text-xs' : 'text-[11px] line-clamp-3'}`}>
                {summary}
            </p>

            {showFullContent && content?.sections && (
                <div className="space-y-3 mb-3">
                    {content.sections.slice(0, 3).map((section, idx) => (
                        <div key={idx} className="border-l border-[#6366F1]/30 pl-3">
                            <h4 className="text-[11px] font-semibold text-[#818CF8] mb-0.5">
                                {section.heading}
                            </h4>
                            <p className="text-[10px] text-[#71717A] leading-relaxed">
                                {section.body}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {showFollowUp && (
                <>
                    <div className="pt-3 border-t border-[#1C1C21]">
                        <input
                            type="text"
                            value={followUpInput}
                            onChange={(e) => setFollowUpInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Ask a question..."
                            className="w-full bg-[#09090B] border border-[#1C1C21] rounded-md px-3 py-2 text-xs text-[#F4F4F5] placeholder-[#3F3F46] focus:outline-none focus:border-[#6366F1]"
                            style={{ transition: "border-color 150ms ease" }}
                        />
                    </div>
                    <div className="mt-2 pt-2 border-t border-[#1C1C21]">
                        <button
                            onClick={(e) => { e.stopPropagation(); onLaunchCourse(); }}
                            className="w-full text-left text-[10px] text-[#3F3F46] hover:text-[#6366F1] flex items-center gap-1.5 group"
                            style={{ transition: "color 150ms ease" }}
                            title="Generate a full learning path starting from this concept"
                        >
                            <span className="text-xs leading-none">↓</span>
                            Build a full course from here
                        </button>
                    </div>
                </>
            )}

            {status === "ghost" && (
                <div className="mt-2 text-center">
                    <span className="text-[10px] text-[#3F3F46]">Click to explore</span>
                </div>
            )}
        </div>
    );
}

export default memo(NodeCard);
