"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Chapter {
  chapterTitle: string;
  youtubeQuery: string;
}

interface Module {
  moduleTitle: string;
  atomicTruth?: string;
  estimatedDuration?: string;
  chapters?: Chapter[];
  playlist?: {
    entries?: Array<{
      videoId: string;
      topicMatched: string;
    }>;
  };
}

interface RoadmapSurgeonProps {
  course: {
    courseTitle: string;
    anchorChannel: string;
    modules: Module[];
  };
  userGoal: string;
  userRole: string;
  experience: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutation: (action: string, payload: any) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTER_CHIPS = [
  "This feels too advanced for me",
  "Change the YouTube channel",
  "Add a basics module first",
  "Explain the roadmap structure",
];

export default function RoadmapSurgeon({
  course,
  userGoal,
  userRole,
  experience,
  onMutation,
}: RoadmapSurgeonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const courseContext = {
        courseTitle: course.courseTitle,
        anchorChannel: course.anchorChannel,
        userGoal,
        userRole,
        experience,
        modules: course.modules.map((m) => ({
          moduleTitle: m.moduleTitle,
          atomicTruth: m.atomicTruth || "",
          estimatedDuration: m.estimatedDuration || "",
          chaptersCount: m.chapters?.length ?? 0,
          isUnlocked: (m.chapters?.length ?? 0) > 0,
        })),
      };

      // Send last 6 messages to limit tokens
      const allMessages = [...messages, userMsg];
      const chatHistory = allMessages.slice(-6);

      const res = await fetch("/api/roadmap-surgeon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: trimmed,
          courseContext,
          chatHistory,
        }),
      });

      const data = await res.json();

      console.log("🧬 Surgeon full response:", JSON.stringify(data));

      const didMutate = data.action && data.action !== "REPLY_ONLY";

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: (data.reply || "I understood that, but I'm not sure how to respond.") +
          (didMutate ? ` ✅` : ""),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (didMutate) {
        console.log(`🧬 Applying mutation: ${data.action}`, data.payload);
        onMutation(data.action, data.payload || {});
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong — try again in a moment.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-white shadow-lg roadmap-surgeon-btn-hover"
            style={{
              backgroundColor: "#6366F1",
            }}
          >
            <span>🧬</span>
            <span>Customize Roadmap</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed bottom-6 right-6 z-50 flex flex-col"
            style={{
              width: "min(350px, calc(100vw - 48px))",
              maxHeight: 500,
              backgroundColor: "#09090B",
              border: "1px solid #1C1C21",
              borderRadius: 8,
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid #1C1C21" }}
            >
              <div className="flex items-center gap-2">
                <span style={{ color: "#6366F1", fontSize: 14 }}>✦</span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: "#F4F4F5" }}
                >
                  Learning Architect
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-sm roadmap-surgeon-close-hover"
                style={{
                  color: "#3F3F46",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar"
              style={{ minHeight: 0 }}
            >
              {/* Starter chips when no messages */}
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p
                    className="text-xs"
                    style={{ color: "#71717A", marginBottom: 8 }}
                  >
                    Try asking:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => sendMessage(chip)}
                        disabled={isLoading}
                        className="text-xs px-3 py-1.5 rounded-full roadmap-surgeon-chip-hover"
                        style={{
                          backgroundColor: "#111114",
                          border: "1px solid #1C1C21",
                          color: "#71717A",
                          cursor: "pointer",
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message list */}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex mb-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[85%] px-3 py-2 text-[13px] leading-relaxed"
                    style={{
                      backgroundColor:
                        msg.role === "user" ? "#6366F1" : "#111114",
                      color:
                        msg.role === "user" ? "#FFFFFF" : "#F4F4F5",
                      borderRadius:
                        msg.role === "user"
                          ? "8px 8px 2px 8px"
                          : "8px 8px 8px 2px",
                      border:
                        msg.role === "assistant"
                          ? "1px solid #1C1C21"
                          : "none",
                    }}
                  >
                    {msg.role === "assistant" && (
                      <span
                        style={{
                          color: "#6366F1",
                          marginRight: 4,
                          fontSize: 11,
                        }}
                      >
                        ✦
                      </span>
                    )}
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start mb-3">
                  <div
                    className="px-3 py-2 flex items-center gap-1.5"
                    style={{
                      backgroundColor: "#111114",
                      border: "1px solid #1C1C21",
                      borderRadius: "8px 8px 8px 2px",
                    }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{
                        backgroundColor: "#6366F1",
                        animationDelay: "0ms",
                      }}
                    />
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{
                        backgroundColor: "#6366F1",
                        animationDelay: "150ms",
                      }}
                    />
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{
                        backgroundColor: "#6366F1",
                        animationDelay: "300ms",
                      }}
                    />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div
              className="shrink-0 px-3 py-3 flex items-center gap-2"
              style={{ borderTop: "1px solid #1C1C21" }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your roadmap…"
                disabled={isLoading}
                className="flex-1 text-sm outline-none"
                style={{
                  backgroundColor: "#111114",
                  border: "1px solid #1C1C21",
                  borderRadius: 6,
                  padding: "8px 12px",
                  color: "#F4F4F5",
                  transition: "border-color 150ms ease",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "#6366F1")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "#1C1C21")
                }
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="shrink-0 flex items-center justify-center"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  backgroundColor:
                    input.trim() && !isLoading ? "#6366F1" : "#1C1C21",
                  color:
                    input.trim() && !isLoading ? "#FFFFFF" : "#3F3F46",
                  border: "none",
                  cursor:
                    input.trim() && !isLoading ? "pointer" : "default",
                  transition:
                    "background-color 150ms ease, color 150ms ease",
                  fontSize: 16,
                }}
              >
                ↑
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
