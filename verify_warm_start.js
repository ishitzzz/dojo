
const fetch = require('node-fetch'); // Assuming node-fetch is available

async function testWarmStart() {
    const baseUrl = 'http://localhost:3000';

    console.log("🧪 Testing Warm Start Strategy...");

    // ESTABLISH BASELINE: WARM SKEL GEN
    console.log("\n1. Testing Hybrid Skeleton (Warm Start)...");
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

        console.log(`   Course: ${data.courseTitle}`);

        // CHECK MODULE 1 (Should have chapters)
        if (data.modules && data.modules[0].chapters && data.modules[0].chapters.length > 0) {
            console.log("✅ Module 1 Warm Start Success: Chapters pre-generated.");
            console.log(`   Mod 1 Title: ${data.modules[0].moduleTitle}`);
            console.log(`   Mod 1 First Chapter: ${data.modules[0].chapters[0].chapterTitle}`);
        } else {
            console.error("❌ Module 1 Warm Start Failure: No chapters found.", data.modules[0]);
        }

        // CHECK MODULE 2 (Should have chapters)
        if (data.modules && data.modules[1].chapters && data.modules[1].chapters.length > 0) {
            console.log("✅ Module 2 Warm Start Success: Chapters pre-generated.");
        } else {
            console.error("❌ Module 2 Warm Start Failure: No chapters found.");
        }

        // CHECK MODULE 3 (Should be Skeleton)
        if (data.modules.length > 2) {
            if (!data.modules[2].chapters || data.modules[2].chapters.length === 0) {
                console.log("✅ Module 3 Skeleton Success: Correctly remained locked/empty.");
            } else {
                console.warn("⚠️ Module 3 has chapters? It should ideally be empty for optimization.", data.modules[2]);
            }
        }

    } catch (e) {
        console.error("🚨 Verification Script Failed:", e);
    }
}

testWarmStart();
