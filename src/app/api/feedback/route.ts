import { NextResponse } from "next/server";
import { recordRejection } from "@/lib/feedback/rejections";
import { invalidateVideoCaches } from "@/lib/feedback/videoCache";

// ═══════════════════════════════════════════════════════════════
// M4.1 Feedback Store
// POST /api/feedback — record a learner signal for a video.
// GET  /api/feedback?userId=&videoId= — list recorded signals.
// Persists to Supabase when configured; otherwise keeps an in-memory
// fallback so the demo works without cloud.
// ═══════════════════════════════════════════════════════════════

type FeedbackSignal = "watch_pct" | "like" | "dislike" | "reason";

const VALID_SIGNALS: readonly FeedbackSignal[] = [
  "watch_pct",
  "like",
  "dislike",
  "reason",
];

interface FeedbackRow {
  user_id: string;
  video_id: string;
  chapter_key: string | null;
  signal: FeedbackSignal;
  value: string | null;
  created_at?: string;
}

const MEMORY_FEEDBACK: FeedbackRow[] = [];
const MEMORY_CAP = 500;

function pushMemory(row: FeedbackRow): void {
  MEMORY_FEEDBACK.push(row);
  if (MEMORY_FEEDBACK.length > MEMORY_CAP) {
    MEMORY_FEEDBACK.splice(0, MEMORY_FEEDBACK.length - MEMORY_CAP);
  }
}

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
}

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
}

function invalid(message: string) {
  return NextResponse.json({ status: "error", error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("Request body must be valid JSON");
  }

  const b = (body ?? {}) as Record<string, unknown>;

  const videoId = typeof b.videoId === "string" ? b.videoId.trim() : "";
  if (!videoId) {
    return invalid("videoId is required");
  }

  const signal = b.signal;
  if (typeof signal !== "string" || !VALID_SIGNALS.includes(signal as FeedbackSignal)) {
    return invalid(
      `signal is required and must be one of: ${VALID_SIGNALS.join(", ")}`
    );
  }

  const userId =
    typeof b.userId === "string" && b.userId.trim() ? b.userId.trim() : "anonymous";
  const chapterKey =
    typeof b.chapterKey === "string" && b.chapterKey.trim()
      ? b.chapterKey.trim()
      : null;
  const value = typeof b.value === "string" && b.value.length > 0 ? b.value : null;

  const row: FeedbackRow = {
    user_id: userId,
    video_id: videoId,
    chapter_key: chapterKey,
    signal: signal as FeedbackSignal,
    value,
  };

  // Dislike invalidation (M4.1): permanently reject this video for the
  // chapter (or globally when no chapter scope) and purge it from quick
  // cache + vault by video id.
  if (row.signal === "dislike") {
    recordRejection(chapterKey ?? "", "", videoId);
    try {
      await invalidateVideoCaches(videoId);
    } catch (error) {
      console.warn("⚠️ Dislike cache invalidation failed:", error);
    }
  }

  let persisted: "memory" | "supabase" = "memory";
  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.from("video_feedback").insert({
        user_id: row.user_id,
        video_id: row.video_id,
        chapter_key: row.chapter_key,
        signal: row.signal,
        value: row.value,
      });
      if (error) {
        throw error;
      }
      persisted = "supabase";
    } catch (error) {
      console.warn("⚠️ Supabase feedback insert failed, using memory:", error);
    }
  }

  if (persisted === "memory") {
    pushMemory(row);
  }

  return NextResponse.json({ status: "ok", persisted });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const videoId = searchParams.get("videoId");

  if (!userId && !videoId) {
    return NextResponse.json(
      { status: "error", error: "Provide ?userId= and/or ?videoId=" },
      { status: 400 }
    );
  }

  let signals: FeedbackRow[] = [];

  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabase();
      let query = supabase.from("video_feedback").select("*");
      if (userId) {
        query = query.eq("user_id", userId);
      }
      if (videoId) {
        query = query.eq("video_id", videoId);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        throw error;
      }
      signals = (data ?? []) as FeedbackRow[];
    } catch (error) {
      console.warn("⚠️ Supabase feedback fetch failed, falling back to memory:", error);
    }
  }

  if (signals.length === 0) {
    signals = MEMORY_FEEDBACK.filter(
      (r) =>
        (!userId || r.user_id === userId) && (!videoId || r.video_id === videoId)
    ).reverse();
  }

  return NextResponse.json({ status: "ok", count: signals.length, signals });
}
