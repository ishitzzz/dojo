// Test Groq API key directly
const Groq = require('groq-sdk');
require('dotenv').config({ path: '.env.local' });

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

async function testGroq() {
    console.log('🔑 Testing Groq API Key:', process.env.GROQ_API_KEY?.slice(0, 15) + '...');

    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "user", content: "Say 'Hello World' if you can hear me." }
            ],
            temperature: 0.7,
            max_tokens: 50,
        });

        console.log('✅ SUCCESS! Groq responded:', completion.choices[0]?.message?.content);
    } catch (error) {
        console.error('❌ FAILED:', error.message);
        console.error('Full error:', error);
    }
}

testGroq();
