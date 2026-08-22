"use client";

import { useTheme } from "./ThemeProvider";

/** Sun icon SVG */
function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1"  x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1"  y1="12" x2="3"  y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22" />
    </svg>
  );
}

/** Moon icon SVG */
function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface ThemeToggleProps {
  /**
   * standalone=true → renders inline (not fixed), styled for landing overlay.
   * sidebar=true    → renders inline, styled for the dark sidebar.
   * default (both false) → renders as fixed top-right button.
   */
  standalone?: boolean;
  sidebar?: boolean;
}

/**
 * ThemeToggle — switches between sun (light) and moon (dark) icons.
 * When `standalone` is false (default), it renders fixed top-right via the root layout.
 * When `standalone` is true, it renders inline (caller controls position).
 */
export default function ThemeToggle({ standalone = false, sidebar = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const sharedStyle: React.CSSProperties = {
    width: "40px",
    height: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 150ms ease, color 150ms ease, border-color 150ms ease",
  };

  const fixedStyle: React.CSSProperties = standalone
    ? {
        ...sharedStyle,
        background: "rgba(255,255,255,0.10)",
        color: "rgba(255,255,255,0.80)",
        border: "1px solid rgba(255,255,255,0.22)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }
    : sidebar
    ? {
        ...sharedStyle,
        background: "transparent",
        color: "var(--text-secondary)",
        border: "1px solid var(--border)",
      }
    : {
        ...sharedStyle,
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: 9999,
        background: "var(--bg-card)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border)",
      };

  return (
    <button
      id={standalone ? "theme-toggle-standalone" : sidebar ? "theme-toggle-sidebar" : "theme-toggle"}
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={standalone ? "theme-toggle-standalone" : sidebar ? "theme-toggle-sidebar" : "theme-toggle-fixed"}
      style={fixedStyle}
    >
      {/* key forces re-mount so scale-in fires on every toggle */}
      <span className="scale-in" key={theme}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}
