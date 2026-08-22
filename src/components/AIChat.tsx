"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface Message {
    role: "user" | "assistant";
    content: string;
    image?: string; // For visual explanations
}

interface AIChatProps {
    videoId: string;
    chapterTitle: string;
    moduleTitle: string;
    courseTitle: string;
    getCurrentTime: () => number;
}

export default function AIChat({ videoId, chapterTitle, moduleTitle, courseTitle, getCurrentTime }: AIChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [transcript, setTranscript] = useState<string | null>(null);
    const [transcriptLoading, setTranscriptLoading] = useState(false);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load chat history and fetch transcript
    useEffect(() => {
        if (!videoId) return;

        // Load History
        const saved = localStorage.getItem(`chat_history_${videoId}`);
        if (saved) {
            try {
                setMessages(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load history", e);
                setMessages([]);
            }
        } else {
            setMessages([]);
        }

        // Fetch Transcript
        const fetchTranscript = async () => {
            setTranscriptLoading(true);
            try {
                const res = await fetch(`/api/get-transcript?videoId=${videoId}`);
                if (res.ok) {
                    const data = await res.json();
                    setTranscript(data.fullText);
                    console.log(`📝 Transcript loaded: ${data.wordCount} words`);
                } else {
                    console.warn("⚠️ Transcript not available for this video");
                    setTranscript(null);
                }
            } catch (error) {
                console.error("Transcript fetch failed:", error);
                setTranscript(null);
            } finally {
                setTranscriptLoading(false);
            }
        };

        fetchTranscript();
    }, [videoId]);

    // Save chat history
    useEffect(() => {
        if (videoId && messages.length > 0) {
            localStorage.setItem(`chat_history_${videoId}`, JSON.stringify(messages));
        }
    }, [messages, videoId]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Handle image upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be smaller than 5MB');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64data = reader.result as string;
            setUploadedImage(base64data);

            // Add user message with the screenshot
            const userMessage: Message = {
                role: "user",
                content: "Explain what's in this screenshot",
                image: base64data,
            };
            setMessages((prev) => [...prev, userMessage]);
            setLoading(true);

            try {
                const currentTime = getCurrentTime();
                const res = await fetch("/api/explain-visual", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        imageBase64: base64data,
                        timestamp: currentTime,
                        chapterTitle,
                        moduleTitle,
                        courseTitle,
                        transcriptContext: transcript?.slice(0, 1000),
                    }),
                });

                const data = await res.json();
                const aiMessage: Message = {
                    role: "assistant",
                    content: data.response || "I couldn't analyze this image.",
                };
                setMessages((prev) => [...prev, aiMessage]);
            } catch (error) {
                console.error("Visual explanation error:", error);
                setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "Failed to analyze the screenshot. Try again?" },
                ]);
            } finally {
                setLoading(false);
                setUploadedImage(null);
                // Reset file input
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage: Message = { role: "user", content: input };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch("/api/chat-companion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userQuestion: input,
                    videoTranscript: transcript,
                    chapterTitle,
                    moduleTitle,
                    courseTitle,
                    chatHistory: messages,
                }),
            });

            const data = await res.json();
            const aiMessage: Message = {
                role: "assistant",
                content: data.response || "Sorry, I couldn't process that.",
            };
            setMessages((prev) => [...prev, aiMessage]);
        } catch (error) {
            console.error("Chat error:", error);
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Oops! Something went wrong. Try again?" },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#111114] rounded-lg border border-[#1C1C21]">
            {/* Header */}
            <div className="p-4 border-b border-[#1C1C21]">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-[#F4F4F5] flex items-center gap-2">
                            🤖 AI Companion
                            {transcriptLoading && <span className="text-xs text-gray-500 animate-pulse">(Loading transcript...)</span>}
                            {transcript && <span className="text-xs text-[#6366F1]">✓ Transcript loaded</span>}
                        </h3>
                        <p className="text-xs text-[#3F3F46] mt-1">Ask me anything about this video or concept</p>
                    </div>
                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                            id="screenshot-upload"
                        />
                        <label
                            htmlFor="screenshot-upload"
                            className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#818CF8] text-white rounded-md text-xs font-medium flex items-center gap-1 cursor-pointer" style={{ transition: 'background-color 150ms ease' }}
                            title="Upload a screenshot to explain"
                        >
                            📸 Upload Screenshot
                        </label>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="text-center text-[#3F3F46] text-sm mt-8">
                        <p className="mb-2">👋 Hi! I'm your AI tutor.</p>
                        <p className="text-xs">Try asking:</p>
                        <div className="mt-3 space-y-2">
                            <div className="bg-[#09090B] p-2 rounded-md text-xs text-[#71717A]">
                                "Can you explain this in simpler terms?"
                            </div>
                            <div className="bg-gray-800/50 p-2 rounded text-xs text-gray-400">
                                "What's a real-world example of this?"
                            </div>
                        </div>
                    </div>
                )}

                <AnimatePresence>
                    {messages.map((msg, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === "user"
                                    ? "bg-[#6366F1]/10 text-[#F4F4F5] border border-[#6366F1]/20"
                                    : "bg-[#09090B] text-[#F4F4F5] border border-[#1C1C21]"
                                    }`}
                            >
                                {msg.image && (
                                    <img
                                        src={msg.image}
                                        alt="Screenshot"
                                        className="rounded border border-gray-600 mb-2 max-w-full"
                                    />
                                )}
                                {msg.role === "user" ? (
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                ) : (
                                    <div className="markdown-content">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                h1: ({ children }) => <h1 className="text-lg font-semibold text-[#818CF8] mb-2 mt-4">{children}</h1>,
                                                h2: ({ children }) => <h2 className="text-base font-semibold text-[#818CF8] mb-2 mt-3">{children}</h2>,
                                                h3: ({ children }) => <h3 className="text-sm font-bold text-gray-100 mb-1 mt-2">{children}</h3>,
                                                p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                                                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 ml-1">{children}</ul>,
                                                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-1">{children}</ol>,
                                                li: ({ children }) => <li className="text-gray-300">{children}</li>,
                                                code: ({ children, className }) => {
                                                    const isInline = !className;
                                                    return isInline ? (
                                                        <code className="bg-[#1C1C21] px-1 py-0.5 rounded text-[#818CF8] font-mono text-xs">{children}</code>
                                                    ) : (
                                                        <div className="bg-[#0d1117] p-3 rounded-lg border border-gray-700 my-2 overflow-x-auto">
                                                            <code className="font-mono text-xs text-gray-300 block">{children}</code>
                                                        </div>
                                                    );
                                                },
                                                strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-[#09090B] border border-[#1C1C21] p-3 rounded-lg text-sm text-[#71717A] flex items-center gap-2">
                            <div className="w-2 h-2 bg-[#6366F1] rounded-full animate-pulse"></div>
                            Thinking...
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[#1C1C21]">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder="Ask a question..."
                        disabled={loading}
                        className="flex-1 bg-[#09090B] border border-[#1C1C21] rounded-md px-4 py-2 text-sm text-[#F4F4F5] placeholder-[#3F3F46] focus:outline-none focus:border-[#6366F1] disabled:opacity-50" style={{ transition: 'border-color 150ms ease' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        className="px-4 py-2 bg-[#6366F1] hover:bg-[#818CF8] disabled:bg-[#1C1C21] disabled:cursor-not-allowed text-white rounded-md text-sm font-medium" style={{ transition: 'background-color 150ms ease' }}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
