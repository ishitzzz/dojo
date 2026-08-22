"use client";

/**
 * 📚 Resource Hub v2 — Dynamic Web-Wide Discovery UI
 * 
 * Features:
 * - Multiple videos with different perspectives (not just one)
 * - Web resources from ANY source (not locked to arXiv/OpenLibrary)
 * - Dynamic grid that varies with available resources (not fixed 4x4)
 * - Hover reveals key insight for each resource
 * - Beautiful loading states with contextual text
 * - JIT-loaded per node
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface VideoResource {
    type: "video";
    title: string;
    url: string;
    thumbnail: string;
    channel: string;
    duration: string;
    views: string;
    keyInsight: string;
}

interface WebResource {
    type: string;
    title: string;
    url: string;
    source: string;
    keyInsight: string;
    emoji: string;
}

interface ResourceHubData {
    videos: VideoResource[];
    resources: WebResource[];
}

interface ResourceHubProps {
    topic: string;
    nodeTitle: string;
    isVisible: boolean;
}

// ═══════════════════════════════════════════════════════════════
// LOADING QUOTES — contextual, matches the dojo vibe
// ═══════════════════════════════════════════════════════════════

const LOADING_QUOTES = [
    { text: "Scanning the web for hidden gems...", emoji: "🔍" },
    { text: "Curating the best resources across the internet...", emoji: "📡" },
    { text: "Finding perspectives you won't discover on your own...", emoji: "🧭" },
    { text: "Your personal librarian is at work...", emoji: "📚" },
    { text: "Building your multi-source knowledge map...", emoji: "🗺️" },
    { text: "Hunting for visual explanations and interactive tools...", emoji: "🎯" },
    { text: "Cross-referencing the best learning paths...", emoji: "🔗" },
    { text: "Assembling resources from top educators worldwide...", emoji: "🌍" },
];

function getRandomQuote() {
    return LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)];
}

// ═══════════════════════════════════════════════════════════════
// LOADING STATE — Beautiful, contextual
// ═══════════════════════════════════════════════════════════════

function ResourceLoader({ nodeTitle }: { nodeTitle: string }) {
    const [quoteIndex, setQuoteIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setQuoteIndex(prev => (prev + 1) % LOADING_QUOTES.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const quote = LOADING_QUOTES[quoteIndex];

    return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
            {/* Animated dots */}
            <div className="flex items-center gap-1.5 mb-6">
                {[0, 1, 2, 3, 4].map(i => (
                    <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-[#6366F1]"
                        animate={{
                            scale: [1, 1.5, 1],
                            opacity: [0.3, 1, 0.3],
                        }}
                        transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            delay: i * 0.15,
                        }}
                    />
                ))}
            </div>

            {/* Rotating quote */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={quoteIndex}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.3 }}
                    className="text-center"
                >
                    <span className="text-2xl mb-2 block">{quote.emoji}</span>
                    <p className="text-sm text-gray-400 max-w-xs">{quote.text}</p>
                </motion.div>
            </AnimatePresence>

            {/* Topic context */}
            <p className="text-xs text-gray-600 mt-4 max-w-sm text-center">
                Finding the best resources for <span className="text-gray-400">&ldquo;{nodeTitle}&rdquo;</span>
            </p>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// VIDEO CARD — with hover insight
// ═══════════════════════════════════════════════════════════════

function VideoCard({ video, index }: { video: VideoResource; index: number }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="group relative block bg-gray-900/70 border border-gray-800 hover:border-red-500/40 rounded-xl overflow-hidden transition-all duration-200"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-gray-800">
                <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
                />
                {/* Duration badge */}
                {video.duration && (
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-[10px] text-white rounded font-mono">
                        {video.duration}
                    </span>
                )}

                {/* Hover Insight Overlay */}
                <AnimatePresence>
                    {isHovered && video.keyInsight && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="absolute inset-0 bg-black/85 flex items-center justify-center p-3"
                        >
                            <div className="text-center">
                                <span className="text-yellow-400 text-xs font-medium block mb-1">💡 Key Insight</span>
                                <p className="text-white text-xs leading-relaxed">{video.keyInsight}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Info */}
            <div className="p-3">
                <h4 className="text-xs font-medium text-white line-clamp-2 group-hover:text-red-300 transition-colors leading-tight">
                    {video.title}
                </h4>
                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500">
                    <span className="truncate">{video.channel}</span>
                    {video.views && <span>· {video.views}</span>}
                </div>
            </div>
        </motion.a>
    );
}

// ═══════════════════════════════════════════════════════════════
// WEB RESOURCE CARD — with hover insight
// ═══════════════════════════════════════════════════════════════

// Color mapping based on resource type
function getTypeColor(type: string): { border: string; text: string; bg: string } {
    const colors: Record<string, { border: string; text: string; bg: string }> = {
        article: { border: "hover:border-blue-500/40", text: "text-blue-400", bg: "bg-blue-500/10" },
        documentation: { border: "hover:border-cyan-500/40", text: "text-cyan-400", bg: "bg-cyan-500/10" },
        interactive_tool: { border: "hover:border-green-500/40", text: "text-green-400", bg: "bg-green-500/10" },
        visualization: { border: "hover:border-purple-500/40", text: "text-purple-400", bg: "bg-purple-500/10" },
        free_course: { border: "hover:border-yellow-500/40", text: "text-yellow-400", bg: "bg-yellow-500/10" },
        free_book: { border: "hover:border-amber-500/40", text: "text-amber-400", bg: "bg-amber-500/10" },
        cheat_sheet: { border: "hover:border-orange-500/40", text: "text-orange-400", bg: "bg-orange-500/10" },
        practice: { border: "hover:border-pink-500/40", text: "text-pink-400", bg: "bg-pink-500/10" },
        video_series: { border: "hover:border-red-500/40", text: "text-red-400", bg: "bg-red-500/10" },
        reference: { border: "hover:border-indigo-500/40", text: "text-indigo-400", bg: "bg-indigo-500/10" },
        blog_post: { border: "hover:border-rose-500/40", text: "text-rose-400", bg: "bg-rose-500/10" },
        tool: { border: "hover:border-emerald-500/40", text: "text-emerald-400", bg: "bg-emerald-500/10" },
    };
    return colors[type] || { border: "hover:border-[#6366F1]/40", text: "text-[#818CF8]", bg: "bg-[#6366F1]/10" };
}

function WebResourceCard({ resource, index }: { resource: WebResource; index: number }) {
    const [isHovered, setIsHovered] = useState(false);
    const colors = getTypeColor(resource.type);

    return (
        <motion.a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.06 }}
            className={`group relative block bg-gray-900/70 border border-gray-800 ${colors.border} rounded-xl p-4 transition-all duration-200`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Type badge */}
            <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm ${colors.bg} w-7 h-7 flex items-center justify-center rounded-lg`}>
                    {resource.emoji}
                </span>
                <span className={`text-[10px] ${colors.text} uppercase tracking-wider font-medium`}>
                    {resource.type.replace(/_/g, " ")}
                </span>
            </div>

            {/* Title */}
            <h4 className="text-sm font-medium text-white group-hover:text-[#818CF8] transition-colors line-clamp-2 mb-1.5 leading-tight">
                {resource.title}
            </h4>

            {/* Source */}
            <p className="text-[10px] text-gray-500 truncate">
                {resource.source}
            </p>

            {/* Hover Insight Tooltip */}
            <AnimatePresence>
                {isHovered && resource.keyInsight && (
                    <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 -bottom-1 translate-y-full z-20 mx-2"
                    >
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-2.5 shadow-xl shadow-black/40">
                            <span className="text-yellow-400 text-[10px] font-medium block mb-0.5">💡 Key Insight</span>
                            <p className="text-gray-300 text-xs leading-relaxed">{resource.keyInsight}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.a>
    );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ResourceHub({ topic, nodeTitle, isVisible }: ResourceHubProps) {
    const [data, setData] = useState<ResourceHubData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Use a ref for the guard — avoids putting it in useCallback deps which causes infinite loops
    const loadedForRef = useRef<string>("");
    const [loadedForDisplay, setLoadedForDisplay] = useState(""); // only for retry button

    const fetchResources = useCallback(async (force = false) => {
        if (!nodeTitle) return;
        if (!force && loadedForRef.current === nodeTitle) return; // already loaded

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/get-resources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, nodeTitle }),
            });

            if (!response.ok) throw new Error("Failed to fetch resources");

            const result = await response.json();
            setData(result);
            loadedForRef.current = nodeTitle;
            setLoadedForDisplay(nodeTitle);
        } catch (err) {
            console.warn("Resource Hub fetch failed:", err);
            setError("Failed to load resources. They'll appear when available.");
        } finally {
            setIsLoading(false);
        }
    // Only recreate when topic/nodeTitle change — NOT when loadedFor changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeTitle, topic]);

    useEffect(() => {
        if (isVisible && nodeTitle) {
            fetchResources();
        }
    // fetchResources is stable per nodeTitle change; don't add loadedForDisplay here
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, nodeTitle, fetchResources]);

    if (!isVisible) return null;

    // ─── Loading State ───
    if (isLoading) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-1 pt-1 pb-2 flex-shrink-0">
                    <span className="text-sm">📚</span>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Resource Hub</span>
                </div>
                <ResourceLoader nodeTitle={nodeTitle} />
            </div>
        );
    }

    // ─── Error State ───
    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center px-4">
                <p className="text-gray-500 text-sm text-center">{error}</p>
                <button
                    onClick={() => { loadedForRef.current = ""; fetchResources(true); }}
                    className="mt-3 text-[#818CF8] text-xs hover:text-[#818CF8] transition-colors cursor-pointer"
                >
                    Try again →
                </button>
            </div>
        );
    }

    // ─── Empty State ───
    if (!data || (data.videos.length === 0 && data.resources.length === 0)) {
        return (
            <div className="h-full flex flex-col items-center justify-center px-4">
                <span className="text-3xl mb-3">🔍</span>
                <p className="text-gray-500 text-sm text-center">No resources found yet</p>
            </div>
        );
    }

    const hasVideos = data.videos.length > 0;
    const hasResources = data.resources.length > 0;

    // ─── Dynamic Grid ───
    return (
        <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            <div className="flex items-center gap-2 px-1 pt-1 pb-3 sticky top-0 bg-gray-900 z-10">
                <span className="text-sm">📚</span>
                <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Resource Hub</span>
                <span className="text-[10px] text-gray-600 ml-auto">
                    {data.videos.length + data.resources.length} resources
                </span>
            </div>

            {/* ═══ VIDEO SECTION ═══ */}
            {hasVideos && (
                <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs">🎥</span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                            Videos • Different perspectives
                        </span>
                    </div>
                    {/* Dynamic: 1 col if sidebar, 2 cols if wider */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                        {data.videos.map((video, i) => (
                            <VideoCard key={video.url} video={video} index={i} />
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ WEB RESOURCES SECTION ═══ */}
            {hasResources && (
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs">🌐</span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                            Web Resources
                        </span>
                    </div>
                    {/* Auto-fit grid: adapts to available space and count */}
                    <div className="grid grid-cols-1 gap-2">
                        {data.resources.map((resource, i) => (
                            <WebResourceCard key={resource.url + i} resource={resource} index={i} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
