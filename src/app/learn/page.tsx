"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ReactFlowProvider } from "reactflow";
import NexusView from "@/components/learn/NexusView";
import DojoView from "@/components/learn/DojoView";

function LearnShell() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const topic = searchParams.get("topic") || "";
  const nexusTrail = searchParams.get("nexusTrail") || "";
  const nexusOrigin = searchParams.get("nexusOrigin") || "";
  const knownConcepts = searchParams.get("knownConcepts") || "";

  const [activeNexusTitles, setActiveNexusTitles] = useState<string[]>([]);
  const [completedDojoTitles, setCompletedDojoTitles] = useState<string[]>([]);
  const [mode, setMode] = useState<"nexus" | "dojo">(
    searchParams.get("mode") === "dojo" ? "dojo" : "nexus"
  );

  const displayTopic = useMemo(() => {
    if (!topic) return "Learning Shell";
    return topic.length > 40 ? `${topic.slice(0, 40)}...` : topic;
  }, [topic]);

  const switchToNexus = () => {
    setMode("nexus");
    window.history.replaceState(
      {},
      "",
      `/learn?mode=nexus&topic=${encodeURIComponent(topic)}&knownConcepts=${encodeURIComponent(completedDojoTitles.join(","))}`
    );
  };

  const switchToDojo = () => {
    setMode("dojo");
    window.history.replaceState(
      {},
      "",
      `/learn?mode=dojo&topic=${encodeURIComponent(topic)}&nexusTrail=${encodeURIComponent(activeNexusTitles.join(","))}`
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-black">
      <div className="fixed z-50 w-full h-14 bg-black/80 backdrop-blur-md border-b border-gray-800 flex items-center px-6 gap-4">
        <div>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← Home
          </button>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="text-sm text-gray-300 font-medium truncate max-w-[280px] lg:max-w-[420px]">{displayTopic}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={switchToNexus}
            className={`px-3 py-1.5 rounded-full border text-xs transition-all cursor-pointer ${
              mode === "nexus"
                ? "bg-[#6366F1]/20 border-[#6366F1] text-[#818CF8]"
                : "border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
          >
            🗺️ Explore
          </button>

          <button
            onClick={switchToDojo}
            className={`px-3 py-1.5 rounded-full border text-xs transition-all cursor-pointer ${
              mode === "dojo"
                ? "bg-[#6366F1]/20 border-[#6366F1] text-[#818CF8]"
                : "border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
          >
            🥋 Learn
          </button>
        </div>
      </div>

      <div className="pt-14 h-screen overflow-hidden">
        <AnimatePresence mode="wait">
          {mode === "nexus" ? (
            <motion.div key="nexus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
              <ReactFlowProvider>
                <NexusView
                  initialTopic={topic}
                  knownConcepts={knownConcepts}
                  onActiveNodesChange={setActiveNexusTitles}
                />
              </ReactFlowProvider>
            </motion.div>
          ) : (
            <motion.div key="dojo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full overflow-y-auto">
              <DojoView
                initialTopic={topic}
                nexusTrail={nexusTrail}
                nexusOrigin={nexusOrigin}
                onCompletedModulesChange={setCompletedDojoTitles}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function LearnPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-black" />}>
      <LearnShell />
    </Suspense>
  );
}
