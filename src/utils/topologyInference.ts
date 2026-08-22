import { generateContentWithFailover } from "@/utils/gemini";
import { safeParseJsonObject } from "@/utils/safeJsonParser";

export interface LearningTopology {
  structure: "sequential" | "web" | "cyclical" | "layered";
  primaryMode: "skill" | "understanding" | "exploration" | "creation";
  contentNature: "technical" | "narrative" | "conceptual" | "procedural" | "experiential";
  hasCanonicalPath: boolean;
  timeDependent: boolean;
  bestEntryStrategy: "start_anywhere" | "strict_sequence" | "pick_your_thread";
  videoStylePriority: Array<"tutorial" | "documentary" | "lecture" | "demonstration" | "debate">;
  suggestedNodeCount: number;
  suggestedDepth: "shallow_wide" | "deep_narrow" | "balanced";
}

const DEFAULT_TOPOLOGY: LearningTopology = {
  structure: "web",
  primaryMode: "understanding",
  contentNature: "conceptual",
  hasCanonicalPath: false,
  timeDependent: false,
  bestEntryStrategy: "pick_your_thread",
  videoStylePriority: ["lecture", "documentary", "tutorial"],
  suggestedNodeCount: 3,
  suggestedDepth: "balanced",
};

const topologyCache = new Map<string, LearningTopology>();

function cacheKeyFor(query: string): string {
  return query.trim().toLowerCase();
}

function isLearningTopology(value: unknown): value is LearningTopology {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  const validStructures = new Set(["sequential", "web", "cyclical", "layered"]);
  const validPrimaryModes = new Set(["skill", "understanding", "exploration", "creation"]);
  const validContentNature = new Set(["technical", "narrative", "conceptual", "procedural", "experiential"]);
  const validEntryStrategies = new Set(["start_anywhere", "strict_sequence", "pick_your_thread"]);
  const validVideoStyles = new Set(["tutorial", "documentary", "lecture", "demonstration", "debate"]);
  const validDepth = new Set(["shallow_wide", "deep_narrow", "balanced"]);

  const structureOk = typeof v.structure === "string" && validStructures.has(v.structure);
  const primaryModeOk = typeof v.primaryMode === "string" && validPrimaryModes.has(v.primaryMode);
  const contentNatureOk = typeof v.contentNature === "string" && validContentNature.has(v.contentNature);
  const hasCanonicalPathOk = typeof v.hasCanonicalPath === "boolean";
  const timeDependentOk = typeof v.timeDependent === "boolean";
  const bestEntryStrategyOk = typeof v.bestEntryStrategy === "string" && validEntryStrategies.has(v.bestEntryStrategy);

  const videoStylePriorityOk =
    Array.isArray(v.videoStylePriority) &&
    v.videoStylePriority.length > 0 &&
    v.videoStylePriority.every(
      (item) => typeof item === "string" && validVideoStyles.has(item)
    );

  const suggestedNodeCountOk =
    typeof v.suggestedNodeCount === "number" &&
    Number.isInteger(v.suggestedNodeCount) &&
    v.suggestedNodeCount >= 2 &&
    v.suggestedNodeCount <= 5;

  const suggestedDepthOk = typeof v.suggestedDepth === "string" && validDepth.has(v.suggestedDepth);

  return (
    structureOk &&
    primaryModeOk &&
    contentNatureOk &&
    hasCanonicalPathOk &&
    timeDependentOk &&
    bestEntryStrategyOk &&
    videoStylePriorityOk &&
    suggestedNodeCountOk &&
    suggestedDepthOk
  );
}

export async function inferTopology(query: string): Promise<LearningTopology> {
  const key = cacheKeyFor(query);

  if (topologyCache.has(key)) {
    return topologyCache.get(key)!;
  }

  const prompt = `Analyze this learning topic and return its natural learning topology as JSON.
Topic: '${query}'

Return ONLY this JSON, no explanation:
{
  structure: 'sequential' if knowledge must be learned in order (A before B), 
             'web' if concepts connect in all directions,
             'cyclical' if learners revisit earlier ideas with new depth,
             'layered' if same concepts appear at increasing complexity,
  primaryMode: 'skill' if goal is to DO something,
               'understanding' if goal is to KNOW something,
               'exploration' if goal is to DISCOVER connections,
               'creation' if goal is to MAKE something,
  contentNature: 'technical' if precise and rule-based,
                 'narrative' if stories and context matter,
                 'conceptual' if abstract ideas dominate,
                 'procedural' if steps and sequences dominate,
                 'experiential' if it must be practiced to be understood,
  hasCanonicalPath: true if a standard curriculum exists, false otherwise,
  timeDependent: true if WHEN things happened matters to understanding,
  bestEntryStrategy: 'strict_sequence' if there is one right starting point,
                     'pick_your_thread' if multiple valid entry points exist,
                     'start_anywhere' if truly non-linear,
  videoStylePriority: ordered array of best content formats for this topic,
                      choose from: tutorial, documentary, lecture, demonstration, debate,
  suggestedNodeCount: integer 2-5, how many initial exploration nodes make sense,
  suggestedDepth: 'shallow_wide' for broad overview topics,
                  'deep_narrow' for focused skill topics,
                  'balanced' for most topics
}`;

  try {
    const result = await generateContentWithFailover(prompt, {
      responseMimeType: "application/json",
      temperature: 0.2,
    });

    const parsed = safeParseJsonObject<LearningTopology>(result.text);

    if (!parsed || !isLearningTopology(parsed)) {
      topologyCache.set(key, DEFAULT_TOPOLOGY);
      return DEFAULT_TOPOLOGY;
    }

    topologyCache.set(key, parsed);
    return parsed;
  } catch {
    topologyCache.set(key, DEFAULT_TOPOLOGY);
    return DEFAULT_TOPOLOGY;
  }
}
