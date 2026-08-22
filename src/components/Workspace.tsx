"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import YouTube from "react-youtube";
import { motion, AnimatePresence } from "framer-motion";
import GameArena from "./tools/GameArena";
import AIChat from "./AIChat";

interface Chapter {
    chapterTitle: string;
    youtubeQuery: string;
    quizQuestion?: string;
    toolType?: "mcq" | "cloze" | "analogy";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gamePayload?: any;
}

interface Module {
    moduleTitle: string;
    chapters: Chapter[];
    playlist?: {
        entries?: Array<{
            videoId: string;
            topicMatched: string;
        }>;
    };
}

interface UserContext {
    topic: string;
}

interface PracticeResource {
    type: "visualization" | "interactive" | "article" | "exercise" | "tool";
    title: string;
    url: string;
    why: string;
    effort: "5 min" | "15 min" | "30 min+";
    emoji: string;
}

interface WorkspaceProps {
    module: Module;
    onBack: () => void;
    userContext?: UserContext;
    anchorChannel?: string | null;
    seenVideoIds: string[];
    onVideoSeen: (id: string) => void;
    initialChapIdx?: number;
    initialVideoId?: string;
    // Surgeon integration: allows Surgeon to push updated practiceResources
    externalPracticeResources?: PracticeResource[];
}

// --- Completion Animation ---
const PARTICLE_COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#3B82F6", "#F97316", "#EF4444", "#14B8A6", "#A3E635"];

function CompletionOverlay({ chapterIdx, onDone }: { chapterIdx: number; onDone: () => void }) {
    useEffect(() => {
        // Play a short base64 beep sound
        try {
            const audio = new Audio(
                "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA" +
                "EAAQARgAAABAAIAACAAAAQAAAAAGAAgAEAAAABAAEAAAAEAAAAAAAA" +
                "BAAC//4A/v/9//3//P/8//3//v8AAP//AAABAAEAAQABAAEAAAAAAAAAAAAAAAAAAAAAAAAAAMBAAAAEAAAACAAAABAAAAAgAAAAQAAAAIAAAABAAAAAgAAAAQAAAAMAAAAAAAAA"
            );
            audio.volume = 0.3;
            audio.play().catch(() => { /* silently fail if blocked */ });
        } catch { /* silently fail */ }

        const timer = setTimeout(onDone, 1600);
        return () => clearTimeout(timer);
    }, [onDone]);

    const particles = Array.from({ length: 12 }, (_, i) => ({
        id: i,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        angle: (i / 12) * 360,
        distance: 80 + Math.random() * 60,
        size: 6 + Math.round(Math.random() * 6),
    }));

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
            style={{ background: "rgba(9,9,11,0.85)" }}
        >
            {/* Chapter number zoom */}
            <motion.div
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: [0.3, 1.15, 1], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.4, times: [0, 0.4, 0.7, 1], ease: "easeOut" }}
                className="flex flex-col items-center"
            >
                <span
                    className="font-mono font-black select-none"
                    style={{ fontSize: 96, lineHeight: 1, color: "#6366F1", textShadow: "0 0 60px rgba(99,102,241,0.6)" }}
                >
                    {chapterIdx + 1}
                </span>
                <span
                    className="text-sm font-semibold uppercase tracking-[0.25em] mt-2"
                    style={{ color: "#F4F4F5", opacity: 0.8 }}
                >
                    Chapter Complete
                </span>
            </motion.div>

            {/* Particle burst */}
            {particles.map((p) => {
                const rad = (p.angle * Math.PI) / 180;
                const tx = Math.cos(rad) * p.distance;
                const ty = Math.sin(rad) * p.distance;
                return (
                    <motion.div
                        key={p.id}
                        initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                        animate={{
                            x: tx,
                            y: ty,
                            opacity: [1, 1, 0],
                            scale: [1, 1.2, 0],
                        }}
                        transition={{ duration: 1.2, ease: "easeOut", times: [0, 0.5, 1] }}
                        className="absolute rounded-full"
                        style={{
                            width: p.size,
                            height: p.size,
                            background: p.color,
                            boxShadow: `0 0 8px ${p.color}`,
                        }}
                    />
                );
            })}
        </motion.div>
    );
}


// --- Resource Card ---

function ResourceCard({ resource, index }: { resource: PracticeResource; index: number }) {
    const effortColors: Record<string, string> = {
        "5 min": "#10B981",
        "15 min": "#F59E0B",
        "30 min+": "#EF4444",
    };
    const typeLabels: Record<string, string> = {
        visualization: "Visual",
        interactive: "Interactive",
        article: "Article",
        exercise: "Exercise",
        tool: "Tool",
    };

    // Detect if the validator fell back to a search URL
    const isSearchFallback =
        resource.url.includes("google.com/search") ||
        resource.url.includes("/search?") ||
        resource.url.includes("search_query=") ||
        resource.url.includes("results?search_query");

    // Show a friendly domain label under the title
    let displayDomain = "";
    try {
        const u = new URL(resource.url);
        displayDomain = u.hostname.replace(/^www\./, "");
    } catch { /* ignore */ }

    // Strip the validator note from `why` for clean display
    const cleanWhy = resource.why.replace(" (Opens search — direct page unavailable.)", "");

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.08 }}
            className="rounded-lg p-3 flex flex-col gap-2 group"
            style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
            }}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0">{resource.emoji}</span>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {resource.title}
                        </div>
                        <div className="text-[10px] mt-0.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                            <span>{typeLabels[resource.type] || resource.type}</span>
                            {displayDomain && (
                                <>
                                    <span>·</span>
                                    <span className="truncate">{displayDomain}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 font-semibold"
                    style={{
                        background: `${effortColors[resource.effort]}20`,
                        color: effortColors[resource.effort] || "var(--text-muted)",
                        border: `1px solid ${effortColors[resource.effort]}40`,
                    }}
                >
                    {resource.effort}
                </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)", opacity: 0.8 }}>
                {cleanWhy}
            </p>
            <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs font-medium px-3 py-1.5 rounded self-end flex items-center gap-1 active:scale-[0.97] resource-link-hover ${isSearchFallback ? 'search-fallback' : ''}`}
                style={{
                    background: isSearchFallback ? "rgba(245,158,11,0.08)" : "var(--accent-soft)",
                    color: isSearchFallback ? "#F59E0B" : "var(--accent)",
                    border: `1px solid transparent`,
                }}
                title={isSearchFallback ? "Direct page unavailable — opens search results" : resource.url}
            >
                {isSearchFallback ? "Search" : "Open"} <span>→</span>
            </a>
        </motion.div>
    );
}

// --- Skeleton Card ---
function SkeletonCard() {
    return (
        <div
            className="rounded-lg p-3 animate-pulse"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
            <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded" style={{ background: "var(--border)" }} />
                <div className="h-4 rounded w-2/3" style={{ background: "var(--border)" }} />
            </div>
            <div className="h-3 rounded w-full mb-1" style={{ background: "var(--border)" }} />
            <div className="h-3 rounded w-4/5" style={{ background: "var(--border)" }} />
        </div>
    );
}

export default function Workspace({
    module,
    onBack,
    userContext,
    anchorChannel,
    seenVideoIds,
    onVideoSeen,
    initialChapIdx,
    initialVideoId,
    externalPracticeResources,
}: WorkspaceProps) {
    const [activeChapIdx, setActiveChapIdx] = useState(initialChapIdx || 0);
    const [completedChapIdxs, setCompletedChapIdxs] = useState<number[]>([]);
    const [companionTab, setCompanionTab] = useState<"context" | "chat" | "practice">("context");

    const [showFeynman, setShowFeynman] = useState(false);
    const [showCompletion, setShowCompletion] = useState(false);
    const [completingChapIdx, setCompletingChapIdx] = useState(0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [chapterContent, setChapterContent] = useState<any>(null);
    const [loadingContent, setLoadingContent] = useState(true);

    const [videoId, setVideoId] = useState<string | null>(initialVideoId || null);
    const [loadingVideo, setLoadingVideo] = useState(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [videoOptions, setVideoOptions] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [videoMeta, setVideoMeta] = useState<any>(null);

    // M4.2 Real-time 👎 swap state
    const [swapLoading, setSwapLoading] = useState(false);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [showReasonPicker, setShowReasonPicker] = useState(false);
    const [customReason, setCustomReason] = useState("");

    // Practice resources — can be overridden by Surgeon
    const [overridePracticeResources, setOverridePracticeResources] = useState<PracticeResource[] | null>(null);

    const activeChapter = module.chapters[activeChapIdx];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    const lastFetchedQueryRef = useRef<string>("");
    // Monotonic epoch shared by the chapter-fetch effect and the dislike-swap
    // path so stale responses can never overwrite newer state.
    const fetchEpochRef = useRef(0);
    const topic = userContext?.topic || "Learning Path";

    const activeYoutubeQuery = activeChapter?.youtubeQuery || "";
    const activeChapterTitle = activeChapter?.chapterTitle || "";
    const moduleTitle = module.moduleTitle;

    // When externalPracticeResources prop changes, apply it
    useEffect(() => {
        if (externalPracticeResources) {
            setOverridePracticeResources(externalPracticeResources);
        }
    }, [externalPracticeResources]);

    // Reset chapter-specific override when chapter changes
    useEffect(() => {
        setOverridePracticeResources(null);
    }, [activeChapIdx]);

    // Shared get-video param construction (chapter fetch + dislike swap) so
    // both paths stay consistent: same scoping params, seen-guard, and
    // rejection reason handling.
    const buildGetVideoParams = useCallback(
        (opts: { excludeIds: string[]; rejectReason?: string; fast?: boolean }) => {
            const params = new URLSearchParams({
                q: activeYoutubeQuery,
                // Rejection reason is sent as its own param (M4.2) — never
                // appended to q, which would change search semantics/cacheKey.
                excludeIds: Array.from(new Set(opts.excludeIds)).join(","),
            });

            if (activeChapterTitle) {
                params.append("chapterTitle", activeChapterTitle);
                const siblings = module.chapters
                    .filter((_, i) => i !== activeChapIdx)
                    .map((c) => c.chapterTitle)
                    .filter(Boolean);
                if (siblings.length > 0) {
                    params.append("siblingTitles", siblings.join(","));
                }
            }

            let playlistRefId = "";
            const normalizedQuery = activeYoutubeQuery.trim().toLowerCase();
            const playlistMatch = module.playlist?.entries?.find((entry) =>
                (entry.topicMatched || "").trim().toLowerCase() === normalizedQuery
            );
            if (playlistMatch?.videoId) playlistRefId = playlistMatch.videoId;
            if (playlistRefId) params.append("playlistRef", playlistRefId);
            if (anchorChannel) params.append("preferredChannel", anchorChannel);
            if (opts.rejectReason) params.append("rejectReason", opts.rejectReason);
            if (opts.fast) params.append("fast", "1");

            return params;
        },
        [activeYoutubeQuery, activeChapterTitle, activeChapIdx, module.chapters, module.playlist, anchorChannel]
    );

    useEffect(() => {
        const fetchVideo = async () => {
            const fetchKey = `${activeChapterTitle}|${activeYoutubeQuery}|${anchorChannel || "none"}`;
            if (lastFetchedQueryRef.current === fetchKey) {
                return;
            }
            lastFetchedQueryRef.current = fetchKey;

            const epoch = ++fetchEpochRef.current;
            // Bail helper: stale responses must never overwrite newer state.
            const isStale = () => fetchEpochRef.current !== epoch;

            setLoadingVideo(true);
            setVideoId(null);
            setVideoMeta(null);
            try {
                const params = buildGetVideoParams({ excludeIds: seenVideoIds });

                const res = await fetch(`/api/get-video?${params.toString()}`);
                if (isStale()) return;
                const data = await res.json();
                if (isStale()) return;

                if (data.videos && data.videos.length > 0) {
                    setVideoOptions(data.videos);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const pick = data.videos.find((v: any) => v.isPick) || data.videos[0];
                    setVideoId(pick.videoId);
                    if (!seenVideoIds.includes(pick.videoId)) onVideoSeen(pick.videoId);
                } else if (data.videoId) {
                    setVideoOptions([{ videoId: data.videoId, title: data.title || "", channel: "", duration: "", reason: "", isPick: true }]);
                    setVideoId(data.videoId);
                    if (!seenVideoIds.includes(data.videoId)) onVideoSeen(data.videoId);
                }

                if (typeof window !== "undefined" && data.source && !isStale()) {
                    localStorage.setItem("lastVideoSource", data.source);
                }

                if (isStale()) return;
                if (data.densityScore !== undefined) {
                    setVideoMeta({ densityScore: data.densityScore, densityFlags: data.densityFlags, source: data.source });
                } else if (data.source) {
                    setVideoMeta({ source: data.source });
                }
            } catch (_err) {
                console.error("Failed to find video");
                if (!isStale()) setVideoId("jfKfPfyJRdk");
            } finally {
                if (!isStale()) setLoadingVideo(false);
            }
        };
        fetchVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChapterTitle, activeYoutubeQuery, anchorChannel, buildGetVideoParams]);

    useEffect(() => {
        const fetchContent = async () => {
            setLoadingContent(true);
            try {
                const res = await fetch("/api/generate-chapter-content", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        topic: activeChapterTitle,
                        context: moduleTitle,
                    }),
                });
                const data = await res.json();
                setChapterContent(data);
            } catch (_e) {
                console.error("Content Gen Failed");
            } finally {
                setLoadingContent(false);
            }
        };
        fetchContent();
    }, [activeChapterTitle, moduleTitle]);

    // Quick practice suggestion derived entirely from existing chapterContent (no extra API call)
    const quickPracticeIdea = (() => {
        if (!chapterContent?.keyPoints?.length) return null;
        const term = chapterContent.keyPoints[0]?.term;
        if (!term) return null;
        const actions = [
            `implement a small example using ${term}`,
            `draw a diagram explaining ${term} to a friend`,
            `find one real-world use case of ${term} online`,
            `write a 3-sentence explanation of ${term} in your own words`,
        ];
        // Use first keypoint's index to pick a stable action
        const action = actions[0];
        return `Apply ${term} by ${action}.`;
    })();

    // Effective practice resources: override (from Surgeon) or from chapterContent
    const effectivePracticeResources: PracticeResource[] =
        overridePracticeResources ??
        (chapterContent?.practiceResources ?? []);

    const playerOpts = {
        height: "100%",
        width: "100%",
        playerVars: { autoplay: 1, controls: 1, rel: 0 },
    };

    // --- M4.2 Feedback helpers ---
    const REJECT_REASONS = ["too basic", "too advanced", "wrong duration", "off-topic"];

    const getAnonId = (): string => {
        if (typeof window === "undefined") return "anonymous";
        let id = localStorage.getItem("dojo_anon_id");
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem("dojo_anon_id", id);
        }
        return id;
    };

    const handleLike = async () => {
        if (!videoId) return;
        setFeedbackError(null);
        try {
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: getAnonId(),
                    videoId,
                    chapterKey: activeChapterTitle,
                    signal: "like",
                }),
            });
            const data = await res.json();
            if (!res.ok || data.status !== "ok") {
                throw new Error(data.error || "Feedback request failed");
            }
        } catch (e) {
            setFeedbackError(`Could not record 👍: ${e instanceof Error ? e.message : "unknown error"}`);
        }
    };

    const handleDislike = async (reason: string) => {
        const rejectedVideoId = videoId;
        if (!rejectedVideoId || swapLoading) return;
        const epoch = ++fetchEpochRef.current;
        const isStale = () => fetchEpochRef.current !== epoch;
        setSwapLoading(true);
        setFeedbackError(null);
        setShowReasonPicker(false);
        try {
            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: getAnonId(),
                    videoId: rejectedVideoId,
                    chapterKey: activeChapterTitle,
                    signal: "dislike",
                    value: reason,
                }),
            });
            const fbData = await res.json();
            if (!res.ok || fbData.status !== "ok") {
                throw new Error(fbData.error || "Failed to record dislike");
            }

            // Re-fetch excluding the rejected video; the reason rides along as
            // rejectReason (server folds it into search queries only).
            const params = buildGetVideoParams({
                excludeIds: [...seenVideoIds, rejectedVideoId],
                rejectReason: reason,
                // Post-dislike swap uses the server fast-path (primary tier
                // only, no sentinel, capped judge) to hit the <8s contract.
                fast: true,
            });

            const vres = await fetch(`/api/get-video?${params.toString()}`);
            if (isStale()) return;
            const data = await vres.json();
            if (isStale()) return;

            if (data.videos && data.videos.length > 0) {
                const pick = data.videos.find((v: { isPick: boolean }) => v.isPick) || data.videos[0];
                setVideoOptions(data.videos);
                setVideoId(pick.videoId);
                onVideoSeen(pick.videoId);
            } else {
                setFeedbackError("No better match found — keeping current video.");
            }
        } catch (e) {
            if (!isStale()) {
                setFeedbackError(`Swap failed (${e instanceof Error ? e.message : "unknown error"}) — keeping current video.`);
            }
        } finally {
            if (!isStale()) {
                setSwapLoading(false);
                setCustomReason("");
            }
        }
    };

    const handleVideoEnd = () => {
        const prescribed = videoOptions.find((v: { isPick: boolean }) => v.isPick)?.videoId || videoOptions[0]?.videoId;
        const actual = videoId;
        const fingerprint = {
            chapterId: activeChapter.chapterTitle,
            prescribedVideoId: prescribed,
            actualVideoId: actual,
            match: prescribed === actual,
        };
        const prevData = JSON.parse(localStorage.getItem("LearningFingerprint") || "[]");
        localStorage.setItem("LearningFingerprint", JSON.stringify([...prevData, fingerprint]));

        if (!completedChapIdxs.includes(activeChapIdx)) {
            setShowFeynman(true);
        }
    };

    const handleChapterComplete = useCallback(() => {
        if (!completedChapIdxs.includes(activeChapIdx)) {
            setCompletedChapIdxs(prev => [...prev, activeChapIdx]);
        }
        setShowFeynman(false);

        // Trigger completion animation
        setCompletingChapIdx(activeChapIdx);
        setShowCompletion(true);
    }, [activeChapIdx, completedChapIdxs]);

    const handleCompletionDone = useCallback(() => {
        setShowCompletion(false);
        setTimeout(() => {
            if (activeChapIdx < module.chapters.length - 1) {
                setActiveChapIdx(prev => prev + 1);
            }
        }, 100);
    }, [activeChapIdx, module.chapters.length]);

    // Surgeon: handle CUSTOMIZE_RESOURCES by re-fetching with emphasis flag
    const handleSurgeonCustomizeResources = useCallback(async () => {
        setCompanionTab("practice");
        setOverridePracticeResources(null); // triggers skeleton via null + loadingContent-like state

        try {
            const res = await fetch("/api/generate-chapter-content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: activeChapterTitle,
                    context: moduleTitle,
                    emphasizeExercises: true,
                }),
            });
            const data = await res.json();
            if (Array.isArray(data.practiceResources)) {
                setOverridePracticeResources(data.practiceResources);
            }
        } catch (e) {
            console.error("Failed to customize resources", e);
        }
    }, [activeChapterTitle, moduleTitle]);

    // Expose surgeon handler on window for SurgeonPanel to call
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__workspaceSurgeonHandlers = {
            CUSTOMIZE_RESOURCES: handleSurgeonCustomizeResources,
        };
        return () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (window as any).__workspaceSurgeonHandlers;
        };
    }, [handleSurgeonCustomizeResources]);

    const tabs: { id: "context" | "chat" | "practice"; label: string }[] = [
        { id: "context", label: "📚 Context" },
        { id: "chat", label: "🤖 AI Chat" },
        { id: "practice", label: "🎯 Practice" },
    ];

    return (
        <div
            className="w-full h-screen flex flex-col pt-4 px-4 md:px-6 overflow-hidden relative"
            style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
        >
            {/* HEADER */}
            <div
                className="flex items-center justify-between mb-3 pb-3 mt-6 lg:mt-12"
                style={{ borderBottom: "1px solid var(--border)" }}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-sm shrink-0 active:scale-[0.97] hover-text-primary"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        <span>← Back</span>
                    </button>
                    <div className="h-5 w-px" style={{ background: "var(--border)" }} />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="text-base font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                {activeChapter.chapterTitle}
                            </h1>
                            {videoMeta?.source && ["anchor_channel", "anchor_preference"].includes(videoMeta.source) && (
                                <span title={`Video from ${anchorChannel}`} className="ml-2 inline-flex items-center justify-center bg-[var(--accent-soft)] rounded-full px-2 py-0.5 text-xs text-[var(--accent)] cursor-help">
                                    ⚓
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                            {module.moduleTitle}
                        </span>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Progress</div>
                    <div className="font-mono text-sm font-semibold" style={{ color: "var(--accent)" }}>
                        {completedChapIdxs.length}/{module.chapters.length}
                    </div>
                </div>
            </div>

            {/* SPLIT LAYOUT */}
            <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden pb-4">

                {/* LEFT: Companion Panel */}
                <div
                    className="hidden lg:flex flex-[3.5] rounded-lg flex-col overflow-hidden"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                >
                    {/* Tab Bar */}
                    <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setCompanionTab(tab.id)}
                                className="flex-1 px-3 py-2.5 text-xs font-medium whitespace-nowrap"
                                style={{
                                    color: companionTab === tab.id ? "var(--accent)" : "var(--text-muted)",
                                    borderBottom: companionTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                                    background: companionTab === tab.id ? "var(--bg-primary)" : "transparent",
                                    transition: "color 150ms ease",
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-hidden">
                        {/* --- CONTEXT TAB --- */}
                        {companionTab === "context" && (
                            <div className="p-5 overflow-y-auto h-full custom-scrollbar">
                                {loadingContent ? (
                                    <div className="space-y-4 animate-pulse mt-8">
                                        <div className="h-4 rounded w-1/3 mb-6" style={{ background: "var(--border)" }} />
                                        <div className="h-28 rounded-md w-full" style={{ background: "var(--accent-soft)" }} />
                                        <div className="h-4 rounded w-2/3" style={{ background: "var(--border)" }} />
                                    </div>
                                ) : chapterContent ? (
                                    <div className="space-y-6 slide-up">
                                        <div>
                                            <h3 className="font-semibold text-xs uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>
                                                Briefing
                                            </h3>
                                            <p
                                                className="text-sm leading-relaxed pl-4"
                                                style={{ color: "var(--text-primary)", opacity: 0.8, borderLeft: "2px solid var(--accent)" }}
                                            >
                                                {chapterContent.summary}
                                            </p>
                                        </div>

                                        <div
                                            className="p-4 rounded-lg"
                                            style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }}
                                        >
                                            <span className="font-semibold text-xs uppercase" style={{ color: "var(--accent)" }}>Mental Model</span>
                                            <p className="text-sm mt-1 italic" style={{ color: "var(--text-primary)", opacity: 0.7 }}>
                                                &quot;{chapterContent.analogy}&quot;
                                            </p>
                                        </div>

                                        {chapterContent.codeSnippet && (
                                            <div>
                                                <h3 className="font-semibold text-xs uppercase tracking-wider mb-2" style={{ color: "var(--accent-hover)" }}>
                                                    Syntax
                                                </h3>
                                                <div
                                                    className="p-4 rounded-md font-mono text-xs overflow-x-auto"
                                                    style={{
                                                        background: "var(--bg-primary)",
                                                        border: "1px solid var(--border)",
                                                        color: "var(--text-primary)",
                                                        opacity: 0.7,
                                                    }}
                                                >
                                                    <pre>{chapterContent.codeSnippet}</pre>
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            <h3 className="font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
                                                Key Terminology
                                            </h3>
                                            <ul className="space-y-2.5">
                                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                {(chapterContent.keyPoints || []).map((p: any, i: number) => (
                                                    <li key={i} className="text-sm" style={{ color: "var(--text-secondary)" }}>
                                                        <span className="font-semibold" style={{ color: "var(--accent)" }}>{p.term}:</span>{" "}
                                                        <span style={{ color: "var(--text-primary)", opacity: 0.7 }}>{p.def}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div
                                            className="p-3 rounded-md"
                                            style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.10)" }}
                                        >
                                            <h3 className="text-red-400 font-semibold text-xs uppercase mb-1">Common Pitfall</h3>
                                            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{chapterContent.commonPitfalls}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center mt-20 text-sm" style={{ color: "var(--text-muted)" }}>
                                        Initializing...
                                    </div>
                                )}
                            </div>
                        )}

                        {/* --- AI CHAT TAB --- */}
                        {companionTab === "chat" && (
                            <AIChat
                                videoId={videoId || ""}
                                chapterTitle={activeChapter.chapterTitle}
                                moduleTitle={module.moduleTitle}
                                courseTitle={topic}
                                getCurrentTime={() => playerRef.current?.getCurrentTime?.() || 0}
                            />
                        )}

                        {/* --- PRACTICE TAB --- */}
                        {companionTab === "practice" && (
                            <div className="p-4 overflow-y-auto h-full custom-scrollbar">
                                {loadingContent ? (
                                    <div className="space-y-3 mt-2">
                                        <SkeletonCard />
                                        <SkeletonCard />
                                    </div>
                                ) : (
                                    <div className="space-y-4 slide-up">
                                        {/* Section 1: What to do next */}
                                        {chapterContent?.handsonNext && (
                                            <div
                                                className="p-3 rounded-lg flex gap-3 items-start"
                                                style={{
                                                    background: "rgba(99,102,241,0.06)",
                                                    border: "1px solid rgba(99,102,241,0.18)",
                                                }}
                                            >
                                                <span className="text-lg shrink-0 mt-0.5">→</span>
                                                <div>
                                                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--accent)" }}>
                                                        What to Do Next
                                                    </div>
                                                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)", opacity: 0.85 }}>
                                                        {chapterContent.handsonNext}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Section 2: Resources */}
                                        <div>
                                            <h3 className="font-semibold text-xs uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>
                                                Resources &amp; Exercises
                                            </h3>
                                            {overridePracticeResources === null && loadingContent ? (
                                                <div className="space-y-2">
                                                    <SkeletonCard />
                                                    <SkeletonCard />
                                                </div>
                                            ) : effectivePracticeResources.length === 0 ? (
                                                <div
                                                    className="rounded-lg p-4 text-center text-sm"
                                                    style={{
                                                        background: "var(--bg-primary)",
                                                        border: "1px solid var(--border)",
                                                        color: "var(--text-muted)",
                                                    }}
                                                >
                                                    No specific exercises for this topic.
                                                    <br />
                                                    <span className="opacity-70">Try exploring concepts through the AI Chat →</span>
                                                </div>
                                            ) : (
                                                <div className="space-y-2.5">
                                                    {effectivePracticeResources.map((r, i) => (
                                                        <ResourceCard key={`${r.url}-${i}`} resource={r} index={i} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Section 3: Quick Practice Idea (client-side, no API) */}
                                        {quickPracticeIdea && (
                                            <div
                                                className="rounded-lg p-3"
                                                style={{
                                                    background: "rgba(16,185,129,0.05)",
                                                    border: "1px solid rgba(16,185,129,0.15)",
                                                }}
                                            >
                                                <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#10B981" }}>
                                                    ⚡ Try This Right Now
                                                </div>
                                                <p className="text-sm" style={{ color: "var(--text-primary)", opacity: 0.8 }}>
                                                    {quickPracticeIdea}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: Video & Controls */}
                <div className="flex-[6.5] flex flex-col gap-3">
                    <div
                        className="flex-1 rounded-lg overflow-hidden relative"
                        style={{ background: "#000", border: "1px solid var(--border)" }}
                    >
                        {loadingVideo && (
                            <div
                                className="absolute inset-0 flex items-center justify-center z-10"
                                style={{ background: "var(--bg-primary)" }}
                            >
                                <div className="animate-pulse font-mono text-sm" style={{ color: "var(--accent)" }}>
                                    SEARCHING...
                                </div>
                            </div>
                        )}
                        {!loadingVideo && videoId && (
                            <YouTube
                                videoId={videoId}
                                opts={playerOpts}
                                onEnd={handleVideoEnd}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onReady={(e: any) => { playerRef.current = e.target; }}
                                className="absolute inset-0"
                                iframeClassName="w-full h-full"
                            />
                        )}
                    </div>

                    {/* M4.2 Feedback controls */}
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <div
                            className="flex items-center gap-1 rounded-lg px-1.5 py-1"
                            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                        >
                            <button
                                onClick={handleLike}
                                disabled={swapLoading || !videoId}
                                title="Good match"
                                className="text-sm px-2 py-0.5 rounded active:scale-[0.97] hover-text-primary disabled:opacity-50"
                                style={{ color: "var(--text-secondary)" }}
                            >
                                👍
                            </button>
                            <button
                                onClick={() => setShowReasonPicker((v) => !v)}
                                disabled={swapLoading || !videoId}
                                title="Not a good match — swap for another video"
                                className="text-sm px-2 py-0.5 rounded active:scale-[0.97] hover-text-primary disabled:opacity-50 font-mono text-xs"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {swapLoading ? "SWAPPING…" : "👎"}
                            </button>
                        </div>

                        {showReasonPicker && (
                            <div
                                className="flex items-center gap-1.5 flex-wrap rounded-lg px-2 py-1.5"
                                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", opacity: swapLoading ? 0.5 : 1 }}
                            >
                                <span className="text-[10px] uppercase tracking-wide mr-1" style={{ color: "var(--text-muted)" }}>
                                    Why?
                                </span>
                                {REJECT_REASONS.map((reason) => (
                                    <button
                                        key={reason}
                                        onClick={() => handleDislike(reason)}
                                        disabled={swapLoading}
                                        className="text-[11px] px-2 py-0.5 rounded-full active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
                                        style={{
                                            background: "var(--accent-soft)",
                                            color: "var(--accent)",
                                            border: "1px solid transparent",
                                        }}
                                    >
                                        {reason}
                                    </button>
                                ))}
                                <input
                                    type="text"
                                    value={customReason}
                                    onChange={(e) => setCustomReason(e.target.value)}
                                    disabled={swapLoading}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && customReason.trim() && !swapLoading) handleDislike(customReason.trim());
                                    }}
                                    placeholder="other…"
                                    className="text-[11px] px-2 py-0.5 rounded outline-none w-24 disabled:opacity-50"
                                    style={{
                                        background: "var(--bg-primary)",
                                        border: "1px solid var(--border)",
                                        color: "var(--text-primary)",
                                    }}
                                />
                                {customReason.trim() && (
                                    <button
                                        onClick={() => handleDislike(customReason.trim())}
                                        disabled={swapLoading}
                                        className="text-[11px] px-2 py-0.5 rounded-full active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
                                        style={{
                                            background: "rgba(239,68,68,0.10)",
                                            color: "#EF4444",
                                            border: "1px solid rgba(239,68,68,0.25)",
                                        }}
                                    >
                                        Swap →
                                    </button>
                                )}
                            </div>
                        )}

                        {feedbackError && (
                            <span className="text-[11px]" style={{ color: "#EF4444" }}>
                                ⚠ {feedbackError}
                            </span>
                        )}
                    </div>

                    {/* Video selector strip */}
                    {videoOptions.length > 1 && (
                        <div className="flex gap-3 overflow-x-auto shrink-0 custom-scrollbar">
                            {videoOptions.map((opt: { videoId: string; title: string; channel: string; duration: string; reason: string; isPick: boolean }) => (
                                <div
                                    key={opt.videoId}
                                    onClick={() => setVideoId(opt.videoId)}
                                    className={`flex-1 min-w-[200px] cursor-pointer rounded-lg p-2 ${videoId !== opt.videoId ? 'video-card-hover' : ''}`}
                                    style={{
                                        background: "var(--bg-card)",
                                        border: `1px solid ${videoId === opt.videoId ? "var(--accent)" : "var(--border)"}`,
                                    }}
                                >
                                    <div className="flex gap-2.5">
                                        <div className="w-24 h-14 shrink-0 relative rounded-sm overflow-hidden bg-black">
                                            <img src={`https://i.ytimg.com/vi/${opt.videoId}/mqdefault.jpg`} alt={opt.title} className="w-full h-full object-cover" />
                                            <div className="absolute bottom-0.5 right-0.5 bg-black/80 font-mono text-[9px] px-1 rounded text-white">{opt.duration}</div>
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-0 justify-center">
                                            <div className="text-[11px] font-semibold truncate leading-tight" style={{ color: "var(--text-primary)" }}>{opt.title}</div>
                                            <div className="text-[9px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{opt.channel}</div>
                                            <div className="text-[9px] mt-0.5 line-clamp-1" style={{ color: "var(--text-muted)" }}>{opt.reason}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Chapter dots */}
                    <div
                        className="h-10 rounded-lg flex items-center justify-center px-4 shrink-0"
                        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                    >
                        <div className="flex items-center gap-2 overflow-x-auto max-w-full custom-scrollbar">
                            {module.chapters.map((_chap, i) => (
                                <div
                                    key={i}
                                    onClick={() => setActiveChapIdx(i)}
                                    className="h-2 w-6 rounded-full cursor-pointer"
                                    style={{
                                        background: i === activeChapIdx
                                            ? "var(--accent)"
                                            : completedChapIdxs.includes(i)
                                                ? "var(--text-muted)"
                                                : "var(--border)",
                                        transition: "none",
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Feynman Checkpoint */}
            <AnimatePresence>
                {showFeynman && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: "rgba(10,10,10,0.95)" }}
                    >
                        <div
                            className="p-6 rounded-lg max-w-2xl w-full relative slide-up"
                            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                        >
                            <div className="flex justify-between items-center mb-5">
                                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                                    Checkpoint Reached
                                </h2>
                                <button
                                    onClick={() => setShowFeynman(false)}
                                    className="text-lg active:scale-[0.97] hover-text-primary"
                                    style={{ color: "var(--text-muted)" }}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="max-h-[70vh] overflow-y-auto">
                                <GameArena
                                    toolType={activeChapter.toolType || "mcq"}
                                    gamePayload={activeChapter.gamePayload || {}}
                                    onComplete={handleChapterComplete}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chapter Completion Animation */}
            <AnimatePresence>
                {showCompletion && (
                    <CompletionOverlay
                        chapterIdx={completingChapIdx}
                        onDone={handleCompletionDone}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
