import { generateContentWithFailover } from "@/utils/gemini";
import { BACKUP_ROADMAPS } from "@/data/backupRoadmaps";
import { NextResponse } from "next/server";
import { safeParseJsonObject } from "@/utils/safeJsonParser";
import { inferTopology } from "@/utils/topologyInference";

function extractTopicsFromSkeleton(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): string[] {
  if (!Array.isArray(data?.modules)) return [];

  const topics: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const moduleItem of data.modules as any[]) {
    if (!Array.isArray(moduleItem?.chapters)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const chapter of moduleItem.chapters as any[]) {
      const topic = (chapter?.youtubeQuery || chapter?.chapterTitle || "").trim();
      if (topic) topics.push(topic);
    }
  }

  return topics;
}

// ═══════════════════════════════════════════════════════════════
// WEB CONTEXT (Keep for grounding)
// ═══════════════════════════════════════════════════════════════
async function getWebContext(query: string) {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();
    const snippetRegex = /class="result__snippet"[^>]*>(.*?)<\/a>/g;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    let match; let count = 0;
    while ((match = snippetRegex.exec(html)) !== null && count < 3) { results.push(match[1].replace(/<[^>]*>/g, "")); count++; }
    return results.join("\n- ");
  } catch (_e) { return ""; }
}

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};

  try {
    body = await req.json();
    const {
      userGoal,
      goal,
      domainType,
      priorKnowledge,
      timeContext,
      successDefinition,
      mode = "skeleton",
      moduleContext,
      nexusOrigin,
      nexusTrail,
    } = body as {
      userGoal: string;
      goal?: string;
      domainType?: string;
      priorKnowledge?: string;
      timeContext?: string | { type: string; date: string };
      successDefinition?: string;
      mode?: string;
      moduleContext?: { moduleTitle?: string; previousModuleTitle?: string; moduleIndex?: number };
      nexusOrigin?: string;
      nexusTrail?: string;
    };

    // Build learner profile from context signals
    const timeStr = typeof timeContext === 'object' && timeContext?.date
      ? `Deadline: ${timeContext.date}`
      : timeContext === 'open-ended' ? 'No deadline — learning at their own pace' : 'No time constraint specified';
    const learnerProfile = [
      goal ? `GOAL: ${goal}` : null,
      domainType ? `DOMAIN: ${domainType}` : null,
      priorKnowledge ? `PRIOR KNOWLEDGE: ${priorKnowledge}` : null,
      `TIME: ${timeStr}`,
      successDefinition ? `SUCCESS LOOKS LIKE: ${successDefinition}` : null,
    ].filter(Boolean).join('\n        ');

    let prompt = "";

    // ═══════════════════════════════════════════════════════════════
    // MODE 1: SKELETON GENERATION (Global Architecture)
    // ═══════════════════════════════════════════════════════════════
    if (mode === "skeleton") {
      const topology = await inferTopology(userGoal);
      const webContext = await getWebContext(userGoal);
      const hasNexusContext = nexusTrail && nexusTrail.trim().length > 0;
      const trailConcepts = hasNexusContext
        ? nexusTrail.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      const nexusContextBlock = trailConcepts.length > 0
        ? `
        NEXUS CONTEXT — this is critical, do not ignore it:
        This learner was freely exploring a knowledge graph before requesting
        this course. They were not following a curriculum — they were
        following their curiosity.

        Their original curiosity started at: "${nexusOrigin || "unknown"}"
        Concepts they have already encountered and have some intuition about:
${trailConcepts.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}

        RULES based on this context:
        1. Do NOT start Module 1 as if they know nothing.
           They have encountered these concepts already, even if informally.
        2. Do NOT dedicate a full module to any concept already in their trail.
           If it appears, acknowledge it briefly and move forward.
        3. The narrativeBridge of Module 1 MUST explicitly reference where
           they came from. Start with something like:
           "You've been exploring ${nexusOrigin || "this topic"} —
           now let's go underneath what you've seen..."
        4. The overall tone should feel like continuing a conversation,
           not starting a lecture.
        5. For anchorChannel: prefer creators known for depth and genuine
           intellectual engagement over pure step-by-step tutorial channels.
        `
        : "";

      prompt = `
        You are a "First Principles" Knowledge Architect building a CONTINUOUS learning path.
        
        GOAL: Create an "Evolutionary Chain" for: "${userGoal}"
        WEB CONTEXT: ${webContext}

        LEARNER PROFILE:
        ${learnerProfile || 'No detailed profile available — use general approach.'}

        TASK: Generate the COURSE ARCHITECTURE (Skeleton).
        
        CRITICAL OPTIMIZATION (Warm Start):
        To save the user time, you MUST fully generate the chapters for MODULE 1 and MODULE 2 immediately.
        For Module 3 onwards, generate ONLY the title and description (Skeleton).

        CRITICAL RULE - CONTINUITY & COHERENCE:
        Each module MUST be a direct continuation of the previous one.
        Every chapter in a module must belong to the same conceptual stage. A module about memory management cannot contain a chapter about I/O formatting. If unrelated, create a new module.

        CRITICAL RULE - CHAPTER SEQUENCE:
        Each chapter must explicitly depend on the previous one. Before generating the next chapter title, ask what concept the previous chapter established. If a learner wouldn't be ready for the next one, an intermediate chapter is required. No jumping from variables to structs without covering pointers first.

        CRITICAL RULE - YOUTUBE QUERIES:
        Every single query MUST contain the exact core topic ("${userGoal}") as a prefix. Never generate a query for a sub-concept without its parent language.
        Bad: "enum function tutorial". Good: "${userGoal} enum function tutorial explained".
        Bad: "linked list implementation". Good: "${userGoal} linked list implementation from scratch".

        ANCHOR CHANNEL:
        Recommend ONE YouTube channel that covers this entire topic well.
        Examples: "Academind", "Fireship", "Web Dev Simplified", "Traversy Media", "Hussein Nasser"
${nexusContextBlock}

        TOPOLOGY CONTEXT:
          structure: ${topology.structure}
          primaryMode: ${topology.primaryMode}
          hasCanonicalPath: ${topology.hasCanonicalPath}

        IF hasCanonicalPath is false:
          Build the roadmap as a series of PERSPECTIVES, not a strict sequence.
          Each module represents a different angle of attack on the topic.
          The narrativeBridge should explicitly say 'Another way in is...'

        IF primaryMode is 'exploration':
          The atomicTruth for each module should be phrased as a question,
          not a statement. e.g. 'What made this civilization different?'
          not 'Core characteristics of this civilization.'

        IF structure is 'cyclical':
          Add a note in narrativeBridge when concepts will be revisited:
          'We will return to this with deeper understanding in Module X.'

        IF primaryMode is 'skill':
          Every chapter must have a youtubeQuery that includes action words:
          'how to', 'build', 'implement', 'create', 'practice'
        
        RETURN JSON ONLY:
        {
          "courseTitle": "The Evolutionary Path to [Topic]",
          "anchorChannel": "Channel Name",
          "modules": [
            {
              "moduleTitle": "Stage 1: [Name]",
              "atomicTruth": "One sentence core principle",
              "narrativeBridge": "This is where we begin.",
              "estimatedDuration": "45 mins",
              "chapters": [ 
                  // REQUIRED FOR MOD 1 & 2 ONLY
                  {
                     "chapterTitle": "Specific micro-concept",
                     "youtubeQuery": "Specific search query (include '${userGoal}')",
                     "narrativeBridge": "Reasoning...",
                     "toolType": "analogy",
                     "gamePayload": { "concept": "...", "analogy": "...", "explanation": "..." }
                  }
              ]
            },
            {
              "moduleTitle": "Stage 3: [Name] (Skeleton)",
              "atomicTruth": "...",
              "narrativeBridge": "...",
              "estimatedDuration": "...",
              "chapters": [] // Empty for Mod 3+
            }
          ]
        }
      `;
    }
    // ═══════════════════════════════════════════════════════════════
    // MODE 2: MODULE DETAIL GENERATION (JIT Expansion)
    // ═══════════════════════════════════════════════════════════════
    else if (mode === "module_details") {
      if (!moduleContext || !moduleContext.moduleTitle) throw new Error("Missing module context");

      prompt = `
        You are a Specialized Curriculum Designer.
        
        GOAL: Create detailed chapters for the module: "${moduleContext.moduleTitle}"
        COURSE: "${userGoal}"
        CONTEXT: ${moduleContext.previousModuleTitle ? `The user just finished "${moduleContext.previousModuleTitle}".` : "This is the very first module."}
        MODULE_INDEX: ${moduleContext.moduleIndex || 0}
        
        INSTRUCTION:
        Break this module down into 3-5 atomic chapters.
        
        EVOLUTIONARY PACING RULES & COHERENCE (CRITICAL):
        - Every chapter in a module must belong to the same conceptual stage. If unrelated, create a new module instead.
        - IF this is Module 1 or 2: FOCUS ON CONCEPTS. Explain "Why" and "What" before "How". Use analogies.
        - IF this is Module 3, 4, or 5: FOCUS ON IMPLEMENTATION. Detailed "How-To", code, setup.
        - IF this is Module 6+: FOCUS ON MASTERY. Optimization, scaling, rare edge cases.

        CRITICAL RULE - CHAPTER SEQUENCE:
        Each chapter must explicitly depend on the previous one. Ask yourself what concept the previous chapter established. If a learner wouldn't be ready for the next one, an intermediate chapter is required. No jumping concepts.

        YOUTUBE QUERY RULES:
        1. Every single query MUST contain the exact core topic ("${userGoal}") as a prefix. Never generate a query for a sub-concept without its parent language or domain.
        Bad: "enum function tutorial". Good: "${userGoal} enum function tutorial explained".
        2. Be ULTRA-SPECIFIC. Include technical terms.
        3. Based on the PACING RULE above:
           - Concept Phase: Append "explained visually", "theory", or "basics".
           - Implementation Phase: Append "tutorial", "code", "implementation", or "guide".
           - Mastery Phase: Append "advanced", "deep dive", "optimization".

        RETURN JSON ONLY:
        {
          "chapters": [
             {
               "chapterTitle": "Specific micro-concept",
               "youtubeQuery": "Specific search query (adhering to pacing rules)",
               "narrativeBridge": "Reasoning for this step...",
               "toolType": "analogy",
               "gamePayload": { "concept": "...", "analogy": "...", "explanation": "..." }
             }
          ]
        }
      `;
    } else {
      throw new Error("Invalid generation mode");
    }

    const result = await generateContentWithFailover(prompt, {
      responseMimeType: "application/json",
      temperature: 0.7,
    });

    console.log(`🤖 Gemini Response (${body.mode}) [Model: ${result.modelUsed}]:`, result.text.slice(0, 100));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = safeParseJsonObject<any>(result.text);

    if (!data) {
      throw new Error("Failed to parse valid roadmap JSON");
    }

    const t = userGoal.toLowerCase();
    const foreign = ['typescript', 'javascript', 'python', 'java', 'c++', 'rust', 'go'];
    (data.modules || []).forEach((m: any) => {
      if (!Array.isArray(m.chapters)) return;
      if (m.chapters.length > 0 && (m.chapters.length < 2 || m.chapters.length > 6)) {
        console.warn(`[Validation] Module has ${m.chapters.length} chapters, should be 2-6`);
      }
      m.chapters.forEach((c: any) => {
        const q = c.youtubeQuery?.toLowerCase() || "";
        const title = c.chapterTitle?.toLowerCase() || "";
        const qTokens = q.split(/[^a-z0-9+#]/);
        const hasTopic = t.split(' ').some(w => w.length > 2 ? q.includes(w) : qTokens.includes(w));
        const wrongLang = foreign.some(lang => title.includes(lang) && !t.includes(lang));
        if (!hasTopic || wrongLang) {
          const old = c.youtubeQuery;
          c.youtubeQuery = `${userGoal} ${old || c.chapterTitle || ""}`.trim();
          console.warn(`[Validation Fix] Bad query: "${old}" -> Corrected: "${c.youtubeQuery}"`);
        }
      });
    });

    if (mode === "skeleton") {
      const extractedTopics = extractTopicsFromSkeleton(data);

      try {
        const requestUrl = new URL(req.url);
        const playlistResponse = await fetch(`${requestUrl.origin}/api/build-playlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: userGoal,
            tableOfContents: extractedTopics,
            preferences: {
              domainType: domainType || "technical",
              priorKnowledge: priorKnowledge || "none",
              language: "english",
            },
          }),
        });

        if (playlistResponse.ok) {
          data.playlist = await playlistResponse.json();
        } else {
          data.playlist = { error: "playlist_unavailable", entries: [] };
        }
      } catch (playlistError) {
        console.warn("⚠️ Playlist enrichment failed:", playlistError);
        data.playlist = { error: "playlist_unavailable", entries: [] };
      }
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error(`❌ Roadmap Generation Failed (${body.mode}):`, error);

    // ═══════════════════════════════════════════════════════════════
    // FAILOVER: BACKUP MODES
    // ═══════════════════════════════════════════════════════════════
    const normalizedGoal = body.userGoal?.toLowerCase().trim();
    if (BACKUP_ROADMAPS[normalizedGoal]) {
      console.warn(`⚠️ Triggering Backup Mode for: ${normalizedGoal}`);
      return NextResponse.json({
        ...BACKUP_ROADMAPS[normalizedGoal],
        _isBackup: true, // Internal flag for debugging/UI if needed
      });
    }

    return NextResponse.json({
      error: "Generation Failed",
      details: String(error)
    }, { status: 500 });
  }
}
