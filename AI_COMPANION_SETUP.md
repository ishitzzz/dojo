# AI Companion Setup Guide

## What Was Built

You now have a **Smart AI Companion** that:
1. **Fetches video transcripts** automatically
2. **Provides context-aware tutoring** using Groq's Llama 3.1 70B
3. **Remembers conversation history** within each chapter
4. **Knows the learning path** (course → module → chapter)

---

## Setup Steps

### 1. Get a Groq API Key (FREE)

1. Go to https://console.groq.com/
2. Sign up (it's free!)
3. Navigate to **API Keys** in the sidebar
4. Click **"Create API Key"**
5. Copy the key (starts with `gsk_...`)

### 2. Add the Key to `.env.local`

Open `.env.local` and replace the placeholder:

```bash
GROQ_API_KEY=gsk_your_actual_key_here
```

### 3. Restart the Dev Server

```bash
# Stop the current server (Ctrl+C)
npm run dev
```

---

## How to Use

1. **Navigate to any module** in your roadmap
2. **Click on a chapter** to open the Workspace
3. **Click the "🤖 AI Chat" tab** in the left panel
4. **Ask questions** like:
   - "Can you explain this in simpler terms?"
   - "What's a real-world example of this concept?"
   - "I'm confused about [specific part]"

---

## Features

### ✅ Video Transcript Integration
- Automatically fetches captions from YouTube
- AI uses the transcript to give accurate, video-specific answers

### ✅ Context-Aware Responses
- AI knows:
  - The course title (e.g., "Redux")
  - The current module (e.g., "Stage 2: Formalizing Redux Core Principles")
  - The current chapter (e.g., "Pure Functions in Reducers")
  - The video transcript

### ✅ Fast Responses
- Powered by **Groq** (not Gemini)
- Average response time: **~0.5 seconds** ⚡

### ✅ Conversation Memory
- Remembers your questions within the same chapter
- Can reference previous answers

---

## Example Conversation

**You:** "What is a pure function?"

**AI:** "A pure function is a function that:
1. Always returns the same output for the same input
2. Has no side effects (doesn't modify external state)

In Redux, reducers MUST be pure functions. This means:
- `(state, action) => newState` should be predictable
- No API calls, no mutations, no randomness inside reducers

Example from the video:
```js
// ✅ Pure
const reducer = (state, action) => ({ ...state, count: state.count + 1 });

// ❌ Impure (mutates state)
const badReducer = (state, action) => { state.count++; return state; }
```

Want me to explain why immutability matters?"

---

## Troubleshooting

### "Transcript not available"
- Some videos don't have captions enabled
- The AI will still work, but without video-specific context

### "Failed to generate response"
- Check your `GROQ_API_KEY` in `.env.local`
- Make sure you restarted the dev server after adding the key

### Slow responses
- Groq free tier has rate limits (30 requests/min)
- If you hit the limit, wait a minute and try again

---

## Next Steps

Want to enhance this further? We can:
1. **Add memory across chapters** (store chat history in Supabase)
2. **Add "Ask about this timestamp"** (click a part of the video to ask about it)
3. **Add suggested questions** (AI generates follow-up questions based on the video)

Let me know! 🚀
