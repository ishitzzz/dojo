# 🥋 The Dojo - Hidden Gem Search Engine

## New Architecture: Information Density over Popularity

This upgrade transforms The Dojo's video search from simple keyword matching to a sophisticated "Hidden Gem" discovery pipeline.

### 🎯 Philosophy

We optimize for **Information Density** ($I_d$) - prioritizing videos with:
- Technical documentation and GitHub links
- Academic explanations and implementation details
- Appropriate depth for the user's experience level

...over videos with:
- High view counts and clickbait titles
- Entertainment-focused editing
- Surface-level content

---

## 📁 New Files Added

```
src/utils/
├── searchScraper.ts      # Density scoring algorithm
├── geminiReranker.ts     # LLM-based semantic reranking
├── transcriptFetcher.ts  # YouTube transcript extraction
└── videoVault.ts         # Caching with Supabase/pgvector

supabase/migrations/
└── 001_video_vault.sql   # Database schema for video caching
```

---

## 🔄 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     HIDDEN GEM SEARCH PIPELINE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. QUERY EXPANSION (generate-roadmap/route.ts)                         │
│     └─▶ Generate 3 diverse sub-queries per topic                        │
│     └─▶ Apply "Academic" modifiers for Deep Dive users                  │
│     └─▶ Append anti-clickbait terms: -clickbait -reaction -shorts       │
│                                                                          │
│  2. CACHE CHECK (get-video/route.ts)                                    │
│     └─▶ Quick cache (in-memory, 30min TTL)                              │
│     └─▶ Video Vault (Supabase with pgvector)                            │
│                                                                          │
│  3. YOUTUBE FETCH                                                       │
│     └─▶ Fetch top 10 results via yt-search                              │
│     └─▶ Filter by duration (2min - 2hr)                                 │
│                                                                          │
│  4. DENSITY SCORING (searchScraper.ts)                                  │
│     └─▶ +50 for GitHub/Colab links                                      │
│     └─▶ +30 for videos > 15 minutes                                     │
│     └─▶ +25 for documentation keywords                                  │
│     └─▶ -100 for clickbait signals                                      │
│                                                                          │
│  5. GEMINI VIBE-CHECK (geminiReranker.ts)                               │
│     └─▶ Send top 5 candidates to Gemini                                 │
│     └─▶ Ask: "Which has highest Information Density?"                   │
│     └─▶ Fallback: Video with GitHub in description                      │
│                                                                          │
│  6. STORE & RETURN                                                       │
│     └─▶ Cache in Video Vault for future queries                         │
│     └─▶ Return videoId with density metadata                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Density Scoring Algorithm

```typescript
// Positive Signals
+50  GitHub/Colab link in description
+30  Video duration > 15 minutes
+25  Documentation keywords (docs, implementation, readme)
+20  Academic terms (paper, research, whitepaper)
+15  Technical signals (npm, pip, source code)

// Negative Signals  
-100 Clickbait language ("Mind-blowing", "Insane", etc.)
-40  High views (500k+) with empty description
-20  ALL CAPS aggressive titles
```

---

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 2. Configure Environment

Copy `.env.example` to `.env.local` and add your Gemini API key:

```bash
GEMINI_API_KEY=your_key_here
```

### 3. Optional: Set Up Supabase

1. Create a Supabase project at https://supabase.com
2. Run the migration in `supabase/migrations/001_video_vault.sql`
3. Add Supabase credentials to `.env.local`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
```

### 4. Run the App

```bash
npm run dev
```

---

## 🧪 Testing the Pipeline

1. Go through onboarding with different personas (Student vs Professional)
2. Enter the same topic for both
3. Observe different video selections in the console logs:

```
🔎 Hidden Gem Search: "react hooks tutorial for beginners..."
📊 Top 5 by Density Score:
  1. [85] React Hooks Full Course - GitHub... (🔗 GitHub Link, ⏱️ Deep Dive)
  2. [60] Complete React Tutorial... (📚 Documentation)
  3. [45] Learn React in 30 minutes...
🧠 Gemini selected: React Hooks Full Course - GitHub...
💾 Cached video: dQw4w9WgXcQ for query hash: abc123
```

---

## 📝 Key Configuration

In `src/app/api/get-video/route.ts`:

```typescript
const CONFIG = {
  INITIAL_FETCH_COUNT: 10,      // Videos to fetch from YouTube
  RERANK_CANDIDATE_COUNT: 5,    // Send to Gemini for final selection
  MIN_VIDEO_DURATION: 120,      // 2 minutes minimum
  ENABLE_TRANSCRIPT_ANALYSIS: false, // Enable for deeper analysis
};
```

---

## 🚀 Future Enhancements

1. **Embedding-based search**: Use pgvector for semantic similarity
2. **Transcript analysis**: Score videos by technical term density
3. **User feedback loop**: Let users upvote/downvote to improve rankings
4. **Channel blocklist**: Community-curated list of low-quality channels
