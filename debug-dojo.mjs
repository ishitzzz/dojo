import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

// Load your .env.local file
dotenv.config({ path: ".env.local" });

const key = process.env.GEMINI_API_KEY;
console.log("🔑 Checking Key:", key ? "Found (Length: " + key.length + ")" : "MISSING ❌");

const genAI = new GoogleGenerativeAI(key);

async function testModel(name) {
  process.stdout.write(`Testing model: "${name}"... `);
  try {
    const model = genAI.getGenerativeModel({ model: name });
    const result = await model.generateContent("Hi");
    console.log("✅ WORKS! USE THIS NAME.");
    return true;
  } catch (error) {
    console.log("❌ Failed (404 Not Found)");
    return false;
  }
}

async function run() {
  // We will test the 3 most common model names
  const models = ["gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro", "gemini-1.5-flash-latest"];
  
  console.log("\n--- STARTING DIAGNOSTIC ---");
  for (const model of models) {
    const success = await testModel(model);
    if (success) process.exit(0); // Stop once we find a winner
  }
  console.log("\n⚠️ ALL FAILED. The issue is likely your Google Cloud Project settings.");
}

run();