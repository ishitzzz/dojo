# Relevance Escape Hatch - Implementation Summary

## Problem Solved
The Anchor Channel was selecting **irrelevant videos** because it was blindly trusting the channel, even when the channel didn't have content on the specific topic.

**Example:**
- Query: "vanilla javascript global state object pattern"
- Anchor: "Web Dev Simplified"
- Result: "How To Build Your First TypeScript Project" ❌ (Not about global state!)

## Solution: Relevance Threshold

### 1. **Video Search API** (`src/app/api/get-video/route.ts`)
Added a **Relevance Escape Hatch** after ranking Anchor Channel videos:

```typescript
const RELEVANCE_THRESHOLD = 15; // Minimum density score

if (searchTierUsed === "anchor_channel" && topAnchorVideo.densityScore < 15) {
  console.warn("⚠️ Anchor Channel video has low relevance. Falling back...");
  // Re-run search WITHOUT anchor constraint
  // Use regular Hidden Gem search instead
}
```

**How it works:**
1. Search for Anchor Channel videos
2. Rank them by density score (GitHub links, duration, description quality)
3. **If the top video scores below 15**, abandon the Anchor and do a regular search
4. This ensures we only use the Anchor when it's actually relevant

### 2. **Roadmap API** (`src/app/api/generate-roadmap/route.ts`)
Added **YouTube Query Rules** to the prompt:

```
YOUTUBE QUERY RULES (CRITICAL):
1. Be ULTRA-SPECIFIC: Include exact technical terms
2. Add context keywords: "tutorial", "explained", "deep dive"
3. AVOID generic queries
4. Include the MAIN TOPIC in every query

GOOD: "redux pure functions reducer explained immutability"
BAD: "why direct state mutation is bad" ❌ (doesn't mention Redux)
```

## Expected Behavior Now

### Scenario 1: Anchor Channel Has Relevant Content
```
Query: "redux middleware thunk saga explained"
Anchor: "Web Dev Simplified"
Result: Finds "Redux Middleware Tutorial" from Web Dev Simplified ✅
Density Score: 30 (high)
Action: Use Anchor video ✅
```

### Scenario 2: Anchor Channel Has NO Relevant Content
```
Query: "vanilla javascript global state management"
Anchor: "Web Dev Simplified"
Result: Finds "TypeScript Project Tutorial" (score: 0)
Density Score: 0 (low - no GitHub, generic description)
Action: ⚠️ Abandon Anchor, search globally for best "javascript global state" video ✅
```

## Testing
Clear your localStorage and try "Redux" again with Student/Deep Dive.

**Expected:**
- Better query specificity (queries will include "redux" keyword)
- Videos will only use Anchor if they're actually relevant
- Fallback to best available video if Anchor doesn't cover the topic
