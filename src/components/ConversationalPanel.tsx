"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ConversationalPanelProps {
  pageContext: {
    page: "roadmap" | "workspace" | "nexus" | "dashboard";
    moduleName?: string;
    chapterName?: string;
    videoId?: string;
    nexusNode?: string;
    topic?: string;
  };
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ConversationalPanel({ pageContext }: ConversationalPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    if (isOpen && !isThinking) {
      inputRef.current?.focus();
    }
  }, [isOpen, isThinking]);

  const getSystemPrompt = useCallback(() => {
    const base = `You are a helpful learning assistant. Be concise and direct. Keep responses under 3 sentences unless asked for detail.`;
    switch (pageContext.page) {
      case "roadmap":
        return `${base} The user is viewing their learning roadmap${pageContext.topic ? ` for "${pageContext.topic}"` : ""}. Help with feedback about the roadmap, requests to adjust modules, or questions about topics.`;
      case "workspace":
        return `${base} The user is studying${pageContext.chapterName ? ` "${pageContext.chapterName}"` : ""}${pageContext.moduleName ? ` in module "${pageContext.moduleName}"` : ""}. Help with questions about the current chapter, video feedback, or requests for alternative explanations.`;
      case "nexus":
        return `${base} The user is exploring concepts${pageContext.nexusNode ? ` around "${pageContext.nexusNode}"` : ""}. Help with exploration questions and deeper dives.`;
      default:
        return base;
    }
  }, [pageContext]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    const userMsg: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    // Check for feedback keywords — write to localStorage
    const lower = trimmed.toLowerCase();
    const isFeedback = lower.includes("wrong") || lower.includes("too advanced") || lower.includes("too basic") || lower.includes("bad video") || lower.includes("regenerate");

    if (isFeedback) {
      const feedbackEvent = {
        type: "conversational_feedback",
        page: pageContext.page,
        module: pageContext.moduleName || null,
        chapter: pageContext.chapterName || null,
        videoId: pageContext.videoId || null,
        message: trimmed,
        timestamp: new Date().toISOString(),
      };
      const prev = JSON.parse(localStorage.getItem("LearningFingerprint") || "[]");
      localStorage.setItem("LearningFingerprint", JSON.stringify([...prev, feedbackEvent]));
    }

    try {
      const res = await fetch("/api/onboarding-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: trimmed,
          chatHistory: messages.map((m) => ({ role: m.role, content: m.content })),
          currentContext: {},
          exchangeCount: messages.length,
          systemOverride: getSystemPrompt(),
        }),
      });

      if (!res.ok) throw new Error("Chat failed");
      const data = await res.json();

      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Try again." },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <>
      {/* Trigger Button — bottom right, all pages */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-[60] w-10 h-10 rounded-full bg-[#111114] border border-[#1C1C21] flex items-center justify-center text-[#71717A] hover:text-[#F4F4F5] hover:border-[#3F3F46]"
        style={{ transition: "background-color 150ms ease, color 150ms ease, border-color 150ms ease" }}
      >
        {isOpen ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-0 right-0 bottom-0 z-[55] w-[320px] xl:w-[380px] max-w-[100vw] bg-[#111114] border-l border-[#1C1C21] flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#1C1C21] flex items-center justify-between shrink-0">
              <span className="text-sm font-medium text-[#F4F4F5]">
                {pageContext.page === "workspace" && pageContext.chapterName
                  ? pageContext.chapterName
                  : pageContext.page === "nexus" && pageContext.nexusNode
                    ? pageContext.nexusNode
                    : "Assistant"}
              </span>
              <span className="text-[10px] text-[#3F3F46] font-mono">
                {pageContext.page}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-[#3F3F46] text-sm">Ask anything about what you&apos;re learning.</p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-lg text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#6366F1]/10 text-[#F4F4F5] border border-[#6366F1]/15"
                        : "bg-[#09090B] text-[#F4F4F5] border border-[#1C1C21]"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex justify-start">
                  <div className="bg-[#09090B] border border-[#1C1C21] px-3.5 py-2.5 rounded-lg">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1 h-1 bg-[#6366F1] rounded-full animate-pulse" />
                      <span className="w-1 h-1 bg-[#6366F1] rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 bg-[#6366F1] rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-[#1C1C21] shrink-0">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={isThinking}
                  placeholder="Ask a question..."
                  className="w-full bg-[#09090B] border border-[#1C1C21] rounded-md px-4 py-2.5 pr-10 text-[#F4F4F5] placeholder-[#3F3F46] focus:outline-none focus:border-[#6366F1] text-sm disabled:opacity-40"
                  style={{ transition: "border-color 150ms ease" }}
                />
                <button
                  onClick={handleSend}
                  disabled={isThinking || !input.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#3F3F46] hover:text-[#6366F1] disabled:opacity-30"
                  style={{ transition: "color 150ms ease" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
