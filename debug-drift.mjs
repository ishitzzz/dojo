
// debug-drift.mjs
// Simulates the backend logic to find out why "Game Theory" gets "Deep Learning" videos.

import dotenv from 'dotenv';
import yts from 'yt-search';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config({ path: '.env.local' });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Stable model for testing

async function vibeCheckRerank(candidates, topic, userRole, experienceLevel) {
    console.log(`\n🧠 Reranking ${candidates.length} candidates for topic: "${topic}"...`);

    // Simulate the prompt from src/utils/geminiReranker.ts
    const candidatesStr = candidates.map(c =>
        `- [${c.videoId}] ${c.title} (Duration: ${c.timestamp})\n  Desc: ${c.description.slice(0, 100)}...`
    ).join("\n");

    const prompt = `You are a Technical Content Curator.
CONTEXT: User Role: ${userRole}, Topic: ${topic}, Depth: ${experienceLevel}
TASK: Select the ONE best video.
CANDIDATES:
${candidatesStr}

RANKING CRITERIA:
1. Metadata Alignment
2. Transcript Verification
3. Educational Value

RETURN JSON ONLY: { "winnerId": "..." }
Select the best video now:`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log("🤖 Gemini Response:", text);
    return text;
}

async function run() {
    // 1. Simulate Roadmap Generation Log (What query did we likely use?)
    // User said "Module 2". Mod 1 is usually Intro. Mod 2 is probably "Nash Equilibrium" or "Zero Sum".
    // Let's guess the query was: "Game Theory Nash Equilibrium explained visually"
    const mockQuery = "Game Theory Nash Equilibrium explained visually";

    console.log(`🔎 Searching YouTube for: "${mockQuery}"`);

    const r = await yts(mockQuery);
    const videos = r.videos.slice(0, 10);

    console.log(`\n📊 Found ${videos.length} videos:`);
    videos.forEach((v, i) => console.log(`${i + 1}. [${v.videoId}] ${v.title} (${v.timestamp})`));

    // 2. Run Reranker simulation
    await vibeCheckRerank(videos, "Game Theory", "Student", "Beginner");
}

run();
