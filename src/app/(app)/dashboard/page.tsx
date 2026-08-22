"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ConversationalUI, { ConversationResult } from "@/components/ConversationalUI";

function DojoIcon({ size = 16, strokeWidth = 2, ...props }: any) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><path d="M8 12l4 4 4-4M12 8v8" /></svg>;
}

function NexusIcon({ size = 16, strokeWidth = 2, ...props }: any) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><line x1="8" y1="11" x2="16" y2="7" /><line x1="8" y1="13" x2="16" y2="17" /></svg>;
}

function ClipIcon({ size = 18, ...props }: any) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
}

function WebIcon({ size = 18, ...props }: any) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
}

import DojoView from "@/components/learn/DojoView";
import NexusView from "@/components/learn/NexusView";
import { ReactFlowProvider } from "reactflow";

// ─────────────────────────────────
// MAIN PAGE — LOVABLE-STYLE CENTERED PROMPT
// ─────────────────────────────────
export default function AppDashboard() {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [query, setQuery] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [chatTopic, setChatTopic] = useState("");
  const [mode, setMode] = useState<"dojo" | "nexus" | null>(null);
  
  const [previewResult, setPreviewResult] = useState<ConversationResult | null>(null);

  const placeholders = [
    "What do you want to master today?",
    "Dive deep into a new rabbit hole...",
    "What's the next skill to unlock?",
    "Ask anything, self-learner...",
    "What are we building next?",
  ];

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    // Rotating placeholder text
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 4000);

    // Dynamic Greeting Setup based on time and context
    const hour = new Date().getHours();
    const morning = [
      "The morning is quiet. What are we exploring today?",
      "Ready when you are. Where should we begin?",
      "A new day to learn. What’s on your mind?",
      "Space cleared for focus. What are we breaking down?",
    ];
    const afternoon = [
      "Still at it. Where to next?",
      "The momentum is good. Let’s keep digging.",
      "Afternoon clarity. What should we look into?",
      "Continuing the thread. What's the next question?",
    ];
    const night = [
      "The world is quiet. Perfect time to focus.",
      "Late night thoughts. What are we figuring out?",
      "The best hours for deep work. Where are we going?",
      "Undisturbed focus. Let's trace that thought.",
    ];
    const contextual = [
      "Welcome back. The space is exactly as you left it.",
      "A blank slate. What are we learning now?",
      "Let's unravel this. Where do we start?",
      "Connecting the dots. What did we miss?"
    ];

    // Give a 15% chance to show a contextual message instead of a time-based one
    if (Math.random() < 0.15) {
      setGreeting(contextual[Math.floor(Math.random() * contextual.length)]);
    } else {
      let pool = night;
      if (hour >= 5 && hour < 12) pool = morning;
      else if (hour >= 12 && hour < 18) pool = afternoon;
      setGreeting(pool[Math.floor(Math.random() * pool.length)]);
    }

    return () => clearInterval(timer);
  }, []);

  const handleSubmit = () => {
    const topic = query.trim();
    if (!topic) return;
    setChatTopic(topic);
    setIsChatting(true);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  };

  const handlePreviewMode = (result: ConversationResult) => {
    setPreviewResult(result);
  };

  const handleChatComplete = (result: ConversationResult) => {
    try {
      localStorage.setItem("learningContext", JSON.stringify(result.learningContext));

      const finalMode = result.mode || mode || "dojo";
      const route = finalMode === "nexus"
        ? `/nexus?topic=${encodeURIComponent(result.topic)}`
        : `/roadmap?topic=${encodeURIComponent(result.topic)}`;

      const session = { topic: result.topic, timestamp: Date.now(), route };
      const raw = localStorage.getItem("recentSessions");
      const prev = raw ? JSON.parse(raw) : [];
      const updated = [session, ...prev.filter((s: { topic: string }) => s.topic !== result.topic)].slice(0, 20);
      localStorage.setItem("recentSessions", JSON.stringify(updated));

      router.push(route);
    } catch {
      const finalMode = result.mode || mode || "dojo";
      const route = finalMode === "nexus"
        ? `/nexus?topic=${encodeURIComponent(result.topic)}`
        : `/roadmap?topic=${encodeURIComponent(result.topic)}`;
      router.push(route);
    }
  };

  return (
    <>
      <div
        className="fade-in"
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          position: "absolute",
          inset: 0,
          background: "transparent",
          opacity: isChatting ? 0 : 1,
          pointerEvents: isChatting ? "none" : "auto",
          transition: "opacity 0.6s ease-out",
        }}
      >
        <div style={{ width: "100%", maxWidth: "760px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {greeting && (
            <h1
              className="fade-in"
              style={{
                fontSize: "clamp(1.2rem, 3.5vw, 2.2rem)",
                fontWeight: 600,
                color: "var(--text-primary)",
                textAlign: "center",
                marginBottom: "32px",
                lineHeight: 1.3,
                letterSpacing: "-0.03em",
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                animationDuration: "800ms",
              }}
            >
              {greeting}
            </h1>
          )}

          <div
            className="fade-in"
            style={{
              position: "relative",
              animationDelay: "80ms",
              animationFillMode: "backwards",
              width: "100%",
              maxWidth: "680px"
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                background: "var(--bg-secondary)", 
                borderRadius: "20px",
                padding: "16px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                minHeight: "140px",
              }}
            >
              <div style={{ position: "relative", flex: 1, minHeight: "48px", marginBottom: "12px", display: "flex", flexDirection: "column" }}>
                {!query && (
                  <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", color: "var(--text-muted)", display: "flex", alignItems: "flex-start", width: "100%", height: "100%" }}>
                    {placeholders.map((text, i) => (
                      <span key={i} style={{ position: "absolute", opacity: placeholderIndex === i ? 1 : 0, transition: "opacity 0.5s ease", fontSize: "16px", fontFamily: "'Inter', sans-serif", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                        {text}
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={query}
                  onChange={handleInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  style={{
                    width: "100%",
                    fontSize: "16px",
                    color: "var(--text-primary)",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                    resize: "none",
                    lineHeight: 1.5,
                    position: "relative",
                    zIndex: 1,
                    overflowY: "auto",
                    flex: 1
                  }}
                  rows={1}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button 
                    onClick={() => setMode(mode === "dojo" ? null : "dojo")}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "6px 14px", borderRadius: "100px",
                      fontSize: "13px", fontWeight: 500,
                      background: mode === "dojo" ? "var(--bg-card)" : "transparent",
                      color: mode === "dojo" ? "var(--accent)" : "var(--text-muted)",
                      border: mode === "dojo" ? "1px solid var(--border)" : "1px solid transparent",
                      cursor: "pointer", transition: "background-color 200ms ease, color 200ms ease, border-color 200ms ease"
                    }}
                  >
                    <DojoIcon size={14} /> Dojo
                  </button>
                  <button 
                    onClick={() => setMode(mode === "nexus" ? null : "nexus")}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "6px 14px", borderRadius: "100px",
                      fontSize: "13px", fontWeight: 500,
                      background: mode === "nexus" ? "var(--bg-card)" : "transparent",
                      color: mode === "nexus" ? "var(--accent)" : "var(--text-muted)",
                      border: mode === "nexus" ? "1px solid var(--border)" : "1px solid transparent",
                      cursor: "pointer", transition: "background-color 200ms ease, color 200ms ease, border-color 200ms ease"
                    }}
                  >
                    <NexusIcon size={14} /> Nexus
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={handleSubmit}
                    aria-label="Send"
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "10px",
                      background: query.trim() ? "var(--accent)" : "rgba(255, 255, 255, 0.1)",
                      border: "none",
                      cursor: query.trim() ? "pointer" : "default",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: query.trim() ? "#fff" : "var(--text-muted)",
                      transition: "background-color 150ms ease, transform 150ms ease",
                    }}
                    onMouseEnter={(e) => query.trim() && (e.currentTarget.style.transform = "scale(1.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          background: "var(--bg-primary)",
          opacity: isChatting ? 1 : 0,
          pointerEvents: isChatting ? "auto" : "none",
          transition: "opacity 0.6s ease-out",
          display: "flex",
          flexDirection: "row", // Changed to row for split screen
        }}
      >
        <div 
          style={{ 
            flex: previewResult ? "0 0 clamp(280px, 35vw, 35vw)" : "1", 
            transition: "flex 0.6s cubic-bezier(0.16, 1, 0.3, 1), border-right-color 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            borderRight: previewResult ? "1px solid var(--border)" : "none"
          }}
        >
          {isChatting && (
            <ConversationalUI
              context="dashboard"
              initialTopic={chatTopic}
              onPreviewMode={handlePreviewMode}
              onComplete={handleChatComplete}
            />
          )}
        </div>
        
        <div 
          style={{ 
            flex: previewResult ? "1" : "0", 
            overflow: "hidden",
            transition: "flex 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
            background: "var(--bg-primary)",
            position: "relative"
          }}
        >
          {previewResult && (
            <div style={{ width: "100%", height: "100%", overflowY: "auto", position: "absolute", inset: 0 }}>
              {previewResult.mode === "dojo" ? (
                <DojoView initialTopic={previewResult.topic} isPreview={true} />
              ) : (
                <ReactFlowProvider>
                   <NexusView initialTopic={previewResult.topic} isPreview={true} />
                </ReactFlowProvider>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

