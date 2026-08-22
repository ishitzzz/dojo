"use client";

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Workspace from "@/components/Workspace";
import ResourceHub from "@/components/nexus/ResourceHub";
import { KnowledgeNode } from "@/types/nexus";

interface WorkspaceOverlayProps {
    node: KnowledgeNode | null;
    onClose: () => void;
    originTopic: string;
    seenVideoIds: string[];
    onVideoSeen: (id: string) => void;
}

export default function WorkspaceOverlay({ node, onClose, originTopic, seenVideoIds, onVideoSeen }: WorkspaceOverlayProps) {
    const module = node
        ? {
            moduleTitle: node.title,
            chapters: [
                {
                    chapterTitle: node.title,
                    youtubeQuery: node.youtubeQuery || node.title,
                    quizQuestion: `Explain the core concept of ${node.title}`,
                },
            ],
        }
        : null;

    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) {
                onClose();
            }
        },
        [onClose]
    );

    return (
        <AnimatePresence>
            {node && module && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    onClick={handleBackdropClick}
                >
                    <div className="absolute inset-0 bg-[#09090B]/90" />

                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="nexus-workspace-overlay relative w-[95vw] h-[95vh] bg-[#111114] rounded-lg border border-[#1C1C21] overflow-hidden flex flex-col"
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-5 right-5 z-50 w-10 h-10 flex items-center justify-center rounded-lg bg-[#09090B] hover:bg-red-500/10 border border-[#1C1C21] hover:border-red-500/30 text-[#71717A] hover:text-red-400"
                            style={{ transition: "background-color 150ms ease, color 150ms ease, border-color 150ms ease" }}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <div className="px-6 py-4 border-b border-[#1C1C21] flex-shrink-0 pr-16">
                            <h2 className="text-lg font-semibold text-[#F4F4F5] truncate">{node.title}</h2>
                            <p className="text-sm text-[#71717A] mt-0.5 line-clamp-1">{node.summary}</p>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            <div className="flex flex-col lg:flex-row h-full">
                                <div className="flex-1 min-h-[50vh] lg:min-h-0 overflow-hidden flex flex-col">
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    <Workspace
                                        module={module as any}
                                        onBack={onClose}
                                        userContext={{
                                            topic: originTopic,
                                        }}
                                        anchorChannel={null}
                                        seenVideoIds={seenVideoIds}
                                        onVideoSeen={onVideoSeen}
                                    />
                                </div>

                                <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-[#1C1C21] overflow-hidden flex flex-col">
                                    <div className="overflow-y-auto max-h-full p-4">
                                        <ResourceHub
                                            topic={originTopic}
                                            nodeTitle={node.title}
                                            isVisible={true}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
