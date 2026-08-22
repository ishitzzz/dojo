"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: (e?: React.MouseEvent) => void;
  toggleEvent: { x: number; y: number } | null;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
  toggleEvent: null,
});

/** Read stored or system preference — safe to call on the client only. */
function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  // Fall back to system preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Applies or removes the `dark` class on <html> and persists to localStorage. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem("theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with "dark" (SSR-safe default matching your existing dark design)
  const [theme, setTheme] = useState<Theme>("dark");
  const [toggleEvent, setToggleEvent] = useState<{x: number, y: number} | null>(null);

  // Hydrate from localStorage / system preference on mount
  useEffect(() => {
    const initial = resolveInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = useCallback((e?: React.MouseEvent) => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });

    if (e && typeof e.clientX === 'number') {
      setToggleEvent({ x: e.clientX, y: e.clientY });
    } else {
      setToggleEvent(null);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, toggleEvent }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Hook to consume theme context anywhere in the tree. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
