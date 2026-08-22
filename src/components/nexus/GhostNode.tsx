"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";

interface GhostNodeData {
    title: string;
    summary: string;
}

function GhostNode({ data }: NodeProps<GhostNodeData>) {
    const { title, summary } = data;

    return (
        <div
            className="relative rounded-lg border border-dashed border-[var(--border-hover)] p-4 min-w-[200px] max-w-[250px] bg-[var(--bg-card)]/60 opacity-70 hover:opacity-90 cursor-pointer drop-shadow-sm"
            style={{ transition: "opacity 150ms ease" }}
        >
            <Handle type="target" position={Position.Top} className="!bg-[#3F3F46] !w-1.5 !h-1.5" />
            <Handle type="source" position={Position.Bottom} className="!bg-[#3F3F46] !w-1.5 !h-1.5" />

            <h3 className="font-medium text-xs text-[var(--text-secondary)] mb-1 line-clamp-2">{title}</h3>
            <p className="text-[10px] text-[var(--text-secondary)]/60 line-clamp-2">{summary}</p>

            <div className="mt-2 text-center">
                <span className="text-[9px] text-[var(--text-secondary)]/40">Prerequisites required</span>
            </div>
        </div>
    );
}

export default memo(GhostNode);
