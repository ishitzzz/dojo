import { generateContentWithFailover } from "@/utils/gemini";
import { NextResponse } from "next/server";
import { safeParseJsonObject } from "@/utils/safeJsonParser";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Support both 'topic' (your old code) and 'concept' (frontend compatibility)
    const topic = body.topic || body.concept || "Complex Concept";

    if (!process.env.GEMINI_API_KEY) throw new Error("No API Key");

    // 🎲 1. Random Domain Selection
    // We force the AI to pick distinct, non-tech domains
    const domains = ["Restaurant Kitchen", "Busy Airport", "Ant Colony", "Football Team", "Construction Site", "Music Festival"];
    const randomDomain = domains[Math.floor(Math.random() * domains.length)];

    // 🧠 2. The Creative Prompt
    const prompt = `
      You are an expert in explaining complex code concepts using simple analogies.
      
      TOPIC: "${topic}"
      FORCED DOMAIN: "${randomDomain}"
      
      TASK: 
      Map the key components of the TOPIC to specific characters/objects in the DOMAIN.
      
      REQUIREMENTS:
      1. Create exactly 3-4 mappings.
      2. The "AnalogyTerm" must be a concrete person or object from the ${randomDomain}.
      3. The "TechTerm" must be the correct technical counterpart.
      4. "Distractors" are technical terms that are related but WRONG for this specific analogy (to confuse the user).
      
      RETURN JSON ONLY:
      {
        "domain": "${randomDomain}",
        "scenarioDescription": "A short 1-sentence setup (e.g. Imagine a busy kitchen...)",
        "pairs": [
          { "analogyTerm": "Head Chef", "techTerm": "Load Balancer" },
          { "analogyTerm": "Line Cook", "techTerm": "Server Instance" }
        ],
        "distractors": ["Database", "DNS Record"] 
      }
    `;

    // Connect to Gemini
    const result = await generateContentWithFailover(prompt, { responseMimeType: "application/json" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = safeParseJsonObject<any>(result.text);

    if (!data) {
      throw new Error("Failed to parse analogy JSON");
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error("Analogy Gen Failed:", error);
    return NextResponse.json({ error: "Failed to generate analogy" }, { status: 500 });
  }
}