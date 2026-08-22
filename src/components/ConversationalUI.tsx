"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- TYPES ---
export interface ConversationResult {
  topic: string;
  mode: "dojo" | "nexus";
  learningContext: {
    goal?: string;
    level?: string;
    timeAvailable?: string;
    preferredStyle?: string;
  };
}

export interface ConversationalUIProps {
  context: "onboarding" | "dashboard" | "nexus";
  onComplete: (result: ConversationResult) => void;
  initialTopic?: string; // Pre-seeded topic from dashboard
  onPreviewMode?: (result: ConversationResult) => void;
}

interface ConversationOption {
  label: string;
  value: string;
  emoji?: string;
  subtext?: string;
}

interface Message {
  role: "user" | "ai";
  content: string;
  options?: ConversationOption[];
}

export default function ConversationalUI({ context, onComplete, initialTopic, onPreviewMode }: ConversationalUIProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [surgeonLoading, setSurgeonLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [completeResult, setCompleteResult] = useState<ConversationResult | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, surgeonLoading]);

  const hasInitialized = useRef(false);

  // Initial greeting or query
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      // If we are given an initial topic (e.g., from Dashboard), we can send it right away.
      if (initialTopic) {
        await handleUserSubmit(initialTopic);
        return;
      }

      // Otherwise, start with generic greeting.
      const initialMessage: Message = {
        role: "ai",
        content: "Hello! What brings you to Learning Dojo today?",
        options: [
          { label: "Learn something new", value: "Learn something new", subtext: "Start fresh", emoji: "🌱" },
          { label: "Explore a topic", value: "Explore visually", subtext: "Wander around", emoji: "🕸️" },
          { label: "Upload syllabus", value: "Upload my syllabus", subtext: "Guided path", emoji: "📄" },
          { label: "Practice skills", value: "Practice skills", subtext: "Test yourself", emoji: "🎯" }
        ],
      };
      setMessages([initialMessage]);
    };
    init();
  }, [initialTopic]); // Run once

  async function callSurgeonAPI(command: string) {
    setSurgeonLoading(true);
    try {
      // Small delay to ensure localStorage has latest course if just generated
      const rawCourse = localStorage.getItem("generatedCourse");
      const currentRoadmap = rawCourse ? JSON.parse(rawCourse) : null;
      
      const res = await fetch("/api/roadmap-surgeon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          currentRoadmap,
          userContext: { topic: completeResult?.topic || "" },
        }),
      });

      const data = await res.json();
      
      // Dispatch event or modify local storage so DojoView dynamically updates
      if (data.type && data.type !== "EXPLAIN_PIPELINE_STATUS") {
        if (data.type === "CUSTOMIZE_RESOURCES") {
          const handlers = (window as any).__workspaceSurgeonHandlers;
          if (handlers?.CUSTOMIZE_RESOURCES) handlers.CUSTOMIZE_RESOURCES();
        } else {
           // Provide a way to pass mutation to DojoView
           // In real-time, sending a custom event is best since they share the browser window
           const event = new CustomEvent("dojo-mutation", { detail: data });
           window.dispatchEvent(event);
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "ai", content: data.humanResponse || "Done.", options: [ { label: "Let's continue", value: "__CONTINUE__" } ] },
      ]);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Oops, I had trouble applying that change. Try again?" }
      ]);
    } finally {
      setSurgeonLoading(false);
    }
  }

  async function callAPI(newMessages: Message[]) {
    setIsLoading(true);
    try {
      const step = newMessages.filter((m) => m.role === "user").length;
      
      const payload = {
        messages: newMessages,
        context,
        step,
      };

      const res = await fetch("/api/conversation-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("API failed");
      
      const data = await res.json();
      
      if (data.isComplete && data.result) {
        if (data.result.breakPrefs) {
          try {
            localStorage.setItem("breakPrefs", JSON.stringify(data.result.breakPrefs));
          } catch (e) {
            console.warn("Failed to store breakPrefs:", e);
          }
        }
        
        if (context === "dashboard" && onPreviewMode) {
           setCompleteResult(data.result);
           onPreviewMode(data.result);
           setIsPreviewMode(true);
           setMessages((prev) => [
              ...prev,
              { 
                 role: "ai", 
                 content: `Here's a preview of your ${data.result.mode === 'dojo' ? 'roadmap' : 'nexus'}! Does this look right? You can ask me to change the anchor channel, make it harder/easier, or add modules.`,
                 options: [
                   { label: "Looks great, let's continue", value: "__CONTINUE__", emoji: "🚀" },
                 ]
              }
           ]);
        } else {
           onComplete(data.result);
        }
        return; 
      }

      setMessages((prev) => [
        ...prev,
        { role: "ai", content: data.message, options: data.options },
      ]);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Oops, I encountered a tiny hiccup. Could you try explaining that one more time?" }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const handleUserSubmit = async (text: string) => {
    if (!text.trim() || isLoading || surgeonLoading) return;
    
    if (text === "__CONTINUE__") {
       if (completeResult) {
          onComplete(completeResult);
       }
       return;
    }

    const newMessages = [...messages];
    if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === "ai") {
      newMessages[newMessages.length - 1].options = undefined;
    }

    const userMsg: Message = { role: "user", content: text };
    newMessages.push(userMsg);
    
    setMessages(newMessages);
    setInputText("");
    
    if (isPreviewMode) {
       await callSurgeonAPI(text);
    } else {
       await callAPI(newMessages);
    }
  };

  const currentStepCount = Math.min(4, Math.max(1, messages.filter(m => m.role === 'user').length + 1));

  return (
    <div className="flex flex-col h-full w-full">
      {/* Messages Scroll Area */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto scrollbar-none" 
        style={{ scrollBehavior: "smooth", scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <style dangerouslySetInnerHTML={{__html: `
          .scrollbar-none::-webkit-scrollbar { display: none; }
        `}} />
        <div className="w-full max-w-2xl mx-auto px-4 pt-12 pb-6">
          <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const isAI = msg.role === "ai";
            const isLast = i === messages.length - 1;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex flex-col mb-12 ${isAI ? "items-start w-full" : "items-end w-full"}`}
              >
                <div
                  style={{
                    maxWidth: isAI ? "100%" : "85%",
                    padding: isAI ? "0" : "16px 20px",
                    fontSize: "0.95rem", // Normal sizing
                    fontWeight: 400,
                    lineHeight: 1.6,
                    color: "var(--text-primary)",
                    backgroundColor: isAI ? "transparent" : "var(--bg-card)",
                    border: isAI ? "none" : "1px solid var(--border)",
                    borderRadius: isAI ? "0" : "24px",
                    borderBottomRightRadius: isAI ? "0" : "4px",
                  }}
                >
                  {msg.content}
                </div>
                
                {/* Options (only show on the very last AI message) */}
                {isAI && isLast && msg.options && msg.options.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col gap-3 mt-6 w-full max-w-lg"
                  >
                    {msg.options.map((opt, optIdx) => (
                      <button
                        key={optIdx}
                        onClick={() => handleUserSubmit(opt.value)}
                        className="group w-full option-btn-hover"
                        style={{
                          animationDelay: `${optIdx * 50}ms`,
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "14px 16px",
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          borderRadius: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <div className="flex items-center gap-4">
                          {opt.emoji && <span className="text-xl">{opt.emoji}</span>}
                          <div className="flex flex-col items-start text-left">
                            <span className="font-medium text-[var(--text-primary)] text-[15px]">{opt.label}</span>
                            {opt.subtext && <span className="text-[13px] text-[var(--text-secondary)] mt-0.5">{opt.subtext}</span>}
                          </div>
                        </div>
                        <span className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </span>
                      </button>
                    ))}
                    {!msg.options.some(o => o.label.toLowerCase() === 'custom' || o.label.toLowerCase().includes('type')) && (
                      <button
                        onClick={() => inputRef.current?.focus()}
                        className="group w-full option-btn-hover"
                        style={{
                          animationDelay: `${msg.options.length * 50}ms`,
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "14px 16px",
                          backgroundColor: "transparent",
                          border: "1px dashed var(--border)",
                          borderRadius: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-xl">✏️</span>
                          <span className="font-medium text-[var(--text-secondary)] text-[15px]">Type my own answer...</span>
                        </div>
                        <span className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </span>
                      </button>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isLoading && (
          <motion.div
             initial={{ opacity: 0 }} animate={{ opacity: 1 }}
             className="flex items-start mb-6"
          >
            <div
              style={{
                padding: "16px",
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "20px",
                borderTopLeftRadius: "4px",
              }}
              className="flex items-center gap-1.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </motion.div>
        )}
        </div>
      </div>

      {/* Input Area */}
      <div className="w-full shrink-0">
        <div className="w-full max-w-2xl mx-auto px-4 py-4">
          <div style={{ position: "relative" }}>
            {/* removed side glow completely as requested */}
            
            {/* 2) The actual input container wrapper */}
            <div 
              style={{
                position: "relative",
                zIndex: 2,
                /* We use EXACTLY 1px padding to act as the border */
                padding: context === "dashboard" ? "1px" : "0",
                borderRadius: "17px", 
                background: context === "dashboard" 
                  ? "linear-gradient(90deg, var(--glow-1) 0%, var(--glow-2) 50%, var(--glow-3) 100%, var(--glow-1) 150%)" 
                  : "transparent",
                backgroundSize: context === "dashboard" ? "200% 100%" : "auto",
                animation: context === "dashboard" ? "gradientCycle 4s linear infinite" : "none",
              }}
            >
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleUserSubmit(inputText);
                  }
                }}
                placeholder="Or type your answer..."
                disabled={isLoading}
                style={{
                  display: "block", /* Fixes the phantom bottom gap */
                  width: "100%",
                  minHeight: "clamp(80px, 15vh, 130px)",
                  padding: "16px 60px 16px 20px",
                  fontSize: "14px",
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: context === "dashboard" ? "none" : "1px solid var(--border)",
                  borderRadius: "16px",
                  outline: "none",
                  resize: "none",
                  transition: "border-color 200ms ease",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--text-muted)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
              <button
            onClick={() => handleUserSubmit(inputText)}
            disabled={!inputText.trim() || isLoading}
            style={{
              position: "absolute",
              right: "12px",
              bottom: "12px",
              width: "36px",
              height: "36px",
              zIndex: 3,
              borderRadius: "50%",
              backgroundColor: inputText.trim() ? "var(--text-primary)" : "var(--bg-secondary)",
              color: inputText.trim() ? "var(--bg-primary)" : "var(--text-muted)",
              border: "1px solid",
              borderColor: inputText.trim() ? "var(--text-primary)" : "var(--border)",
              cursor: inputText.trim() && !isLoading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 200ms ease, color 200ms ease, border-color 200ms ease",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            </button>
          </div>
        </div>
        
          {/* Progress bar below input */}
          {context !== "dashboard" && (
            <div className="mt-4 mx-auto w-48 h-1 bg-[var(--border)] rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-[var(--text-muted)] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(currentStepCount / 4) * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
