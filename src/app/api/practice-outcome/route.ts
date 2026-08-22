import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════
// M7.1 Practice loop — outcome recording (platform side, 2/2)
// POST /api/practice-outcome {planId required, outcome, note?}
//
// Closes the EXECUTE_GUIDANCE ↔ STEP_OUTCOME loop: the extension's
// guide controller reports completed / stalled / skipped for a plan
// issued by GET /api/practice-plan. Rows persist to Supabase table
// `practice_progress` when configured (dynamic import pattern, same
// as videoVault storeInSupabase); otherwise a capped in-memory array
// keeps the demo working without cloud.
// ═══════════════════════════════════════════════════════════════

type PracticeOutcome = "completed" | "stalled" | "skipped";

const VALID_OUTCOMES: readonly PracticeOutcome[] = [
  "completed",
  "stalled",
  "skipped",
];

interface ProgressRow {
  plan_id: string;
  user_id: string;
  topic: string | null;
  chapter_title: string | null;
  outcome: PracticeOutcome;
  note: string | null;
}

const MEMORY_PROGRESS: ProgressRow[] = [];
const MEMORY_CAP = 500;
const NOTE_MAX = 500;

interface PlanStore {
  __dojoPracticePlans?: Map<
    string,
    { topic: string; chapterTitle: string }
  >;
}

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
}

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
}

/** Resolve a plan emitted by /api/practice-plan (globalThis-shared map). */
function findPlan(planId: string): { topic: string; chapterTitle: string } | null {
  const plans = (globalThis as unknown as PlanStore).__dojoPracticePlans;
  if (!plans) return null;
  const plan = plans.get(planId);
  return plan ? { topic: plan.topic, chapterTitle: plan.chapterTitle } : null;
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

  const planId = typeof b.planId === "string" ? b.planId.trim() : "";
  if (!planId) {
    return invalid("planId is required");
  }

  const outcome = b.outcome;
  if (
    typeof outcome !== "string" ||
    !VALID_OUTCOMES.includes(outcome as PracticeOutcome)
  ) {
    return invalid(
      `outcome is required and must be one of: ${VALID_OUTCOMES.join(", ")}`
    );
  }

  const userId =
    typeof b.userId === "string" && b.userId.trim() ? b.userId.trim() : "anonymous";
  const note =
    typeof b.note === "string" && b.note.trim()
      ? b.note.trim().slice(0, NOTE_MAX)
      : null;

  // Plans created before this server process started (or evicted) still get
  // recorded — the loop must not lose signals across dev-server restarts.
  const knownPlan = findPlan(planId);

  const row: ProgressRow = {
    plan_id: planId,
    user_id: userId,
    topic: knownPlan?.topic ?? (typeof b.topic === "string" && b.topic.trim() ? b.topic.trim() : null),
    chapter_title:
      knownPlan?.chapterTitle ??
      (typeof b.chapterTitle === "string" && b.chapterTitle.trim()
        ? b.chapterTitle.trim()
        : null),
    outcome: outcome as PracticeOutcome,
    note,
  };

  let persisted: "memory" | "supabase" = "memory";
  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.from("practice_progress").insert({
        plan_id: row.plan_id,
        user_id: row.user_id,
        topic: row.topic,
        chapter_title: row.chapter_title,
        outcome: row.outcome,
        note: row.note,
      });
      if (error) {
        throw error;
      }
      persisted = "supabase";
    } catch (error) {
      console.warn("⚠️ Supabase practice_progress insert failed, using memory:", error);
    }
  }

  if (persisted === "memory") {
    MEMORY_PROGRESS.push(row);
    if (MEMORY_PROGRESS.length > MEMORY_CAP) {
      MEMORY_PROGRESS.splice(0, MEMORY_PROGRESS.length - MEMORY_CAP);
    }
  }

  return NextResponse.json({ status: "ok", persisted });
}
