"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Workspace from "@/components/Workspace";
import ConversationalPanel from "@/components/ConversationalPanel";
import SurgeonPanel from "@/components/SurgeonPanel";
import BreakTimer from "@/components/BreakTimer";
import BreakPopup from "@/components/BreakPopup";
import { getContext } from "@/utils/learningContext";
// Type-only import: vanishes at build time, no client bundle impact.
import type { VideoSpec } from "@/utils/videoSpec";

interface Chapter {
  chapterTitle: string;
  youtubeQuery: string;
  // Emitted by generate-roadmap (normalized onto every chapter). Forwarded
  // to get-video as spec=<JSON> so the judge has a duration window.
  videoSpec?: VideoSpec;
}

interface Module {
  moduleTitle: string;
  atomicTruth: string;
  narrativeBridge: string;
  estimatedDuration: string;
  chapters?: Chapter[];
  playlist?: PlaylistResult;
}

interface PlaylistResult {
  entries: Array<{
    videoId: string;
    topicMatched: string;
  }>;
}

interface Course {
  courseTitle: string;
  anchorChannel: string;
  modules: Module[];
  playlist?: PlaylistResult;
}

interface DojoViewProps {
  initialTopic?: string;
  nexusTrail?: string;
  nexusOrigin?: string;
  onCompletedModulesChange?: (titles: string[]) => void;
  isPreview?: boolean;
}

export default function DojoView({
  initialTopic,
  nexusTrail,
  nexusOrigin,
  onCompletedModulesChange,
  isPreview = false,
}: DojoViewProps) {
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState("");
  const [activeModule, setActiveModule] = useState<Module | null>(null);
  const [loadingModuleIdx, setLoadingModuleIdx] = useState<number | null>(null);

  const [expandedModuleIdx, setExpandedModuleIdx] = useState<number | null>(null);
  const [expandedChapterIdx, setExpandedChapterIdx] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [chapterVideos, setChapterVideos] = useState<any[]>([]);
  const [loadingChapterVideos, setLoadingChapterVideos] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const learningContext = getContext();

  const topic = initialTopic ?? searchParams.get("topic");
  const resolvedNexusTrail = nexusTrail ?? searchParams.get("nexusTrail") ?? "";
  const resolvedNexusOrigin = nexusOrigin ?? searchParams.get("nexusOrigin") ?? "";

  const [seenVideoIds, setSeenVideoIds] = useState<string[]>([]);
  const [breakActive, setBreakActive] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [breakPrefs, setBreakPrefs] = useState<any>(null);
  const [showBreakBanner, setShowBreakBanner] = useState(false);
  const [showBreakSetupModal, setShowBreakSetupModal] = useState(false);
  // Break setup modal state
  const [setupStep, setSetupStep] = useState(0);
  const [setupFocus, setSetupFocus] = useState(25);
  const [setupBreak, setSetupBreak] = useState(5);
  const [setupGenres, setSetupGenres] = useState<string[]>([]);

  // Load break preferences from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("breakPrefs");
      if (stored) {
        setBreakPrefs(JSON.parse(stored));
      } else {
        // Show banner if no break prefs set and course is loaded
        setShowBreakBanner(true);
      }
    } catch {
      setShowBreakBanner(true);
    }
  }, []);

  useEffect(() => {
    if (course && onCompletedModulesChange) {
      const unlocked = course.modules
        .filter(m => m.chapters && m.chapters.length > 0)
        .map(m => m.moduleTitle);
      onCompletedModulesChange(unlocked);
    }
  }, [course, onCompletedModulesChange]);

  const handleVideoSeen = (videoId: string) => {
    setSeenVideoIds(prev => {
      if (prev.includes(videoId)) return prev;
      return [...prev, videoId];
    });
  };

  useEffect(() => {
    const init = async () => {
      const savedCourse = localStorage.getItem("generatedCourse");
      if (savedCourse) {
        const parsed = JSON.parse(savedCourse);
        const fromSyllabus =
          new URLSearchParams(window.location.search).get("fromSyllabus") === "true";

        if (fromSyllabus) {
          setCourse(parsed);
          return;
        }

        const storedTitle = (parsed.courseTitle || "").toLowerCase();
        const currentTopic = (topic || "").toLowerCase();
        const topicWords = currentTopic.split(" ").filter(w => w.length > 3);
        const matches = topicWords.length > 0 && topicWords.every(w => storedTitle.includes(w));

        if (matches) {
          setCourse(parsed);
          return;
        }

        localStorage.removeItem("generatedCourse");
      }

      if (topic) {
        try {
          const res = await fetch("/api/generate-roadmap", {
            method: "POST",
            body: JSON.stringify({
              userGoal: topic,
              goal: learningContext?.goal,
              domainType: learningContext?.domainType,
              priorKnowledge: learningContext?.priorKnowledge,
              timeContext: learningContext?.timeContext,
              successDefinition: learningContext?.successDefinition,
              mode: "skeleton",
              nexusTrail: resolvedNexusTrail,
              nexusOrigin: resolvedNexusOrigin,
            }),
          });

          if (!res.ok) throw new Error("Architecture Design Failed");

          const data = await res.json();
          setCourse(data);
          localStorage.setItem("generatedCourse", JSON.stringify(data));
        } catch (e) {
          console.error(e);
          setError("Failed to design the course architecture.");
        }
      } else {
        router.push("/dashboard");
      }
    };

    const timer = setTimeout(init, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, resolvedNexusTrail, resolvedNexusOrigin, router, learningContext?.goal, learningContext?.domainType, learningContext?.priorKnowledge, learningContext?.timeContext, learningContext?.successDefinition]);

  const handleModuleClick = async (mod: Module, index: number) => {
    if (expandedModuleIdx === index) {
      setExpandedModuleIdx(null);
      setExpandedChapterIdx(null);
      setChapterVideos([]);
      return;
    }

    if (mod.chapters && mod.chapters.length > 0) {
      setExpandedModuleIdx(index);
      setExpandedChapterIdx(null);
      setChapterVideos([]);
      return;
    }

    setLoadingModuleIdx(index);
    try {
      const previousModule = index > 0 && course ? course.modules[index - 1] : null;

      const res = await fetch("/api/generate-roadmap", {
        method: "POST",
        body: JSON.stringify({
          userGoal: topic,
          goal: learningContext?.goal,
          domainType: learningContext?.domainType,
          priorKnowledge: learningContext?.priorKnowledge,
          mode: "module_details",
          moduleContext: {
            moduleTitle: mod.moduleTitle,
            previousModuleTitle: previousModule?.moduleTitle,
          },
        }),
      });

      if (!res.ok) throw new Error("Module Expansion Failed");
      const details = await res.json();

      if (course) {
        const updatedModules = [...course.modules];
        updatedModules[index] = { ...mod, ...details };
        const updatedCourse = { ...course, modules: updatedModules };

        setCourse(updatedCourse);
        localStorage.setItem("generatedCourse", JSON.stringify(updatedCourse));
        setExpandedModuleIdx(index);
        setExpandedChapterIdx(null);
        setChapterVideos([]);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to unlock module. Please try again.");
    } finally {
      setLoadingModuleIdx(null);
    }
  };

  const handleChapterRowClick = async (e: React.MouseEvent, mod: Module, chapIdx: number) => {
    e.stopPropagation();
    if (expandedChapterIdx === chapIdx) {
      setExpandedChapterIdx(null);
      setChapterVideos([]);
      return;
    }
    setExpandedChapterIdx(chapIdx);
    setLoadingChapterVideos(true);
    setChapterVideos([]);

    try {
      const chapter = mod.chapters![chapIdx];
      let playlistRefId = "";
      const normalizedQuery = (chapter.youtubeQuery || "").trim().toLowerCase();
      const playlistMatch = course?.playlist?.entries?.find((entry) =>
        (entry.topicMatched || "").trim().toLowerCase() === normalizedQuery
      );
      if (playlistMatch?.videoId) playlistRefId = playlistMatch.videoId;

      const params = new URLSearchParams({ q: chapter.youtubeQuery, excludeIds: seenVideoIds.join(",") });
      // Chapter scoping lets the server merge stored rejections and feed the
      // M3 judge's scope-fit signal.
      params.append("chapterTitle", chapter.chapterTitle);
      const siblingTitles = (mod.chapters || [])
        .filter((_, i) => i !== chapIdx)
        .map((c) => c.chapterTitle)
        .filter(Boolean);
      if (siblingTitles.length > 0) params.append("siblingTitles", siblingTitles.join(","));
      if (course?.anchorChannel) params.append("preferredChannel", course.anchorChannel);
      if (playlistRefId) params.append("playlistRef", playlistRefId);
      // M1 open-loop fix: forward the chapter's videoSpec (JSON-encoded;
      // URLSearchParams URL-encodes it; route JSON.parses the spec param).
      if (chapter.videoSpec) {
        params.append("spec", JSON.stringify(chapter.videoSpec));
      }

      const res = await fetch(`/api/get-video?${params.toString()}`);
      const data = await res.json();
      console.log(
        `🎯 get-video roadmap [${(chapter.chapterTitle || "").slice(0, 40)}] specSent=${Boolean(chapter.videoSpec)} specIgnored=${data.specIgnored ?? false}`,
        data.debug ? data.debug : ""
      );

      if (data.videos) {
        setChapterVideos(data.videos);
      } else if (data.videoId) {
        setChapterVideos([{ videoId: data.videoId, title: data.title || "", channel: "", duration: "", reason: "", isPick: true }]);
      }
    } catch (err) {
      console.error("Chapter video fetch failed:", err);
    } finally {
      setLoadingChapterVideos(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMutation = (actionObj: any) => {
    if (!course) return;
    const { type, payload, requiresVideoRefetch } = actionObj;
    console.log(`🧬 handleMutation called: type=${type}`, payload);

    let updatedCourse = { ...course };

    if (type === "CHANGE_ANCHOR" && payload?.newAnchorChannel) {
      updatedCourse.anchorChannel = payload.newAnchorChannel;
    } else if (type === "REMOVE_ANCHOR") {
      updatedCourse.anchorChannel = "";
    } else if ((type === "ADD_MODULE" || type === "INSERT_MODULE") && (payload?.moduleData || payload?.module)) {
      const modObj = payload.moduleData || payload.module;
      const idx = typeof payload.moduleIndex === 'number' ? payload.moduleIndex : typeof payload.at === 'number' ? payload.at : updatedCourse.modules.length;
      const newModules = [...updatedCourse.modules];
      newModules.splice(idx, 0, modObj);
      updatedCourse.modules = newModules;
    } else if (type === "DELETE_MODULE" && typeof payload?.moduleIndex === "number") {
      updatedCourse.modules = updatedCourse.modules.filter((_, i) => i !== payload.moduleIndex);
    } else if (type === "REORDER_MODULES" && Array.isArray(payload?.newOrder)) {
      const validOrder = payload.newOrder.filter((i: number) => i >= 0 && i < updatedCourse.modules.length);
      if (validOrder.length === updatedCourse.modules.length) {
        updatedCourse.modules = validOrder.map((i: number) => updatedCourse.modules[i]);
      }
    } else if (type === "CHANGE_LANGUAGE" && payload?.language) {
      updatedCourse.modules = updatedCourse.modules.map(mod => ({
        ...mod,
        chapters: mod.chapters?.map(chap => ({
          ...chap,
          youtubeQuery: `${chap.youtubeQuery} in ${payload.language}`
        }))
      }));
    } else if (type === "CHANGE_DIFFICULTY" && payload?.difficulty) {
      updatedCourse.modules = updatedCourse.modules.map(mod => ({
        ...mod,
        chapters: mod.chapters?.map(chap => ({
          ...chap,
          youtubeQuery: `${chap.youtubeQuery} for ${payload.difficulty}`
        }))
      }));
    } else if (type === "MODIFY_MODULE" && typeof (payload?.moduleIndex ?? payload?.index) === "number") {
      const idx = payload.moduleIndex ?? payload.index;
      const changes = payload.moduleData ?? payload.changes;
      if (changes) {
        const newModules = [...updatedCourse.modules];
        newModules[idx] = { ...newModules[idx], ...changes };
        updatedCourse.modules = newModules;
      }
    } else if (type === "CHANGE_CHAPTER_VIDEO" && typeof payload?.moduleIndex === "number" && typeof payload?.chapterIndex === "number" && payload?.newQuery) {
      const newModules = [...updatedCourse.modules];
      const chapters = [...(newModules[payload.moduleIndex].chapters || [])];
      if (chapters[payload.chapterIndex]) {
        chapters[payload.chapterIndex] = { ...chapters[payload.chapterIndex], youtubeQuery: payload.newQuery };
        newModules[payload.moduleIndex].chapters = chapters;
        updatedCourse.modules = newModules;
      }
    } else if (type === "FIND_SIMPLER_VIDEO" && typeof payload?.moduleIndex === "number" && typeof payload?.chapterIndex === "number") {
      const newModules = [...updatedCourse.modules];
      const chapters = [...(newModules[payload.moduleIndex].chapters || [])];
      if (chapters[payload.chapterIndex]) {
        chapters[payload.chapterIndex] = { ...chapters[payload.chapterIndex], youtubeQuery: `${chapters[payload.chapterIndex].youtubeQuery} explained simply for beginners` };
        newModules[payload.moduleIndex].chapters = chapters;
        updatedCourse.modules = newModules;
      }
    }

    setCourse(updatedCourse);
    localStorage.setItem("generatedCourse", JSON.stringify(updatedCourse));

    if (requiresVideoRefetch || type === "CHANGE_ANCHOR" || type === "CHANGE_LANGUAGE" || type === "FIND_SIMPLER_VIDEO" || type === "CHANGE_DIFFICULTY" || type === "CHANGE_CHAPTER_VIDEO") {
      setChapterVideos([]);
    }
  };

  useEffect(() => {
    const handleMutationEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        handleMutation(customEvent.detail);
      }
    };
    window.addEventListener("dojo-mutation", handleMutationEvent);
    return () => window.removeEventListener("dojo-mutation", handleMutationEvent);
  }, [course]); // Needs course in dependency array because handleMutation depends on course

  const launchWorkspace = (e: React.MouseEvent, mod: Module) => {
    e.stopPropagation();
    setActiveModule({ ...mod, playlist: course?.playlist });
  };

  // ═══════════════════════════════════════════
  // ERROR
  // ═══════════════════════════════════════════
  if (error) {
    return (
      <div className="h-screen w-full bg-[#09090B] flex flex-col items-center justify-center">
        <p className="mb-4 text-base text-red-400">{error}</p>
        <button onClick={() => router.push("/dashboard")} className="px-6 py-2 border border-[#1C1C21] rounded-md hover:bg-[#111114] text-[#F4F4F5] text-sm" style={{ transition: "background-color 150ms ease" }}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════════
  if (!course) {
    return (
      <div className="h-screen w-full bg-[#09090B] flex flex-col items-center justify-center p-4 text-center">
        <div className="w-8 h-8 border-2 border-[#6366F1] border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-lg font-semibold text-[#F4F4F5] mb-2">Designing Architecture...</h2>
        <p className="text-[#3F3F46] text-sm">
          Building the path for <span className="text-[#F4F4F5]">{topic}</span>
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // WORKSPACE
  // ═══════════════════════════════════════════
  if (activeModule) {
    return (
      <div className="relative w-full h-screen bg-[#09090B] overflow-hidden">
        <Workspace
          module={{ ...activeModule, chapters: activeModule.chapters || [] }}
          onBack={() => setActiveModule(null)}
          userContext={{ topic: topic || "" }}
          anchorChannel={course.anchorChannel || null}
          seenVideoIds={seenVideoIds}
          onVideoSeen={handleVideoSeen}
        />
        <ConversationalPanel pageContext={{ page: "workspace", topic: topic || "", moduleName: activeModule.moduleTitle }} />
        
        {/* Break Timer */}
        {breakPrefs?.focusMinutes && !breakActive && (
          <BreakTimer
            focusMinutes={breakPrefs.focusMinutes}
            onBreakStart={() => setBreakActive(true)}
          />
        )}

        {/* Break Popup */}
        {breakActive && breakPrefs && (
          <BreakPopup
            breakMinutes={breakPrefs.breakMinutes || 5}
            contentGenres={breakPrefs.contentGenres || ["Tech & Science"]}
            onBreakEnd={() => setBreakActive(false)}
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ROADMAP
  // ═══════════════════════════════════════════
  const contextLabel = learningContext?.domainType
    ? `${learningContext.domainType} · ${learningContext.priorKnowledge || "exploring"}`
    : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen bg-[#09090B] text-[#F4F4F5] p-6 md:p-8 overflow-y-auto"
    >


      {contextLabel && (
        <div className="fixed top-6 right-6 z-50 px-3 py-1 border border-[#1C1C21] rounded-md text-[11px] text-[#3F3F46] pointer-events-none font-mono">
          {contextLabel}
        </div>
      )}

      {/* Break Setup Banner */}
      <AnimatePresence>
        {showBreakBanner && !breakPrefs && course && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-40 max-w-md w-full mx-auto px-4"
          >
            <div
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg"
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.20)",
              }}
            >
              <span className="text-sm" style={{ color: "#F4F4F5" }}>
                ⏱️ Set up focus timer for better learning
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowBreakSetupModal(true)}
                  className="px-3 py-1 rounded-md text-xs font-medium"
                  style={{
                    background: "#6366F1",
                    color: "#fff",
                  }}
                >
                  Set Up
                </button>
                <button
                  onClick={() => setShowBreakBanner(false)}
                  className="text-sm px-1"
                  style={{ color: "#3F3F46" }}
                >
                  ✕
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Break Setup Modal */}
      <AnimatePresence>
        {showBreakSetupModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ background: "rgba(9,9,11,0.90)" }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-lg p-6 max-w-md w-full mx-4"
              style={{
                background: "#111114",
                border: "1px solid #1C1C21",
              }}
            >
              <h3 className="text-lg font-semibold text-[#F4F4F5] mb-1">
                {setupStep === 0 && "⏱️ Focus Duration"}
                {setupStep === 1 && "☕ Break Duration"}
                {setupStep === 2 && "🎬 Entertainment Preferences"}
              </h3>
              <p className="text-xs text-[#3F3F46] mb-5">
                {setupStep === 0 && "How long do you want to focus before a break?"}
                {setupStep === 1 && "How long should your break be?"}
                {setupStep === 2 && "What do you enjoy watching for fun? (pick any)"}
              </p>

              {setupStep === 0 && (
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "25 min (Pomodoro)", value: 25 },
                    { label: "45 min", value: 45 },
                    { label: "60 min", value: 60 },
                    { label: "90 min", value: 90 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSetupFocus(opt.value);
                        setSetupStep(1);
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium option-btn-hover"
                      style={{
                        background: "transparent",
                        color: "#F4F4F5",
                        border: "1px solid #1C1C21",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {setupStep === 1 && (
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 20].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => {
                        setSetupBreak(mins);
                        setSetupStep(2);
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium option-btn-hover"
                      style={{
                        background: "transparent",
                        color: "#F4F4F5",
                        border: "1px solid #1C1C21",
                      }}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              )}

              {setupStep === 2 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {["Tech & Science", "History & Culture", "Comedy & Satire", "Travel & Nature", "Business & Finance", "Sports & Games"].map((genre) => (
                      <button
                        key={genre}
                        onClick={() => {
                          setSetupGenres((prev) =>
                            prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
                          );
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                          background: setupGenres.includes(genre) ? "rgba(99,102,241,0.15)" : "transparent",
                          color: setupGenres.includes(genre) ? "#6366F1" : "#F4F4F5",
                          border: `1px solid ${setupGenres.includes(genre) ? "#6366F1" : "#1C1C21"}`,
                          transition: "background-color 150ms ease, color 150ms ease, border-color 150ms ease",
                        }}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const prefs = {
                        focusMinutes: setupFocus,
                        breakMinutes: setupBreak,
                        contentGenres: setupGenres.length > 0 ? setupGenres : ["Tech & Science"],
                      };
                      localStorage.setItem("breakPrefs", JSON.stringify(prefs));
                      setBreakPrefs(prefs);
                      setShowBreakSetupModal(false);
                      setShowBreakBanner(false);
                    }}
                    disabled={setupGenres.length === 0}
                    className="w-full mt-3 px-4 py-2.5 rounded-lg text-sm font-semibold"
                    style={{
                      background: setupGenres.length > 0 ? "#6366F1" : "#1C1C21",
                      color: setupGenres.length > 0 ? "#fff" : "#3F3F46",
                      cursor: setupGenres.length > 0 ? "pointer" : "not-allowed",
                    }}
                  >
                    Save & Start Timer →
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  setShowBreakSetupModal(false);
                  setSetupStep(0);
                }}
                className="mt-3 text-xs w-full text-center"
                style={{ color: "#3F3F46" }}
              >
                Maybe later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto mt-10 lg:mt-16">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold text-[#F4F4F5] leading-tight tracking-tight mb-3">
            {course.courseTitle}
          </h1>
          {course.anchorChannel && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mt-1 mb-4">
              <span>⚓ Anchor Channel:</span>
              <a href={`https://youtube.com/@${course.anchorChannel.replace(" ", "")}`} target="_blank"
                 className="text-[#6366F1] hover:underline font-medium">
                {course.anchorChannel}
              </a>
              <span className="text-[10px] px-2 py-0.5 bg-[#6366F1]/10 text-[#6366F1] rounded-full">
                Primary Source
              </span>
            </div>
          )}
          <p className="text-[#3F3F46] text-sm mt-3">Select a module to begin.</p>
        </div>

        <div className="space-y-3 pb-20">
          {course.modules.map((mod, index) => {
            const isUnlocked = mod.chapters && mod.chapters.length > 0;
            const isLoading = loadingModuleIdx === index;
            const isExpanded = expandedModuleIdx === index;

            const padClass = index < 2 ? "p-5" : index < 4 ? "p-6" : "p-7";
            const borderOpacity = index < 2 ? "border-[#1C1C21]/50" : index < 4 ? "border-[#1C1C21]/80" : "border-[#1C1C21]";
            const descSize = index < 2 ? "text-xs" : "text-sm";

            return (
              <div
                key={index}
                onClick={() => !isLoading && handleModuleClick(mod, index)}
                className={`border rounded-lg relative overflow-hidden cursor-pointer
                  ${padClass} ${borderOpacity}
                  ${isUnlocked ? "bg-[#111114] hover:border-[#3F3F46]" : "bg-[#111114]/50 opacity-60 hover:opacity-80"}
                `}
                style={{ transition: "height 200ms ease, opacity 0ms, border-color 0ms" }}
              >
                {isLoading && (
                  <div className="absolute inset-0 bg-[#09090B]/90 flex items-center justify-center z-10">
                    <span className="text-[#6366F1] font-mono text-xs animate-pulse">EXPANDING...</span>
                  </div>
                )}

                <div className="flex items-start gap-5">
                  <div className="flex-shrink-0 font-mono text-3xl md:text-4xl font-bold text-[#6366F1] leading-none pt-1">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-[#F4F4F5] tracking-tight mb-1">
                      {mod.moduleTitle}
                    </h3>
                    <p className={`${descSize} text-[#71717A] mb-2 line-clamp-1`}>{mod.atomicTruth}</p>
                    <div className="flex items-center gap-3 text-xs text-[#3F3F46]">
                      <span className={isUnlocked ? "" : "italic"}>{isUnlocked ? `${mod.chapters!.length} chapters` : "Tap to expand"}</span>
                      <span className="w-1 h-1 bg-[#1C1C21] rounded-full"></span>
                      <span className="font-mono">~{mod.estimatedDuration || "45 mins"}</span>
                    </div>
                  </div>
                </div>

                {isExpanded && isUnlocked && (
                  <div className="mt-5 pt-5 border-t border-[#1C1C21]/50 space-y-1" onClick={(e) => e.stopPropagation()}>
                    {mod.chapters!.map((chapter, chapIdx) => {
                      const isChapExpanded = expandedChapterIdx === chapIdx;
                      return (
                        <div key={chapIdx}>
                          <div
                            className="flex items-center justify-between py-2.5 px-3 rounded cursor-pointer hover:bg-[#111114]"
                            onClick={(e) => handleChapterRowClick(e, mod, chapIdx)}
                            style={{ transition: "none" }}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#3F3F46] shrink-0"></div>
                              <span className="text-sm text-[#F4F4F5]/80 truncate">{chapter.chapterTitle}</span>
                            </div>
                            <span className="font-mono text-[11px] text-[#3F3F46] shrink-0 ml-4">~10m</span>
                          </div>

                          <AnimatePresence>
                            {isChapExpanded && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="ml-6 mr-3 mb-3 mt-1"
                              >
                                {loadingChapterVideos ? (
                                  <div className="py-4 text-[11px] font-mono text-[#3F3F46] animate-pulse">Loading videos...</div>
                                ) : chapterVideos.length > 0 ? (
                                  <div className="flex flex-col md:flex-row gap-3">
                                    {(() => {
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      const pick = chapterVideos.find((v: any) => v.isPick) || chapterVideos[0];
                                      const alts = chapterVideos.filter((v: { videoId: string }) => v.videoId !== pick.videoId).slice(0, 2);
                                      return (
                                        <>
                                          <div
                                            onClick={(e) => launchWorkspace(e, mod)}
                                            className="flex-[7] cursor-pointer bg-[#09090B] border-l-[3px] border-l-[#6366F1] border border-[#1C1C21] rounded-lg p-3 hover:border-[#3F3F46]"
                                            style={{ transition: "none" }}
                                          >
                                            <div className="w-full aspect-video relative rounded-sm overflow-hidden mb-2.5 bg-black">
                                              <img src={`https://i.ytimg.com/vi/${pick.videoId}/mqdefault.jpg`} alt={pick.title} className="w-full h-full object-cover" />
                                              <div className="absolute bottom-1 right-1 bg-black/80 font-mono text-[9px] px-1 rounded text-white">{pick.duration}</div>
                                            </div>
                                            <div className="text-[13px] font-semibold text-[#F4F4F5] mb-1 line-clamp-2 leading-snug">{pick.title}</div>
                                            <div className="text-[#3F3F46] text-[10px] mb-0.5">{pick.channel}</div>
                                            <div className="text-[#3F3F46] text-[10px] line-clamp-1">{pick.reason}</div>
                                          </div>

                                          {alts.length > 0 && (
                                            <div className="flex-[3] flex flex-col gap-2">
                                              {alts.map((alt: { videoId: string; title: string; channel: string; reason: string }) => (
                                                <div
                                                  key={alt.videoId}
                                                  onClick={(e) => launchWorkspace(e, mod)}
                                                  className="flex-1 cursor-pointer bg-[#09090B] border border-[#1C1C21] rounded-lg p-2 hover:border-[#3F3F46]"
                                                  style={{ transition: "none" }}
                                                >
                                                  <div className="flex gap-2 mb-1">
                                                    <div className="w-16 shrink-0 aspect-video rounded-sm overflow-hidden bg-black">
                                                      <img src={`https://i.ytimg.com/vi/${alt.videoId}/mqdefault.jpg`} alt={alt.title} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <div className="text-[#F4F4F5] text-[10px] font-semibold truncate">{alt.title}</div>
                                                      <div className="text-[#3F3F46] text-[9px] truncate mt-0.5">{alt.channel}</div>
                                                    </div>
                                                  </div>
                                                  <div className="text-[#3F3F46] text-[9px] line-clamp-1">{alt.reason}</div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <div className="text-xs text-[#3F3F46] py-3">No videos located.</div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!isPreview && <ConversationalPanel pageContext={{ page: "roadmap", topic: topic || "" }} />}

      {!activeModule && !isPreview && (
        <SurgeonPanel
          course={course}
          userContext={{ topic, userRole: learningContext?.goal, experience: learningContext?.priorKnowledge }}
          onMutation={handleMutation}
        />
      )}
    </motion.div>
  );
}
