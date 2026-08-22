// const fetch = require('node-fetch'); // Using native fetch


async function testSpiderWeb() {
    const BASE_URL = 'http://localhost:3000/api';

    console.log("🕷️ Testing Spider-Web Architecture...");

    // 1. Test Roadmap Generation (Evolutionary Chain)
    console.log("\n1️⃣  Testing /generate-roadmap (First Principles)...");
    try {
        const roadmapRes = await fetch(`${BASE_URL}/generate-roadmap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userGoal: "React Hooks",
                userRole: "Student",
                experienceLevel: "Beginner"
            })
        });

        if (!roadmapRes.ok) throw new Error(`Roadmap Error: ${roadmapRes.statusText}`);
        const roadmap = await roadmapRes.json();

        console.log("✅ Roadmap Generated!");
        console.log(`   Title: ${roadmap.courseTitle}`);
        console.log(`   Anchor Channel: ${roadmap.anchorChannel || "None"}`);
        console.log(`   First Module: ${roadmap.modules[0]?.moduleTitle}`);
        console.log(`   Atomic Truth: ${roadmap.modules[0]?.atomicTruth}`);

        // 2. Test Anchor Channel Search
        if (roadmap.modules[0]?.chapters[0]) {
            const chapter = roadmap.modules[0].chapters[0];
            const anchor = roadmap.anchorChannel || "Fireship"; // Fallback for test

            console.log(`\n2️⃣  Testing /get-video (Anchor: ${anchor})...`);
            console.log(`   Query: ${chapter.youtubeQuery}`);

            const videoRes = await fetch(
                `${BASE_URL}/get-video?q=${encodeURIComponent(chapter.youtubeQuery)}&preferredChannel=${encodeURIComponent(anchor)}`
            );

            if (!videoRes.ok) throw new Error(`Video Error: ${videoRes.statusText}`);
            const video = await videoRes.json();

            console.log("✅ Video Found!");
            console.log(`   Title: ${video.title}`);
            console.log(`   Source: ${video.source}`);
            console.log(`   Channel Match: ${video.source === 'anchor_preference' || video.source === 'anchor_channel' ? 'YES' : 'NO'}`);
        }

    } catch (err) {
        console.error("❌ Verification Failed:", err.message);
    }
}

testSpiderWeb();
