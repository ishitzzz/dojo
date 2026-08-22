"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BreakVideo {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  url: string;
}

interface BreakPopupProps {
  breakMinutes: number;
  contentGenres: string[];
  onBreakEnd: () => void;
}

// Skeleton card for loading state
function VideoSkeleton() {
  return (
    <div
      className="rounded-lg overflow-hidden animate-pulse"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="aspect-video" style={{ background: "var(--border)" }} />
      <div className="p-3 space-y-2">
        <div className="h-3.5 rounded w-4/5" style={{ background: "var(--border)" }} />
        <div className="h-3 rounded w-3/5" style={{ background: "var(--border)" }} />
      </div>
    </div>
  );
}

export default function BreakPopup({
  breakMinutes,
  contentGenres,
  onBreakEnd,
}: BreakPopupProps) {
  const [videos, setVideos] = useState<BreakVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(breakMinutes * 60);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasEnded = useRef(false);

  const totalBreakSeconds = breakMinutes * 60;
  const breakProgress = breakSecondsLeft / totalBreakSeconds;

  // Format time
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Fetch videos on mount
  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/get-break-videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            genres: contentGenres,
            breakMinutes,
          }),
        });
        const data = await res.json();
        if (data.videos) {
          setVideos(data.videos);
        }
      } catch (err) {
        console.error("Failed to fetch break videos:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [contentGenres, breakMinutes]);

  // Break countdown
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setBreakSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Auto-close when break ends
  const handleBreakEnd = useCallback(() => {
    if (hasEnded.current) return;
    hasEnded.current = true;
    setShowToast(true);
    setTimeout(() => {
      onBreakEnd();
    }, 2000);
  }, [onBreakEnd]);

  useEffect(() => {
    if (breakSecondsLeft === 0) {
      handleBreakEnd();
    }
  }, [breakSecondsLeft, handleBreakEnd]);

  const handleVideoClick = (video: BreakVideo) => {
    setSelectedVideoId(video.videoId);
    window.open(video.url, "_blank", "noopener,noreferrer");
  };

  const handleSkip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onBreakEnd();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 flex flex-col"
        style={{
          background: "rgba(9,9,11,0.95)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 md:px-10 pt-8 pb-4">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-2xl md:text-3xl font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              ☕ Break Time!{" "}
              <span className="font-mono text-lg" style={{ color: "var(--accent)" }}>
                {formatTime(breakSecondsLeft)}
              </span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-sm mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              Choose what to watch — it&apos;ll close automatically when break ends
            </motion.p>
          </div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={handleSkip}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              transition: "background-color 150ms ease, color 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
            }}
          >
            Skip Break →
          </motion.button>
        </div>

        {/* Video Grid */}
        <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-6">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl mx-auto mt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <VideoSkeleton key={i} />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full text-center"
              style={{ color: "var(--text-muted)" }}
            >
              <span className="text-4xl mb-3">🎬</span>
              <p className="text-sm">No videos found for your interests.</p>
              <p className="text-xs mt-1 opacity-60">
                Try adjusting your break preferences in settings.
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl mx-auto mt-4"
            >
              {videos.map((video, index) => (
                <motion.div
                  key={video.videoId}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.06 }}
                  onClick={() => handleVideoClick(video)}
                  className="rounded-lg overflow-hidden cursor-pointer group"
                  style={{
                    background: "var(--bg-card)",
                    border: `1px solid ${
                      selectedVideoId === video.videoId
                        ? "var(--accent)"
                        : "var(--border)"
                    }`,
                    boxShadow:
                      selectedVideoId === video.videoId
                        ? "0 0 0 1px var(--accent), 0 4px 20px rgba(99,102,241,0.15)"
                        : "none",
                    transition: "border-color 150ms ease, box-shadow 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedVideoId !== video.videoId) {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "var(--text-muted)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedVideoId !== video.videoId) {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                    }
                  }}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video overflow-hidden bg-black">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03]"
                      style={{ transition: "transform 200ms ease" }}
                    />
                    {/* Duration badge */}
                    <div
                      className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
                      style={{
                        background: "rgba(0,0,0,0.85)",
                        color: "#fff",
                      }}
                    >
                      {video.duration}
                    </div>
                    {/* Selected overlay */}
                    {selectedVideoId === video.videoId && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: "rgba(99,102,241,0.15)" }}
                      >
                        <span className="text-lg">▶</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3
                      className="text-sm font-semibold line-clamp-2 leading-snug mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {video.title}
                    </h3>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {video.channel}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Bottom progress bar */}
        <div className="px-6 md:px-10 pb-6">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
                Break remaining
              </span>
              <span className="text-[11px] font-mono font-semibold" style={{ color: "var(--accent)" }}>
                {formatTime(breakSecondsLeft)}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--border)" }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: breakProgress > 0.3 ? "var(--accent)" : "#EF4444",
                  width: `${breakProgress * 100}%`,
                  transition: "width 1s linear",
                }}
              />
            </div>
          </div>
        </div>

        {/* Toast: Break over */}
        <AnimatePresence>
          {showToast && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-xl"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--accent)",
                boxShadow: "0 8px 40px rgba(99,102,241,0.2)",
              }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Break over! Back to learning 🎯
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
