import { generateContentWithFailover } from "@/utils/gemini";
import { NextResponse } from "next/server";
import { safeParseJsonObject } from "@/utils/safeJsonParser";

export async function POST(req: Request) {
  try {
    const { question, userAnswer, context } = await req.json();

    const prompt = `
      You are a strict but helpful tutor.
      Topic: "${context}"
      Question: "${question}"
      Student Answer: "${userAnswer}"

      Task: Grade the answer.
      - If it is correct or mostly correct, return JSON: { "isCorrect": true, "feedback": "Great job! [One sentence summary]" }
      - If it is wrong, return JSON: { "isCorrect": false, "feedback": "Not quite. [Explain the right answer simply]" }
      
      Return ONLY valid JSON.
    `;

    // Connect to Gemini
    const result = await generateContentWithFailover(prompt, { responseMimeType: "application/json" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = safeParseJsonObject<any>(result.text);

    if (!parsed) {
      throw new Error("Invalid Feynman validation JSON");
    }

    return NextResponse.json(parsed);

  } catch (error) {
    return NextResponse.json({ isCorrect: false, feedback: "AI Error. Try again." });
  }
}