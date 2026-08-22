
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config({ path: '.env.local' });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function testModel(modelName) {
    console.log(`Testing model: ${modelName}...`);
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello, are you online?");
        console.log(`✅ ${modelName} is ONLINE. Response: ${result.response.text()}`);
    } catch (error) {
        console.log(`❌ ${modelName} FAILED: ${error.message}`);
    }
}

async function run() {
    await testModel("gemini-2.0-flash");
    await testModel("gemini-2.0-flash-lite");
    await testModel("gemini-2.5-flash"); // Just to be absolutely sure
}

run();
