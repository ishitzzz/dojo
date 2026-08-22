# Spider-Web Architecture: Continuity Fix

## Problem
The roadmap was generating disconnected chapters (e.g., "Component State" → "Component Communication") with no logical flow, creating the "Frankenstein Teacher" effect.

## Solution Implemented

### 1. **Roadmap Prompt Rewrite** (`api/generate-roadmap/route.ts`)
- **New Rule**: "Each chapter MUST be a direct continuation of the previous one"
- **Structure**: Problem → Solution → New Problem (evolutionary chain)
- **Example Flow**:
  ```
  ✅ GOOD:
  Ch1: Local State Basics (useState)
  Ch2: When Local State Fails (prop drilling emerges)
  Ch3: Lifting State Up (solving prop drilling)
  Ch4: The Need for Global State (when lifting fails)
  
  ❌ BAD:
  Ch1: Component State (useState)
  Ch2: Component Communication (props) ← TOPIC JUMP!
  ```

### 2. **Anchor Channel Enforcement** (Frontend Integration)
- **Roadmap** now returns `anchorChannel` (e.g., "Academind")
- **Workspace** receives this and passes it to **every video search** in the module
- **Video API** prioritizes videos from the Anchor Channel (Tier 0 search)

**Flow:**
```
Roadmap API → anchorChannel: "Academind"
    ↓
Workspace → preferredChannel=Academind
    ↓
Video API → Searches "Academind [topic]" first
    ↓
Result: All videos in Module 1 from same teacher ✅
```

### 3. **Narrative Bridges** (Added to Schema)
- Each chapter now has a `narrativeBridge` field
- Format: "Now that you understand [previous], you'll notice [new problem]..."
- Frontend can display this to guide the user

## Files Changed
1. `src/app/api/generate-roadmap/route.ts` - Stricter prompt
2. `src/app/roadmap/page.tsx` - Pass anchorChannel to Workspace
3. `src/components/Workspace.tsx` - Accept and use anchorChannel

## Testing
Run the app and try **"Redux"** or **"Next.js"** with Student/Deep Dive.

**Expected:**
- Module titles should tell a story (not just "Module 1, Module 2")
- All videos in a module should be from the same channel (if available)
- Chapters should flow logically (no topic jumps)
