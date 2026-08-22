"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ═══════════════════════════════════════════════════════════════
// TutorChat — collapsible side-panel tutor docked in Workspace.
//
// Streams POST /api/turn SSE directly (frames of `data: {json}\n\n`):
//   SESSION → (TOOL_CALL → TOOL_RESULT)* → CONTENT* → RESULT → DONE
// sessionId is captured from the first SESSION event and reused for
// every later turn in this workspace session; prior messages ride
// along as [{ role, content }] capped to the last 12 entries.
// ═══════════════════════════════════════════════════════════════

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface TurnEventLike {
    type: string;
    stage?: string;
    content?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
}

interface TutorChatDockProps {
    open: boolean;
    onToggle: () => void;
}

const HISTORY_CAP = 12;

const SUGGESTIONS = [
    "Explain this in simpler terms",
    "Find me a video about this",
    "Give me a real-world example",
];

function humanizeToolName(name: string): string {
    return name.replace(/_/g, " ");
}

// TOOL_CALL events carry metadata:{name,args} (TurnBus.toolCall).
// Map the known brain tool to friendly copy; everything else gets a
// generic working label. TOOL_RESULT is intentionally never rendered.
function toolCallLabel(event: TurnEventLike): string {
    const name =
        typeof event.metadata?.name === "string" ? (event.metadata.name as string) : "";
    if (name === "find_video") return "🔎 searching videos…";
    if (name) return `⚙️ ${humanizeToolName(name)}…`;
    if (event.stage) return `⚙️ ${event.stage}…`;
    return "⚙️ working…";
}

export default function TutorChatDock({ open, onToggle }: TutorChatDockProps) {
    return (
        <>
            <section
                aria-label="Tutor Chat"
                className={`${open ? "hidden lg:flex" : "hidden"} flex-col shrink-0 w-[300px] xl:w-[340px] rounded-lg overflow-hidden fade-in`}
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
                {/* Header — same vocabulary/weight as companion tab bar */}
                <div
                    className="flex items-center justify-between px-4 py-2.5 shrink-0"
                    style={{ borderBottom: "1px solid var(--border)" }}
                >
                    <h2
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--accent)" }}
                    >
                        🎓 Tutor Chat
                    </h2>
                    <button
                        onClick={onToggle}
                        title="Close Tutor Chat"
                        aria-label="Close Tutor Chat"
                        className="text-sm active:scale-[0.97] hover-text-primary"
                        style={{ color: "var(--text-muted)" }}
                    >
                        ✕
                    </button>
                </div>
                <TutorChat />
            </section>

            {/* Slim vertical toggle strip — always visible on desktop */}
            <button
                onClick={onToggle}
                aria-expanded={open}
                title={open ? "Hide Tutor Chat" : "Show Tutor Chat"}
                className="hidden lg:flex items-center justify-center shrink-0 w-9 rounded-lg active:scale-[0.98] hover-text-primary transition-colors"
                style={{
                    background: open ? "var(--accent-soft)" : "var(--bg-card)",
                    border: `1px solid ${open ? "var(--accent)" : "var(--border)"}`,
                    color: open ? "var(--accent)" : "var(--text-muted)",
                }}
            >
                <span
                    className="text-[11px] font-semibold uppercase"
                    style={{ writingMode: "vertical-rl", letterSpacing: "0.18em" }}
                >
                    💬 Tutor
                </span>
            </button>
        </>
    );
}

function TutorChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const [waitingFirst, setWaitingFirst] = useState(false);
    const [toolChips, setToolChips] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const sessionIdRef = useRef<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const endRef = useRef<HTMLDivElement>(null);

    // Abort any in-flight turn when the panel unmounts.
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    // Auto-scroll to bottom as content arrives.
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, toolChips, waitingFirst, error]);

    const appendAssistantDelta = useCallback((delta: string) => {
        setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
                return [
                    ...prev.slice(0, -1),
                    { role: "assistant" as const, content: last.content + delta },
                ];
            }
            return [...prev, { role: "assistant" as const, content: delta }];
        });
    }, []);

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || streaming) return;

        // History = context BEFORE this message; server appends the new
        // user message itself inside runAgentLoop.
        const history = messages
            .filter((m) => m.content.trim().length > 0)
            .slice(-HISTORY_CAP)
            .map((m) => ({ role: m.role, content: m.content }));

        setInput("");
        setError(null);
        setToolChips([]);
        setStreaming(true);
        setWaitingFirst(true);
        setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch("/api/turn", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: trimmed,
                    ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
                    ...(history.length > 0 ? { history } : {}),
                }),
                signal: controller.signal,
            });

            if (!res.ok || !res.body) {
                throw new Error(`Tutor service unavailable (${res.status})`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let sawDone = false;

            const processFrame = (frame: string) => {
                const dataLines = frame
                    .split("\n")
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trimStart());
                if (dataLines.length === 0) return;

                let event: TurnEventLike;
                try {
                    event = JSON.parse(dataLines.join("\n")) as TurnEventLike;
                } catch {
                    return; // ignore malformed frames rather than kill the stream
                }

                switch (event.type) {
                    case "SESSION": {
                        if (typeof event.sessionId === "string" && event.sessionId) {
                            sessionIdRef.current = event.sessionId;
                        }
                        break;
                    }
                    case "CONTENT": {
                        if (typeof event.content === "string" && event.content.length > 0) {
                            setWaitingFirst(false);
                            appendAssistantDelta(event.content);
                        }
                        break;
                    }
                    case "TOOL_CALL": {
                        const label = toolCallLabel(event);
                        setToolChips((prev) =>
                            prev[prev.length - 1] === label ? prev : [...prev, label]
                        );
                        break;
                    }
                    case "ERROR": {
                        throw new Error(event.content || "The tutor hit an unexpected error.");
                    }
                    case "DONE": {
                        sawDone = true;
                        break;
                    }
                    default:
                        break;
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split("\n\n");
                buffer = frames.pop() ?? "";
                for (const frame of frames) processFrame(frame);
            }
            if (buffer.trim().length > 0) processFrame(buffer);

            if (!sawDone) {
                throw new Error("Connection closed before the tutor finished responding.");
            }
        } catch (e) {
            if (!(e instanceof DOMException && e.name === "AbortError")) {
                setError(
                    e instanceof Error ? e.message : "Something went wrong talking to the tutor."
                );
            }
        } finally {
            setStreaming(false);
            setWaitingFirst(false);
            setToolChips([]);
            abortRef.current = null;
        }
    };

    const visibleMessages = messages.filter(
        (m) => m.role === "user" || m.content.trim().length > 0 || streaming
    );

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {visibleMessages.length === 0 && !waitingFirst && (
                    <div className="text-center mt-6 px-2">
                        <p className="text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                            👋 Hi! I&apos;m your tutor.
                        </p>
                        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                            Ask anything about this chapter:
                        </p>
                        <div className="space-y-2">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setInput(s)}
                                    disabled={streaming}
                                    className="w-full text-left text-xs p-2 rounded-md option-btn-hover disabled:opacity-50"
                                    style={{
                                        background: "var(--bg-primary)",
                                        border: "1px solid var(--border)",
                                        color: "var(--text-secondary)",
                                    }}
                                >
                                    &ldquo;{s}&rdquo;
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {visibleMessages.map((msg, i) =>
                    msg.role === "assistant" && msg.content.trim().length === 0 ? null : (
                        <div
                            key={i}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[85%] p-2.5 rounded-lg text-sm ${
                                    msg.role === "user" ? "whitespace-pre-wrap" : ""
                                }`}
                                style={
                                    msg.role === "user"
                                        ? {
                                              background: "var(--accent-soft)",
                                              color: "var(--text-primary)",
                                              border: "1px solid transparent",
                                          }
                                        : {
                                              background: "var(--bg-primary)",
                                              color: "var(--text-primary)",
                                              border: "1px solid var(--border)",
                                          }
                                }
                            >
                                {msg.role === "user" ? (
                                    msg.content
                                ) : (
                                    <div className="markdown-content text-sm">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                p: ({ children }) => (
                                                    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                                                ),
                                                ul: ({ children }) => (
                                                    <ul className="list-disc list-inside mb-2 space-y-1 ml-1">{children}</ul>
                                                ),
                                                ol: ({ children }) => (
                                                    <ol className="list-decimal list-inside mb-2 space-y-1 ml-1">{children}</ol>
                                                ),
                                                li: ({ children }) => (
                                                    <li className="leading-relaxed">{children}</li>
                                                ),
                                                strong: ({ children }) => (
                                                    <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>
                                                        {children}
                                                    </strong>
                                                ),
                                                code: ({ children, className }) =>
                                                    !className ? (
                                                        <code
                                                            className="font-mono text-xs px-1 py-0.5 rounded"
                                                            style={{ background: "var(--bg-card)", color: "var(--accent)" }}
                                                        >
                                                            {children}
                                                        </code>
                                                    ) : (
                                                        <pre
                                                            className="p-2.5 rounded-md my-1.5 overflow-x-auto"
                                                            style={{
                                                                background: "var(--bg-card)",
                                                                border: "1px solid var(--border)",
                                                            }}
                                                        >
                                                            <code className="font-mono text-xs">{children}</code>
                                                        </pre>
                                                    ),
                                                pre: ({ children }) => <>{children}</>,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                )}

                {/* Typing indicator until first CONTENT delta */}
                {waitingFirst && (
                    <div className="flex justify-start">
                        <div
                            className="p-2.5 rounded-lg text-sm flex items-center gap-2 animate-pulse"
                            style={{
                                background: "var(--bg-primary)",
                                border: "1px solid var(--border)",
                                color: "var(--text-muted)",
                            }}
                        >
                            <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                            Thinking…
                        </div>
                    </div>
                )}

                {/* Inline tool activity chips (TOOL_CALL only, cleared on DONE) */}
                {toolChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-1">
                        {toolChips.map((label, i) => (
                            <span
                                key={`${label}-${i}`}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px]"
                                style={{
                                    background: "var(--bg-primary)",
                                    border: "1px solid var(--border)",
                                    color: "var(--text-muted)",
                                }}
                            >
                                {label}
                            </span>
                        ))}
                    </div>
                )}

                {/* Inline error row — never silent, never alert() */}
                {error && (
                    <div
                        role="alert"
                        className="p-2.5 rounded-md text-xs"
                        style={{
                            background: "rgba(239,68,68,0.05)",
                            border: "1px solid rgba(239,68,68,0.25)",
                            color: "#EF4444",
                        }}
                    >
                        ⚠ {error}
                    </div>
                )}

                <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="p-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSend();
                        }}
                        placeholder={streaming ? "Tutor is responding…" : "Ask your tutor…"}
                        disabled={streaming}
                        aria-label="Message the tutor"
                        className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm outline-none disabled:opacity-50 focus:border-[var(--accent)] bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                    <button
                        onClick={() => void handleSend()}
                        disabled={streaming || !input.trim()}
                        className="px-3 py-2 rounded-md text-sm font-medium text-white active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none bg-[#6366F1] hover:bg-[#5558E3] transition-colors"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
