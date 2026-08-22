import { generateContentWithFailover } from "@/utils/gemini";
import { NextResponse } from "next/server";
import { safeParseJsonObject } from "@/utils/safeJsonParser";
import { validateResourceUrls } from "@/utils/validateResourceUrls";

export async function POST(req: Request) {
  let topic = "Topic";

  try {
    const body = await req.json();
    topic = body.topic || "Topic";
    const context = body.context;
    const emphasizeExercises = body.emphasizeExercises === true;

    // ─── RESOURCE INSTRUCTION ────────────────────────────────────────────────
    // KEY RULE: Only use homepage-level or search-level URLs — never deep paths.
    // Deep paths like /courses/X/lesson-Y almost always 404 after site updates.
    // ─────────────────────────────────────────────────────────────────────────
    const resourceInstruction = emphasizeExercises
      ? `For practiceResources, find 3-4 highly relevant hands-on exercises, coding playgrounds, and interactive tools.

CRITICAL URL RULES (follow exactly or the link will be dead):
- Only use HOMEPAGE or SEARCH-LEVEL URLs. NEVER use deep sub-paths like /courses/X/lesson/Y
- Good: "https://replit.com" or "https://codepen.io/pen/new" or "https://leetcode.com/problemset/"
- Bad: "https://replit.com/learn/python/unit-1/lesson-3" (will 404)
- For Brilliant: use "https://brilliant.org/courses/" NOT a specific lesson URL
- For Khan Academy: use "https://www.khanacademy.org/search?page_search_query=TOPIC" replacing TOPIC
- For any site: when in doubt, link to their homepage or search page

Prioritize: coding exercises (leetcode.com, codepen.io/pen/new, replit.com), interactive REPLs, official docs homepages.`

      : `Also generate practiceResources (2-4 items max). Only include if genuinely useful for THIS specific topic.

CRITICAL URL RULES (follow exactly or the link will be dead):
- Use ONLY homepage-level, search page, or well-known stable tool URLs
- NEVER include deep paths like /courses/topic/unit/lesson — these always end up as 404s
- APPROVED safe URL patterns:
  * visualgo.net → use "https://visualgo.net/en" (the home, not a specific algo page)
  * brilliant.org → use "https://brilliant.org/courses/" NOT a specific lesson URL
  * khanacademy.org → use "https://www.khanacademy.org/search?page_search_query=KEYWORD" (replace KEYWORD)
  * 3blue1brown.com → use "https://www.3blue1brown.com/" only
  * phet.colorado.edu → use "https://phet.colorado.edu/en/simulations/filter?subjects=TOPIC" or homepage
  * wolframalpha.com → use "https://www.wolframalpha.com/input?i=QUERY" (replace QUERY)
  * mdn.mozilla.org → deep paths OK, MDN is stable
  * github.com → deep paths OK, GitHub is stable
  * wikipedia.org → deep paths OK
  * youtube.com → use "https://www.youtube.com/results?search_query=TOPIC"
  * observablehq.com → use "https://observablehq.com/@d3" or topic search
  * codepen.io → use "https://codepen.io/pen/new" or "https://codepen.io/search/pens?q=TOPIC"
- If topic is math/CS algorithms: prefer visualgo.net, betterexplained.com homepage, wolframalpha
- If topic is programming: prefer MDN, official docs, codepen.io
- If topic is science: prefer phet.colorado.edu homepage or filter URL
- Return [] if no good resource exists — do NOT invent URLs`;

    const prompt = `
      You are an expert technical tutor "bridging the gap" for a student watching a video tutorial.
      TOPIC: "${topic}"
      CONTEXT: "${context}"

      Generate a high-quality, specific learning guide (JSON).
      
      REQUIREMENTS:
      1. "summary": A technical briefing of the lesson scope. "In this lesson, we will explore..."
      2. "keyPoints": 3-4 HARD/TECHNICAL terms with clear, simple definitions.
      3. "codeSnippet": Actual code or formula if relevant (NO LaTeX '$$', use 'x^2'). null if not relevant.
      4. "commonPitfalls": A subtle, non-obvious mistake professionals make (not just "syntax error").
      5. "analogy": A brilliant, memorable mental model.
      6. "handsonNext": 1-2 sentences of what to actively DO after watching. Be specific and actionable.
      7. ${resourceInstruction}

      RETURN JSON ONLY (no markdown, no code fences):
      {
        "summary": "Technical briefing...",
        "keyPoints": [
            { "term": "Term 1", "def": "Simple definition..." },
            { "term": "Term 2", "def": "Simple definition..." }
        ],
        "codeSnippet": null,
        "commonPitfalls": "Advanced gotcha...",
        "analogy": "Mental model...",
        "handsonNext": "Specific action the learner should take right now...",
        "practiceResources": [
          {
            "type": "visualization",
            "title": "Resource Title",
            "url": "https://homepage-or-search-level-url-only.com",
            "why": "One sentence: why this specifically for THIS topic",
            "effort": "15 min",
            "emoji": "🎨"
          }
        ]
      }

      practiceResources rules:
      - "type": one of "visualization", "interactive", "article", "exercise", "tool"
      - "effort": one of "5 min", "15 min", "30 min+"
      - "url": ONLY homepage or search-level URLs as described above
      - Return [] if unsure — never invent a URL
    `;

    const result = await generateContentWithFailover(prompt);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = safeParseJsonObject<any>(result.text);

    if (!data || !data.keyPoints || !Array.isArray(data.keyPoints)) {
      throw new Error("Invalid structure: missing keyPoints");
    }

    if (!Array.isArray(data.practiceResources)) {
      data.practiceResources = [];
    }

    // ─── URL VALIDATION ───────────────────────────────────────────────────────
    // Server-side HEAD-check every URL. Dead ones get replaced with a working
    // fallback (domain search page or Google search). Runs in parallel with a
    // 4s timeout per URL so it never stalls the response for long.
    // ─────────────────────────────────────────────────────────────────────────
    if (data.practiceResources.length > 0) {
      data.practiceResources = await validateResourceUrls(data.practiceResources, topic);
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error("Content Gen Error:", error);
    return NextResponse.json({
      summary: "Mastering " + topic + " is essential for this module.",
      keyPoints: [
        { term: "Syntax", def: "The grammatical rules of the language." },
        { term: "Logic", def: "The flow of data and decision making." }
      ],
      codeSnippet: null,
      commonPitfalls: "Skipping the foundational theory.",
      analogy: "It's like building a foundation before the house.",
      handsonNext: "Try implementing today's concept in a small project to solidify your understanding.",
      practiceResources: []
    });
  }
}