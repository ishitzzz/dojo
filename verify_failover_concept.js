// verify_failover.js
const { generateContentWithFailover } = require('./src/utils/gemini');

// Mock Data
const MOCK_RESPONSE_TEXT = "Mocked Response Content";

// Mock GoogleGenerativeAI
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
    generateContent: mockGenerateContent
}));

jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn(() => ({
        getGenerativeModel: mockGetGenerativeModel
    }))
}));

async function testFailover() {
    console.log("🧪 Testing Failover Logic...");

    // Scenario 1: Primary Model Succeeds
    console.log("\n--- Scenario 1: Primary Model Succeeds ---");
    mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => "Primary Success" }
    });

    try {
        const result = await generateContentWithFailover("test prompt");
        console.log("Result:", result);
        if (result.modelUsed === "gemini-1.5-flash" && !result.fallbackUsed) {
            console.log("✅ PASSED: Used Primary Model");
        } else {
            console.log("❌ FAILED: Did not use Primary Model correctly");
        }
    } catch (e) {
        console.error("❌ FAILED: Unexpected error", e);
    }

    // Scenario 2: Primary Fails, Secondary Succeeds
    console.log("\n--- Scenario 2: Primary Fails, Secondary Succeeds ---");
    mockGenerateContent.mockRejectedValueOnce(new Error("Primary Failed")); // First call fails
    mockGenerateContent.mockResolvedValueOnce({ // Second call succeeds
        response: { text: () => "Secondary Success" }
    });

    try {
        const result = await generateContentWithFailover("test prompt");
        console.log("Result:", result);
        if (result.modelUsed === "gemini-1.5-flash-8b" && result.fallbackUsed) {
            console.log("✅ PASSED: Failed over to Secondary Model");
        } else {
            console.log("❌ FAILED: Did not failover correctly");
        }
    } catch (e) {
        console.error("❌ FAILED: Unexpected error during failover", e);
    }

    // Scenario 3: Both Fail
    console.log("\n--- Scenario 3: Both Fail ---");
    mockGenerateContent.mockRejectedValueOnce(new Error("Primary Failed"));
    mockGenerateContent.mockRejectedValueOnce(new Error("Secondary Failed"));

    try {
        await generateContentWithFailover("test prompt");
        console.log("❌ FAILED: Should have thrown an error");
    } catch (e) {
        console.log("✅ PASSED: Caught expected error:", e.message);
    }
}

// Check environment variables
if (!process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = "test-key"; // dummy key for mocking
}

// Run (needs jest environment, but we can't easily run jest in this environment without setup)
// Instead of full Jest, I will write a simple manual mock version below that doesn't depend on Jest.
