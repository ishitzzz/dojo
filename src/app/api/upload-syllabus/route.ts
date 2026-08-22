import { NextRequest, NextResponse } from "next/server";
import { generateContentWithFailover } from "@/utils/gemini";
import { safeParseJsonObject } from "@/utils/safeJsonParser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const mode = formData.get("mode") as string || "syllabus"; // "syllabus" or "book"

    if (!file) {
      return NextResponse.json({ error: "No file found" }, { status: 400 });
    }

    // Convert file to Base64 for Gemini
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString("base64");

    // Determine mime type (pdf or image)
    const mimeType = file.type;

    const prompt = `
      You are an expert Curriculum Analyzer.
      TASK: Extract the structured learning path from this ${mode}.
      
      FILE CONTEXT: The attached file is a ${mode} (PDF/Image).

      INSTRUCTIONS:
      1. Identify the main modules/chapters.
      2. Extract 3-5 key topics per module.
      3. Ignore administrative details (grading policy, office hours).

      RETURN JSON ONLY:
      {
        "title": "Course Title",
        "description": "Brief summary...",
        "modules": [
          {
            "moduleTitle": "Module 1: ...",
            "topics": ["Topic A", "Topic B", "Topic C"]
          }
        ]
      }
    `;

    // Pass inline data correctly to Gemini
    // generateContentWithFailover supports prompt text + images
    // Note: Our utility wrapper takes 'prompt' as string | Array
    const result = await generateContentWithFailover([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      }
    ], {
      responseMimeType: "application/json"
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = safeParseJsonObject<any>(result.text);

    if (!data) {
      throw new Error("Failed to parse extracted syllabus JSON");
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json(
      { error: "AI Processing Failed", details: String(error) },
      { status: 500 }
    );
  }
}