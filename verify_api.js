
const fetch = require('node-fetch'); // Assuming node-fetch is available or using native fetch in Node 18+

async function testAPIs() {
    const baseUrl = 'http://localhost:3000';

    console.log("🧪 Starting Spider-Web Architecture Verification...");

    // ESTABLISH BASELINE: SKELETON GENERATION
    console.log("\n1. Testing Skeleton Generation...");
    try {
        const res = await fetch(`${baseUrl}/api/generate-roadmap`, {
            method: 'POST',
            body: JSON.stringify({
                userGoal: "Learn React",
                experienceLevel: "Beginner",
                mode: "skeleton"
            })
        });
        const data = await res.json();
        if (data.modules && !data.modules[0].chapters) {
            console.log("✅ Skeleton Generation Success: Modules returned without chapters.");
            console.log(`   Title: ${data.courseTitle}`);
            console.log(`   First Module: ${data.modules[0].moduleTitle}`);
        } else {
            console.error("❌ Skeleton Failure:", data);
        }

        // TEST 2: MODULE DETAIL GENERATION
        console.log("\n2. Testing Module Detail Generation (JIT)...");
        const moduleTitle = data.modules[0].moduleTitle;
        const res2 = await fetch(`${baseUrl}/api/generate-roadmap`, {
            method: 'POST',
            body: JSON.stringify({
                userGoal: "Learn React",
                experienceLevel: "Beginner",
                mode: "module_details",
                moduleContext: {
                    moduleTitle: moduleTitle,
                    previousModuleTitle: null
                }
            })
        });
        const details = await res2.json();
        if (details.chapters && details.chapters.length > 0) {
            console.log("✅ Module Expansion Success: Chapters returned.");
            console.log(`   First Chapter: ${details.chapters[0].chapterTitle}`);
            console.log(`   Query: ${details.chapters[0].youtubeQuery}`);
        } else {
            console.error("❌ Module Expansion Failure:", details);
        }

        // TEST 3: CONTEXT-AWARE VIDEO SEARCH
        console.log("\n3. Testing Context-Aware Video Search...");
        const query = details.chapters[0].youtubeQuery;
        const previousTopic = "History of Web Development";
        const res3 = await fetch(`${baseUrl}/api/get-video?q=${encodeURIComponent(query)}&role=Student&previousTopic=${encodeURIComponent(previousTopic)}`);
        const video = await res3.json();

        if (video.videoId) {
            console.log("✅ Video Search Success.");
            console.log(`   Video: ${video.title}`);
            console.log(`   Source: ${video.source}`); // Should ideally be 'concept_first' or 'gemini_rerank'
        } else {
            console.error("❌ Video Search Failure:", video);
        }

    } catch (e) {
        console.error("🚨 Verification Script Failed:", e);
    }
}

testAPIs();
