import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// Debug: Check if API key is loaded
console.log("🔑 Groq API Key loaded:", process.env.GROQ_API_KEY ? `Yes (${process.env.GROQ_API_KEY.slice(0, 10)}...)` : "❌ NO KEY FOUND");


export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            userQuestion,
            videoTranscript,
            chapterTitle,
            moduleTitle,
            courseTitle,
            chatHistory = [],
        } = body;

        if (!userQuestion) {
            return NextResponse.json(
                { error: "userQuestion is required" },
                { status: 400 }
            );
        }

        // Build context-aware system prompt
        const systemPrompt = `You are an expert AI tutor helping a student learn about "${courseTitle}".

CURRENT CONTEXT:
- Module: ${moduleTitle}
- Chapter: ${chapterTitle}
- The student is watching a video on this topic

YOUR ROLE:
1. Answer questions clearly and concisely
2. Use examples from the video transcript when relevant
3. Connect concepts to the broader learning path
4. Encourage deeper understanding with follow-up questions
5. If the student seems confused, break down concepts into simpler terms

RULES:
- Keep answers under 150 words unless the student asks for more detail.
- Use analogies and real-world examples.
- Reference specific parts of the video when helpful.
- If you don't know something, admit it and suggest resources.
- Be encouraging and supportive.

FORMATTING (STRICT):
- Use proper Markdown (Headers, **Bold**, Lists).
- NO LaTeX ($$). Use clear text equations (x^2).
- Use code blocks for any syntax.
- Structure your answer visually.

${videoTranscript ? `VIDEO TRANSCRIPT (for reference):\n${videoTranscript.slice(0, 3000)}...` : ""}`;

        // Build conversation history for Groq
        const messages = [
            { role: "system" as const, content: systemPrompt },
            ...chatHistory.map((msg: { role: string; content: string }) => ({
                role: msg.role as "user" | "assistant",
                content: msg.content,
            })),
            { role: "user" as const, content: userQuestion },
        ];

        // Call Groq API
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", // Updated to current model
            messages,
            temperature: 0.7,
            max_tokens: 500,
            top_p: 1,
        });

        const aiResponse = completion.choices[0]?.message?.content || "I'm not sure how to answer that.";

        return NextResponse.json({
            response: aiResponse,
            model: "llama-3.1-70b-versatile",
            usage: {
                promptTokens: completion.usage?.prompt_tokens,
                completionTokens: completion.usage?.completion_tokens,
                totalTokens: completion.usage?.total_tokens,
            },
        });
    } catch (error) {
        console.error("Groq chat error:", error);
        return NextResponse.json(
            {
                error: "Failed to generate response",
                message: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
