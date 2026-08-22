import { NextResponse } from "next/server";
import { generateContentWithFailover } from "@/utils/gemini";

export const maxDuration = 60; // Allows Vercel hobby plan to run longer requests

export async function POST(req: Request) {
  try {
    const { messages, context, step } = await req.json();

    const systemPrompt = `You are a friendly learning guide for The Dojo. Guide users conversationally.
Ask questions ONE BY ONE in this exact sequence without skipping or combining them:
1) If their topic is broad (e.g., "product design"), ask what VERY SPECIFIC parts, subtopics, or aspects they want to focus on (provide 4-5 depth-first subtopic options).
2) Their current experience level or prior knowledge.
3) Whether they want a structured, step-by-step roadmap (Dojo) or free visual web exploration (Nexus). NEVER provide an option for "Both", "Either", or a combination of the two, as they are strictly mutually exclusive modes in our application.
THEN, after those core questions, ask ONE more set about breaks:
1) "Before we start — quick question about breaks! How long do you want to focus before a break?" with options: ["25 min (Pomodoro)", "45 min", "60 min", "90 min", "I'll set it myself"]
2) Based on their answer, ask: "And your break duration?" with options: ["5 min", "10 min", "15 min", "20 min"]
3) Finally: "What do you enjoy watching for fun?" with options: ["Tech & Science", "History & Culture", "Comedy & Satire", "Travel & Nature", "Business & Finance", "Sports & Games"] — the user may pick multiple.

Always respond with JSON matching this exact structure:
{
  "message": "your conversational response",
  "options": [{"label": "short option", "value": "internal_value", "emoji": "🤔"}],
  "isComplete": boolean,
  "result": { "topic": "extracted topic", "mode": "dojo|nexus", "learningContext": { "goal": "...", "level": "...", "timeAvailable": "...", "preferredStyle": "..."}, "breakPrefs": { "focusMinutes": number, "breakMinutes": number, "contentGenres": ["genre1", "genre2"] } }
}
Options: 2-6 max, always short (max 4 words each). Always include a "Custom" or "Other" option as last choice if asking a question, EXCEPT when asking to choose between Dojo and Nexus (for modes, only provide strictly those two options).
After ALL context is gathered (including break prefs), set isComplete: true and populate result with topic, mode (dojo/nexus), learningContext, AND breakPrefs.
For breakPrefs: map "25 min (Pomodoro)" → focusMinutes: 25, "45 min" → 45, etc. If user says "I'll set it myself", use focusMinutes: 25 as default.
For mode: if user wants structured/step-by-step roadmap → dojo. If user wants explore/discover visually → nexus.
Context string provided by client: "${context}". We are currently at step number: ${step}.`;

    // Convert messages for Gemini
    // We send the entire conversation history along with our system prompt to get the next turn.
    const historyText = messages.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const fullPrompt = `${systemPrompt}\n\nCONVERSATION HISTORY:\n${historyText}\n\nProvide your JSON response:`;

    const result = await generateContentWithFailover(fullPrompt, {
      responseMimeType: "application/json",
    });

    const parsed = JSON.parse(result.text);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Conversation guide error:", error);
    return NextResponse.json(
      { error: "Failed to process conversation guide" },
      { status: 500 }
    );
  }
}
