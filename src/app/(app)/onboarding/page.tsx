"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ConversationalUI, { ConversationResult } from "@/components/ConversationalUI";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillTopic = searchParams.get("topic") || "";

  const handleComplete = (result: ConversationResult) => {
    // Save to learningContext and recent sessions
    try {
      localStorage.setItem("learningContext", JSON.stringify(result.learningContext));

      const route = result.mode === "nexus" 
        ? `/nexus` 
        : `/roadmap?topic=${encodeURIComponent(result.topic)}`;

      const session = { topic: result.topic, timestamp: Date.now(), route };
      const raw = localStorage.getItem("recentSessions");
      const prev = raw ? JSON.parse(raw) : [];
      const updated = [session, ...prev.filter((s: { topic: string }) => s.topic !== result.topic)].slice(0, 20);
      localStorage.setItem("recentSessions", JSON.stringify(updated));
      
      router.push('/dashboard');
    } catch { 
      // Fallback
      router.push('/dashboard');
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <ConversationalUI
        context="onboarding"
        onComplete={handleComplete}
        initialTopic={prefillTopic}
      />
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="h-full bg-[var(--bg-primary)]" />}>
      <OnboardingContent />
    </Suspense>
  );
}
