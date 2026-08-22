import { generateContentWithFailover } from "@/utils/gemini";
import { NextResponse } from "next/server";
import { checkNexusCache, storeNexusCache } from "@/utils/nexusCache";
import { sieveGoal } from "@/utils/contextSieve";
import { safeParseJsonObject } from "@/utils/safeJsonParser";
import { inferTopology } from "@/utils/topologyInference";

// ═══════════════════════════════════════════════════════════════
// GENERATE NEXUS API
// Creates the Origin Node and spawns initial learning nodes
// Now with ILS Nexus Cache integration
// ═══════════════════════════════════════════════════════════════

interface NexusRequest {
  userGoal: string;
  personaId?: string;
  clarified?: boolean; // true when user clicked a Choice Chip
  knownConcepts?: string;
}



/**
 * Builds the final response shape from raw LLM data.
 */
function buildResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  topology?: Awaited<ReturnType<typeof inferTopology>>,
  knownConceptsList: string[] = []
) {
  const knownConceptSet = new Set(knownConceptsList.map((concept) => concept.trim().toLowerCase()));

  return {
    origin: {
      id: `origin-${Date.now()}`,
      ...data.origin,
      position: { x: 0, y: 0 },
      status: "active",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialNodes: (data.initialNodes || []).map((node: any, index: number) => {
      const nodeTitle = String(node?.title || "").trim().toLowerCase();
      const isKnownConcept = knownConceptSet.has(nodeTitle);

      return {
        id: `node-${Date.now()}-${index}`,
        ...node,
        position: {
          x: index === 0 ? -400 : 400,
          y: 350,
        },
        status: isKnownConcept ? "mastered" : "ghost",
      };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    edges: (data.initialNodes || []).map((_node: any, index: number) => ({
      id: `edge-origin-${index}`,
      sourceId: `origin-${Date.now()}`,
      targetId: `node-${Date.now()}-${index}`,
      edgeType: "deep_dive",
      label: index === 0 ? "Start Here" : "Then This",
    })),
    suggestedPaths: data.suggestedPaths || [],
    topology,
  };
}

export async function POST(req: Request) {
  try {
    const body: NexusRequest = await req.json();
    const { userGoal } = body;
    const knownConceptsList = body.knownConcepts
      ? body.knownConcepts.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (!userGoal || userGoal.trim().length < 3) {
      return NextResponse.json(
        { error: "Please provide a learning goal" },
        { status: 400 }
      );
    }

    const topology = await inferTopology(userGoal);

    // ═══════════════════════════════════════════════════════════════
    // ILS Step 0: Context Sieve (Ambiguity Detection)
    // Only runs for fresh queries. Skipped if user already clarified.
    // ═══════════════════════════════════════════════════════════════
    if (!body.clarified) {
      const sieveResult = await sieveGoal(userGoal);
      if (sieveResult.isAmbiguous && sieveResult.chips && sieveResult.chips.length > 0) {
        console.log(`🧹 Context Sieve: Returning ${sieveResult.chips.length} chips for "${userGoal}"`);
        return NextResponse.json({
          type: "ambiguous",
          chips: sieveResult.chips,
          originalGoal: userGoal,
          reason: sieveResult.reason,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ILS Step 1: Check Nexus Cache (saves Gemini API call)
    // ═══════════════════════════════════════════════════════════════
    const cacheResult = await checkNexusCache(userGoal);
    if (cacheResult.found && cacheResult.data) {
      console.log(`🗄️ Nexus Cache HIT — skipping Gemini call for: "${userGoal.slice(0, 30)}..."`);
      const response = buildResponse(cacheResult.data, topology, knownConceptsList);
      return NextResponse.json(response);
    }

    const knownConceptsPromptBlock = knownConceptsList.length > 0
      ? `
KNOWN CONCEPTS — the user has already learned these:
${knownConceptsList.join(", ")}

Do NOT generate these as initial exploration nodes.
Generate nodes that are the NEXT frontier beyond what they know.
The ghost nodes should represent what comes AFTER their existing knowledge,
not review of what they already understand.
`
      : "";

    // ═══════════════════════════════════════════════════════════════
    // No cache → Generate with Gemini
    // ═══════════════════════════════════════════════════════════════
    const prompt = `
You are a friendly learning guide for beginners. A user wants to learn something.

USER'S GOAL: "${userGoal}"

YOUR TASK: Create a starting point for their learning journey.

CRITICAL RULES:
1. INTERPRET THE GOAL CHARITABLY - If they say "web design", they likely mean UI/UX, HTML, CSS - NOT database schemas or UML diagrams.
2. USE SIMPLE, CLEAR TITLES - No jargon. A 12-year-old should understand.
3. WRITE DETAILED EXPLANATIONS - Each section should have 3-5 sentences explaining the concept clearly.

EXAMPLE of good vs bad:
❌ BAD TITLE: "The Primitive State: Text-Based Information Systems"
✅ GOOD TITLE: "HTML Basics: Building Your First Webpage"

❌ BAD SUMMARY: "Understanding markup languages"
✅ GOOD SUMMARY: "HTML is the skeleton of every website. It tells browsers what content to show - headings, paragraphs, images, and links. Without HTML, there would be no structure to the web."

RETURN THIS JSON STRUCTURE:
{
  "origin": {
    "title": "Simple, friendly title about their goal",
    "summary": "3-4 sentences explaining what they'll learn and why it matters. Be encouraging and clear.",
    "content": {
      "introduction": "A welcoming paragraph (3-4 sentences) about this learning journey.",
      "sections": [
        {
          "heading": "What You'll Learn",
          "body": "2-3 sentences about the main skills they'll gain."
        },
        {
          "heading": "Why This Matters",
          "body": "2-3 sentences about real-world applications."
        },
        {
          "heading": "Getting Started",
          "body": "2-3 sentences about the first steps."
        }
      ]
    }
  },
  "initialNodes": [
    {
      "title": "Simple title for first concept",
      "summary": "3-4 sentences explaining this concept in plain language.",
      "content": {
        "introduction": "A paragraph introducing this topic.",
        "sections": [
          {
            "heading": "Key Concept 1",
            "body": "2-3 sentences explaining it simply."
          },
          {
            "heading": "Key Concept 2", 
            "body": "2-3 sentences explaining it simply."
          },
          {
            "heading": "Try This",
            "body": "A simple exercise or example."
          }
        ]
      },
      "youtubeQuery": "beginner tutorial [topic] for beginners"
    },
    {
      "title": "Simple title for second concept",
      "summary": "3-4 sentences explaining this concept in plain language.",
      "content": {
        "introduction": "A paragraph introducing this topic.",
        "sections": [
          {
            "heading": "Key Concept 1",
            "body": "2-3 sentences explaining it simply."
          },
          {
            "heading": "Key Concept 2",
            "body": "2-3 sentences explaining it simply."
          },
          {
            "heading": "Try This",
            "body": "A simple exercise or example."
          }
        ]
      },
      "youtubeQuery": "beginner tutorial [topic] for beginners"
    }
  ],
  "suggestedPaths": [
    {
      "question": "A natural follow-up question a learner might ask",
      "preview": "Brief preview of what clicking this would teach"
    },
    {
      "question": "Another follow-up question",
      "preview": "Brief preview"
    },
    {
      "question": "Third follow-up question",
      "preview": "Brief preview"
    }
  ]
}

LEARNING TOPOLOGY (use this to shape every decision):
  structure: ${topology.structure}
  contentNature: ${topology.contentNature}
  bestEntryStrategy: ${topology.bestEntryStrategy}
  timeDependent: ${topology.timeDependent}
  suggestedNodeCount: ${topology.suggestedNodeCount}

RULES:
- Generate exactly ${topology.suggestedNodeCount} initial nodes
- IF structure is 'sequential': nodes should feel ordered, edge labels like 'then', 'next step'
- IF structure is 'web': nodes should feel like different lenses on the same thing, no implied order
- IF contentNature is 'narrative': node titles should read like story beats e.g. 'Why Did Rome Actually Fall?' not 'Fall of Rome'
- IF contentNature is 'technical': node titles should be precise and specific e.g. 'useState vs useReducer: When to Use Which'
- IF timeDependent is true: include a period field on each node e.g. '~3500 BCE' or '1940s–1960s'
- IF bestEntryStrategy is 'pick_your_thread': the suggested paths should be framed as QUESTIONS not topics

For content sections inside each node:
Do NOT use fixed headings like 'Simple Answer' or 'Going Deeper'.
Instead generate 3-4 section headings that emerge naturally from what THIS specific node actually needs to communicate.
The heading should make someone curious enough to read the body.
Think: chapter titles in a great popular science book, not subheadings in a textbook.
Always end with one section about something genuinely debated or unresolved about this topic.

For suggestedPaths, ALWAYS include:
  Path 1: The obvious next question
  Path 2: A deeper version of the same question
  Path 3: A surprising cross-domain connection — something that makes the user say 'wait, what?' Label this one with type: 'serendipity' in addition to the normal fields.

For youtubeQuery on each node:
  Use topology.videoStylePriority[0] to determine search style:
  'documentary' → append 'documentary explained'
  'lecture' → append 'lecture explained university'
  'tutorial' → append 'tutorial beginner guide'
  'debate' → append 'debate analysis perspectives'
  'demonstration' → append 'walkthrough example'

Current topology.videoStylePriority[0]: ${topology.videoStylePriority[0]}
${knownConceptsPromptBlock}

REMEMBER:
- Simple language, no jargon
- Detailed explanations (not one-liners)
- Interpret their goal as a BEGINNER would mean it
- The suggestedPaths are clickable options shown to the user
`;

    const result = await generateContentWithFailover(prompt, {
      responseMimeType: "application/json",
      temperature: 0.7,
    });

    console.log(`🧠 Nexus Generated [Model: ${result.modelUsed}]`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = safeParseJsonObject<any>(result.text);

    // FIX: Match the validation to the Prompt schema (origin + initialNodes)
    // The previous validation incorrectly checked for 'title'/'children' which caused the crash.
    if (!data || !data.origin || !Array.isArray(data.initialNodes)) {
      console.warn("⚠️ Invalid nexus structure:", result.text.slice(0, 200));
      throw new Error("Failed to parse valid Nexus structure");
    }

    // ═══════════════════════════════════════════════════════════════
    // ILS: Store in Nexus Cache for future use
    // ═══════════════════════════════════════════════════════════════
    await storeNexusCache(userGoal, data);

    const response = buildResponse(data, topology, knownConceptsList);
    return NextResponse.json(response);

  } catch (error) {
    console.error("❌ Nexus Generation Failed:", error);
    return NextResponse.json(
      {
        error: "Failed to generate learning nexus",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
