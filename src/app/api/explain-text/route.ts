import { generateContentWithFailover } from "@/utils/gemini";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { text } = await req.json();

  const prompt = `
    You are a Helpful Tutor in a book margin.
    The user highlighted this text: "${text}"

    Explain it simply in 2-3 sentences. 
    If it's code, explain the logic. 
    If it's a concept, give a real-world analogy.
  `;

  const result = await generateContentWithFailover(prompt);
  return NextResponse.json({ explanation: result.text });
}