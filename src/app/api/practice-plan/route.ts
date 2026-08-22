import { NextResponse } from "next/server";
import { generateContentWithFailover } from "@/utils/gemini";
import { safeParseJsonObject } from "@/utils/safeJsonParser";

// ═══════════════════════════════════════════════════════════════
// M7.1 Practice loop — plan emission (platform side, 1/2)
// GET /api/practice-plan?topic=&chapterTitle=&url=
//
// Emits a SINGLE-STEP PracticePlan for the EXECUTE_GUIDANCE ↔
// STEP_OUTCOME closed loop. The instruction is generated via one
// Gemini call (JSON mode) with a deterministic terminal-exercise
// fallback when no key is configured or generation fails.
// Plans live in a process-local Map (cap 200, oldest evicted) so
// /api/practice-outcome can resolve them; shared with that route
// via globalThis to survive Next.js dev HMR module duplication.
// ═══════════════════════════════════════════════════════════════

type SuccessSignal = "click" | "input";

interface PracticeStep {
  index: number;
  instruction: string;
  targetHint: string;
  successSignal: SuccessSignal;
  url?: string;
}

interface PracticePlan {
  planId: string;
  step: PracticeStep;
  createdAt: string;
  topic: string;
  chapterTitle: string;
}

interface PlanStore {
  __dojoPracticePlans?: Map<string, PracticePlan>;
}

const globalStore = globalThis as unknown as PlanStore;

function getPracticePlans(): Map<string, PracticePlan> {
  if (!globalStore.__dojoPracticePlans) {
    globalStore.__dojoPracticePlans = new Map();
  }
  return globalStore.__dojoPracticePlans;
}

const PLAN_CAP = 200;
const INSTRUCTION_MAX = 240;

function rememberPlan(plan: PracticePlan): void {
  const plans = getPracticePlans();
  plans.set(plan.planId, plan);
  if (plans.size > PLAN_CAP) {
    const oldestKey = plans.keys().next().value;
    if (oldestKey !== undefined) {
      plans.delete(oldestKey);
    }
  }
}

function normalizeSignal(raw: unknown): SuccessSignal {
  return raw === "input" ? "input" : "click";
}

function fallbackDraft(title: string): {
  instruction: string;
  targetHint: string;
  successSignal: SuccessSignal;
} {
  return {
    instruction: `Open your terminal and run one real command practicing: ${title}`,
    targetHint: "your terminal",
    successSignal: "input",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = (searchParams.get("topic") || "").trim();
  const chapterTitle = (searchParams.get("chapterTitle") || "").trim();

  if (!topic && !chapterTitle) {
    return NextResponse.json(
      { status: "error", error: "Provide ?topic= and/or ?chapterTitle=" },
      { status: 400 }
    );
  }

  const title = chapterTitle || topic;
  let draft = fallbackDraft(title);
  let source: "gemini" | "fallback" = "fallback";

  try {
    const prompt =
      `Generate ONE concrete hands-on exercise for "${title}"` +
      (topic && topic !== title ? ` of the topic "${topic}"` : "") +
      `, phrased as an imperative the learner performs in their own tool.\n` +
      `Return ONLY JSON: {"instruction": "...", "targetHint": "...", "successSignal": "click" | "input"}\n` +
      `- instruction: max 140 chars, starts with a verb, doable in under two minutes.\n` +
      `- targetHint: short place hint like "your terminal" or "the settings page".\n` +
      `- successSignal: "input" when the exercise centers on typing/writing something, otherwise "click".`;

    const result = await generateContentWithFailover(prompt, {
      responseMimeType: "application/json",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = safeParseJsonObject<any>(result.text);
    const instruction =
      typeof parsed?.instruction === "string" ? parsed.instruction.trim() : "";

    if (instruction) {
      draft = {
        instruction: instruction.slice(0, INSTRUCTION_MAX),
        targetHint:
          typeof parsed?.targetHint === "string" && parsed.targetHint.trim()
            ? parsed.targetHint.trim().slice(0, 120)
            : draft.targetHint,
        successSignal: normalizeSignal(parsed?.successSignal),
      };
      source = "gemini";
    }
  } catch (error) {
    console.warn("⚠️ practice-plan Gemini generation failed, using fallback:", error);
  }

  // Optional practice-surface URL passthrough (validated http/https only).
  let url: string | undefined;
  const urlRaw = (searchParams.get("url") || "").trim();
  if (urlRaw) {
    try {
      const parsedUrl = new URL(urlRaw);
      if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
        url = parsedUrl.toString();
      }
    } catch {
      /* ignore malformed urls */
    }
  }

  const step: PracticeStep = {
    index: 0,
    instruction: draft.instruction,
    targetHint: draft.targetHint,
    successSignal: draft.successSignal,
    ...(url ? { url } : {}),
  };

  const plan: PracticePlan = {
    planId: crypto.randomUUID(),
    step,
    createdAt: new Date().toISOString(),
    topic,
    chapterTitle,
  };

  rememberPlan(plan);

  return NextResponse.json({
    status: "ok",
    source,
    planId: plan.planId,
    step: plan.step,
    createdAt: plan.createdAt,
  });
}
