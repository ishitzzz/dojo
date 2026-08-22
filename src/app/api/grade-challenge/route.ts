import { generateContentWithFailover } from "@/utils/gemini";
import { NextResponse } from "next/server";
import { safeParseJsonObject } from "@/utils/safeJsonParser";

export async function POST(req: Request) {
  // 1. Define variables OUTSIDE try block so 'catch' can see them
  let userAns = "";
  let correctAns = "";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let context = "";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let questionType = "";

  try {
    const body = await req.json();
    userAns = body.userAns;
    correctAns = body.correctAns;
    context = body.context;
    questionType = body.questionType;

    const prompt = `
      You are a friendly Tutor.
      TASK: Grade a student's answer.
      
      CONTEXT: "${context}"
      TYPE: ${questionType}
      CORRECT ANSWER (Hidden from user): "${correctAns}"
      USER ANSWER: "${userAns}"

      INSTRUCTIONS:
      1. Determine if the User Answer is functionally correct (ignore typos, capitalization, or synonyms).
      2. Provide a SIMPLIFIED 1-sentence explanation of why it is right or wrong.

      RETURN JSON ONLY:
      {
        "isCorrect": boolean,
        "explanation": "..."
      }
    `;

    const result = await generateContentWithFailover(prompt, { responseMimeType: "application/json" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = safeParseJsonObject<any>(result.text);

    if (!parsed) {
      throw new Error("Invalid grading JSON");
    }

    return NextResponse.json(parsed);

  } catch (error) {
    console.error("Grading Error:", error);

    // 2. Fallback Logic (Now works because variables are in scope)
    // Simple string matching fallback
    const isMatch = userAns && correctAns
      ? userAns.toLowerCase().includes(correctAns.toLowerCase()) || correctAns.toLowerCase().includes(userAns.toLowerCase())
      : false;

    return NextResponse.json({
      isCorrect: isMatch,
      explanation: isMatch ? "Correct!" : "AI Grader offline, but that didn't look quite right."
    });
  }
}