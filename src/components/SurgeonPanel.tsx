"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SurgeonPanel({ course, userContext, onMutation }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inlineAction, setInlineAction] = useState<"anchor" | "language" | "difficulty" | null>(null);
  
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

  const handleIntercept = (command: string) => {
    const lower = command.toLowerCase();
    if (lower.includes("what is happening") || lower.includes("pipeline status") || lower.includes("show me")) {
      const source = typeof window !== "undefined" ? localStorage.getItem("lastVideoSource") || "Unknown" : "Unknown";
      const statusMsg = `Right now: Anchor Channel = ${course?.anchorChannel || "None"}, Language = English, Videos fetched via: Gemini reranking + density scoring.\nModule count: ${course?.modules?.length || 0}. Last video source: ${source}.`;
      setMessages(prev => [...prev, { role: "assistant", content: statusMsg }]);
      return true;
    }
    return false;
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setInlineAction(null);
    const userMsg = { role: "user", content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    
    if (handleIntercept(trimmed)) {
       return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/roadmap-surgeon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: trimmed,
          currentRoadmap: course,
          userContext,
        }),
      });

      const data = await res.json();
      const assistantMsg = {
        role: "assistant",
        content: data.humanResponse || "Done.",
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.type && data.type !== "EXPLAIN_PIPELINE_STATUS") {
        // Handle CUSTOMIZE_RESOURCES by calling workspace handler directly
        if (data.type === "CUSTOMIZE_RESOURCES") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handlers = (window as any).__workspaceSurgeonHandlers;
          if (handlers?.CUSTOMIZE_RESOURCES) {
            handlers.CUSTOMIZE_RESOURCES();
          }
        } else {
          onMutation(data);
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong." }]);
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

  const fireCommand = (cmd: string) => {
    sendMessage(cmd);
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-white shadow-lg"
            style={{ backgroundColor: "#6366F1" }}
          >
            <span>🔪</span>
            <span>Roadmap Surgeon</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 flex flex-col"
            style={{
              width: "min(360px, calc(100vw - 48px))",
              maxHeight: 520,
              backgroundColor: "#09090B",
              border: "1px solid #1C1C21",
              borderRadius: 8,
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #1C1C21" }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-sm font-semibold text-[#F4F4F5]">🔪 Roadmap Surgeon</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-[#3F3F46] hover:text-[#F4F4F5]">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar" style={{ minHeight: 200 }}>
              {messages.length === 0 && (
                <div className="text-xs text-[#71717A] mb-4">
                  Surgeon active. You can modify the roadmap by issuing commands.
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex mb-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                   <div style={{
                      maxWidth: "85%", padding: "8px 12px", fontSize: 13,
                      backgroundColor: msg.role === "user" ? "#6366F1" : "#111114",
                      color: msg.role === "user" ? "#FFFFFF" : "#F4F4F5",
                      borderRadius: msg.role === "user" ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                      border: msg.role === "assistant" ? "1px solid #1C1C21" : "none"
                   }}>
                     {msg.content}
                   </div>
                </div>
              ))}
              
              {isLoading && (
                 <div className="flex justify-start mb-3">
                   <div className="px-3 py-2 bg-[#111114] border border-[#1C1C21] rounded-lg">
                     <span className="text-xs text-[#71717A]">Processing...</span>
                   </div>
                 </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 px-3 py-2 border-t border-[#1C1C21] bg-[#111114]/50">
              <div className="flex gap-2 mb-2 items-center text-xs">
                <button onClick={() => setInlineAction('anchor')} className="hover:bg-[#1C1C21] px-2 py-1 rounded text-[#F4F4F5]" title="Change Anchor">⚓</button>
                 <button onClick={() => setInlineAction('language')} className="hover:bg-[#1C1C21] px-2 py-1 rounded text-[#F4F4F5]" title="Language">🌍</button>
                 <button onClick={() => setInlineAction('difficulty')} className="hover:bg-[#1C1C21] px-2 py-1 rounded text-[#F4F4F5]" title="Difficulty">📊</button>
                 <button onClick={() => fireCommand('Refresh Video!')} className="hover:bg-[#1C1C21] px-2 py-1 rounded text-[#F4F4F5]" title="Refresh Video">🔄</button>
                 <button onClick={() => fireCommand('find more practice resources for this chapter')} className="hover:bg-[#1C1C21] px-2 py-1 rounded text-[#F4F4F5]" title="Find Practice Resources">🎯</button>
              </div>

              {inlineAction === 'anchor' && (
                 <div className="flex gap-2 mb-2">
                   <input type="text" placeholder="Channel name..." className="flex-1 bg-[#111114] border border-[#1C1C21] rounded px-2 text-xs text-[#F4F4F5]"
                          onKeyDown={(e) => {
                             if(e.key === 'Enter') fireCommand(`Change anchor channel to ${e.currentTarget.value}`)
                          }} />
                 </div>
              )}
              {inlineAction === 'language' && (
                 <div className="flex gap-2 mb-2">
                   {['English', 'Hindi', 'Spanish', 'French'].map(l => (
                      <button key={l} onClick={() => fireCommand(`Change language to ${l}`)} className="text-xs bg-[#1C1C21] px-2 py-1 rounded text-[#F4F4F5]">{l}</button>
                   ))}
                 </div>
              )}
              {inlineAction === 'difficulty' && (
                 <div className="flex gap-2 mb-2">
                   {['Beginner', 'Intermediate', 'Advanced'].map(d => (
                      <button key={d} onClick={() => fireCommand(`Change difficulty to ${d}`)} className="text-xs bg-[#1C1C21] px-2 py-1 rounded text-[#F4F4F5]">{d}</button>
                   ))}
                 </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Command..."
                  disabled={isLoading}
                  className="flex-1 bg-[#111114] border border-[#1C1C21] rounded px-3 py-2 text-sm text-[#F4F4F5] outline-none focus:border-[#6366F1]"
                />
                <button onClick={() => sendMessage(input)} disabled={!input || isLoading} className="w-9 h-9 flex items-center justify-center bg-[#6366F1] rounded text-white disabled:bg-[#1C1C21]">↑</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
