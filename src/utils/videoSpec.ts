export type DurationBand = "short" | "medium" | "long";

// Single source of truth for duration-band thresholds (seconds):
// short < SHORT_MAX_SECONDS; medium spans SHORT_MAX..MEDIUM_MAX inclusive;
// long > MEDIUM_MAX_SECONDS.
export const BAND_RANGES = {
  SHORT_MAX_SECONDS: 240,
  MEDIUM_MAX_SECONDS: 1200,
} as const;

export type VideoStyle = "lecture" | "tutorial" | "documentary" | "deep_dive";

export type VideoDepth = "concept" | "implementation" | "mastery";

export interface VideoSpec {
  targetDurationBand: DurationBand;
  expectedMinutes: [number, number];
  stylePriority: VideoStyle[];
  depth: VideoDepth;
}

export const DEFAULT_VIDEO_SPEC: VideoSpec = {
  targetDurationBand: "medium",
  expectedMinutes: [
    BAND_RANGES.SHORT_MAX_SECONDS / 60,
    BAND_RANGES.MEDIUM_MAX_SECONDS / 60,
  ],
  stylePriority: ["tutorial"],
  depth: "concept",
};

const DURATION_BANDS: readonly DurationBand[] = ["short", "medium", "long"];
const VIDEO_STYLES: readonly VideoStyle[] = ["lecture", "tutorial", "documentary", "deep_dive"];
const VIDEO_DEPTHS: readonly VideoDepth[] = ["concept", "implementation", "mastery"];

const MIN_MINUTES = 1;
const MAX_MINUTES = 240;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: unknown, min: number, max: number): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, num));
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function normalizeVideoSpec(input: unknown): VideoSpec {
  if (!isObject(input)) {
    return { ...DEFAULT_VIDEO_SPEC };
  }

  let expectedMinutes: [number, number] = [...DEFAULT_VIDEO_SPEC.expectedMinutes];
  if (Array.isArray(input.expectedMinutes) && input.expectedMinutes.length >= 2) {
    const low = clamp(input.expectedMinutes[0], MIN_MINUTES, MAX_MINUTES);
    const high = clamp(input.expectedMinutes[1], low, MAX_MINUTES);
    expectedMinutes = [low, high];
  }

  let stylePriority: VideoStyle[] = [];
  if (Array.isArray(input.stylePriority)) {
    stylePriority = input.stylePriority.filter(
      (style): style is VideoStyle =>
        typeof style === "string" && (VIDEO_STYLES as readonly string[]).includes(style)
    );
  }
  if (stylePriority.length === 0) {
    stylePriority = [...DEFAULT_VIDEO_SPEC.stylePriority];
  }

  return {
    targetDurationBand: pickEnum(
      input.targetDurationBand,
      DURATION_BANDS,
      DEFAULT_VIDEO_SPEC.targetDurationBand
    ),
    expectedMinutes,
    stylePriority,
    depth: pickEnum(input.depth, VIDEO_DEPTHS, DEFAULT_VIDEO_SPEC.depth),
  };
}

// Maps a duration band to YouTube Data API search.list `videoDuration` semantics:
// short < 4min, medium 4-20min, long > 20min.
export function bandToApiDuration(band: unknown): DurationBand {
  return pickEnum(band, DURATION_BANDS, "medium");
}
