import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            imageBase64,
            userQuestion,
            timestamp,
            chapterTitle,
            moduleTitle,
            courseTitle,
            transcriptContext,
        } = body;

        if (!imageBase64) {
            return NextResponse.json(
                { error: "imageBase64 is required" },
                { status: 400 }
            );
        }

        // Helper to format timestamp
        const formatTime = (seconds: number) => {
            if (!seconds) return "Unknown";
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        const formattedTime = typeof timestamp === 'number' ? formatTime(timestamp) : (timestamp || "Unknown");

        const systemPrompt = `You are an expert AI tutor analyzing a screenshot from a learning video.
        
CONTEXT:
- Course: ${courseTitle}
- Module: ${moduleTitle}
- Chapter: ${chapterTitle}
- Video Timestamp: ${formattedTime}
${transcriptContext ? `TRANSCRIPT SURROUNDING THIS MOMENT:\n${transcriptContext}\n` : ""}

YOUR TASK:
1. Analyze the screenshot content.
2. Explain exactly what is happening.
3. Define key terms.

FORMATTING RULES (STRICT):
- Use Markdown.
- **Bold** key terms.
- Keep it distinct and visual.`;

        const userPrompt = userQuestion || "What's happening in this screenshot? Explain it to me.";

        // Use raw fetch to bypass potential SDK issues with Preview models
        const payload = {
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: `${systemPrompt}\n\nUSER QUESTION: ${userPrompt}` },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageBase64,
                            },
                        },
                    ],
                },
            ],
            temperature: 0.7,
            max_tokens: 1000,
        };

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("Groq Raw Error:", JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || "Groq API Error");
        }

        const aiResponse = data.choices[0]?.message?.content || "I couldn't analyze this image.";

        return NextResponse.json({
            response: aiResponse,
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            timestamp,
        });
    } catch (error) {
        console.error("Vision API error:", error);
        return NextResponse.json(
            {
                error: "Failed to analyze image",
                message: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
