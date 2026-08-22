/**
 * Global design-token helpers.
 * All color references should derive from CSS variables defined in globals.css.
 */

/** The primary accent color CSS variable (resolves from theme). */
export const ACCENT_COLOR = "var(--accent)";
export const ACCENT_HOVER  = "var(--accent-hover)";
export const ACCENT_SOFT   = "var(--accent-soft)";

/** Tailwind-style inline-style helpers using CSS vars. */
export const themeColors = {
  bgPrimary:     "var(--bg-primary)",
  bgSecondary:   "var(--bg-secondary)",
  bgCard:        "var(--bg-card)",
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted:     "var(--text-muted)",
  accent:        "var(--accent)",
  accentHover:   "var(--accent-hover)",
  accentSoft:    "var(--accent-soft)",
  border:        "var(--border)",
  borderHover:   "var(--border-hover)",
} as const;

/**
 * Returns a Tailwind `className` string for common card styling.
 * Use this so every card shares the same look.
 */
export function cardClass(extra = ""): string {
  return `bg-[var(--bg-card)] border border-[var(--border)] rounded-lg ${extra}`.trim();
}

/**
 * Returns a className string for primary accent buttons.
 */
export function accentButtonClass(extra = ""): string {
  return `bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium rounded-md active:scale-[0.97] transition-all duration-150 ${extra}`.trim();
}

/**
 * Returns a className string for ghost/secondary buttons.
 */
export function ghostButtonClass(extra = ""): string {
  return `border border-[var(--border)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium rounded-md active:scale-[0.97] transition-all duration-150 ${extra}`.trim();
}
