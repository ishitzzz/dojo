"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BreakTimerProps {
  focusMinutes: number;
  onBreakStart: () => void;
}

export default function BreakTimer({ focusMinutes, onBreakStart }: BreakTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(focusMinutes * 60);
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggered = useRef(false);

  const totalSeconds = focusMinutes * 60;
  const progress = secondsLeft / totalSeconds;

  // Format time as MM:SS
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Timer tick
  useEffect(() => {
    if (isPaused || secondsLeft <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
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
  }, [isPaused, secondsLeft]);

  // Trigger break when timer hits 0
  useEffect(() => {
    if (secondsLeft === 0 && !hasTriggered.current) {
      hasTriggered.current = true;
      onBreakStart();
    }
  }, [secondsLeft, onBreakStart]);

  const handleReset = useCallback(() => {
    hasTriggered.current = false;
    setSecondsLeft(focusMinutes * 60);
    setIsPaused(false);
  }, [focusMinutes]);

  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // SVG circle parameters
  const size = 44;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  // Urgency color
  const getColor = () => {
    if (progress > 0.5) return "#6366F1"; // indigo
    if (progress > 0.2) return "#F59E0B"; // amber
    return "#EF4444"; // red
  };

  return (
    <div
      className="fixed top-4 right-4 z-40 flex items-center gap-2"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            {/* Pause/Resume */}
            <button
              onClick={handlePauseToggle}
              className="w-7 h-7 flex items-center justify-center rounded-md text-xs"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                transition: "color 150ms ease",
              }}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? "▶" : "⏸"}
            </button>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="w-7 h-7 flex items-center justify-center rounded-md text-xs"
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                transition: "color 150ms ease",
              }}
              title="Reset timer"
            >
              ↺
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Circular timer */}
      <motion.div
        onClick={() => setIsExpanded(!isExpanded)}
        className="relative cursor-pointer flex items-center justify-center"
        style={{
          width: size,
          height: size,
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={`Focus: ${formatTime(secondsLeft)} remaining${isPaused ? " (paused)" : ""}`}
      >
        {/* Background circle */}
        <svg
          width={size}
          height={size}
          className="absolute top-0 left-0"
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getColor()}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 300ms ease" }}
          />
        </svg>

        {/* Center content */}
        <div
          className="flex flex-col items-center justify-center z-10"
          style={{ lineHeight: 1 }}
        >
          {isPaused ? (
            <span className="text-[9px] font-mono font-bold" style={{ color: "var(--text-muted)" }}>
              ⏸
            </span>
          ) : (
            <>
              <span className="text-[8px]" style={{ marginBottom: "1px" }}>🎯</span>
              <span
                className="text-[9px] font-mono font-bold"
                style={{ color: getColor() }}
              >
                {formatTime(secondsLeft)}
              </span>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
