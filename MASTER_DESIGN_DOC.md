# 🥋 The Learning Dojo & Nexus: Master Design Document / Blueprint

**Version:** 2.0 (Spider-Web Architecture)
**Status:** Living Specification
**Code Name:** Project Antigravity

---

## 📜 I. Executive Summary
This document serves as the comprehensive blueprint for replicating "The Learning Dojo" and "The Nexus"—a dual-mode educational ecosystem designed to bridge the gap between *information* (search results) and *knowledge* (structured understanding).

**The Core Concept:**
A hyper-personalized **Learning Operating System (OS)** that functions as a "Digital Sensei." It dynamically curates the chaotic web into two distinct but integrated views:
1.  **The Dojo**: A linear, disciplined, "First Principles" roadmap for structured mastery.
2.  **The Nexus**: A spatial, non-linear "Knowledge Graph" for curiosity-driven exploration.

---

## 🏗️ II. Technical Architecture (The Stack)

To replicate this system, you must use this specific high-performance, modern stack:

### **Frontend & Framework**
-   **Framework**: **Next.js 14+ (App Router)** - For server-side rendering and API route handling.
-   **Language**: **TypeScript** - Strict typing is non-negotiable for the complex data structures (Nodes, Edges, Modules).
-   **Styling**: **Tailwind CSS** - Utility-first styling for rapid UI development.
-   **Animation**: **Framer Motion** - Critical for the "living" feel (smooth transitions, layout animations).
-   **State Management**: **React Context / Zustand** (or refined local state) for managing the active learning session.
-   **Graph Visualization**: **React Flow** (customized) or **D3.js** - For the Nexus node-link diagram.

### **Backend & AI Intelligence**
-   **Server**: Next.js Server Actions / API Routes (Node.js runtime).
-   **Database**: **Supabase (PostgreSQL)** - For persistent user data, "Video Vault" caching, and relational data.
-   **Primary LLM (Orchestrator)**: **Google Gemini 2.5 Flash / Flash-Lite** - Handling complex reasoning, JSON structuring, and roadmap generation.
-   **Vision LLM**: **Groq (Llama 3.2 Vision)** - For instant, high-speed image analysis (Visual Assistant).
-   **Search Engine**: **YouTube Data API v3** (primary) + **SerpApi** (secondary web search).

---

## ⚙️ III. Core Engine: The "Spider-Web" System
*This is the "Brain" of the application, replacing simple search with intelligent curation.*

### **1. The "Hidden Gem" Search Logic**
We do not just "search YouTube." We perform a multi-stage **Search & Rescue** operation for quality content.

**Phase A: Query Expansion (The Net)**
-   **Input**: User Goal (e.g., "Learn React").
-   **Process**: The LLM generates 3 distinct search sub-queries based on the user's **Experience Level**:
    -   *Beginner*: "React tutorial for total beginners 2024", "React fundamental concepts explained"
    -   *Deep Dive*: "React fiber architecture deep dive", "React reconciliation algorithm"
    -   *Troubleshooting*: "Common React hooks mistakes", "React performance anti-patterns"

**Phase B: Metadata Heuristic Filter (The Sieve)**
-   **Raw Fetch**: We fetch ~50 videos from YouTube.
-   **Algorithmic Filter**: We apply hard rules to discard "slop":
    -   *Duration*: Must be > 10 mins (unless "Quick Tip" mode).
    -   *Description*: **MUST** contain high-value keywords (e.g., "github", "source code", "timestamp", "documentation").
    -   *Negative Weighting*: Penalize titles with "Shocked Face" emojis, all-caps clickbait, or "In 5 Minutes" claims.

**Phase C: Vibe-Check Reranking (The Judge)**
-   **The "Judge" LLM**: We feed the metadata (Title, Channel, Description, Transcript Snippet) of the top candidates to a lightweight LLM.
-   **Criteria**:
    -   *Academic Rigor*: Does it teach "First Principles"?
    -   *Signal-to-Noise*: Is the intro too long?
    -   *Vibe Match*: Does the creator's tone match the user's requesting persona (e.g., "Serious Engineer" vs. "Casual Hobbyist")?

### **2. Personalization Engine**
-   **The Context Sieve**: Before generating anything, we run the user's goal through a "Disambiguation Layer."
    -   *Input*: "Python"
    -   *Sieve Check*: "Do you mean Python for Data Science, Web Dev, or Scripting?"
    -   *Result*: Refines the prompt to ensure the roadmap is relevant.
-   **Anchor Channel Selection**:
    -   The system identifies a single high-quality creator (e.g., "The Net Ninja" or "Fireship") that covers 60%+ of the roadmap topics.
    -   This creator becomes the "Anchor." Their videos are prioritized to ensure **Narrative Continuity** (same voice, same teaching style).

---

## 🥋 IV. Feature: The Dojo (Structure)
*The Linear, Disciplined Path to Mastery.*

### **1. First Principles Roadmap Architecture**
The roadmap is *not* a list of video titles. It is a generated **Curriculum Tree** structured by cognitive load.
-   **Level 1: The Primitive State** (What is this *without* the tools? e.g., "Vanilla JS before React").
-   **Level 2: The Atomic Truths** (The core, unchangeable concepts. e.g., "State", "Props").
-   **Level 3: The Abstractions** (The tools that make it easier. e.g., "Redux", "Hooks").
-   **Level 4: The Project** (Synthesis of knowledge).

### **2. The Workspace (The "Dojang")**
When a user clicks a module, they enter the **Workspace View**:
-   **The Stage**: A distraction-free video player (custom wrapper).
-   **The Syllabus**: A strictly ordered list of "Chapters" (videos) for that module.
-   **The Checkpoint**: A mandatory "Mini-Quiz" or "Code Challenge" verification step before unlocking the next module.

---

## 🕸️ V. Feature: The Nexus (Exploration)
*The Spatial, Non-Linear Knowledge Graph.*

### **1. Knowledge Cartography & "Fog of War"**
-   **Origin Node**: The user's starting point (e.g., "Machine Learning"). It is fully lit and active.
-   **Ghost Nodes**: The system predicts adjacent concepts (e.g., "Linear Algebra", "Python", "Neural Networks"). These appear as semi-transparent "Ghosts" connected to the Origin.
-   **The Fog**: Nodes 2-3 degrees away are hidden or dim. They only reveal themselves as the user "travels" (clicks) toward them.

### **2. Dynamic Spawning (Just-In-Time Generation)**
-   The Nexus is **infinite**. We do not generate the whole graph at once.
-   **Trigger**: When a user clicks a "Ghost Node," the system triggers a `generate-nexus-branch` API call.
-   **Action**:
    1.  The clicked node becomes "Active" (Solid).
    2.  The LLM generates 3-5 *new* Ghost Nodes related to this new topic.
    3.  The graph physically expands, pushing boundaries outward.

### **3. Semantic Edges**
Connections between nodes are not just lines; they have **types**:
-   **"Prerequisite"** (Arrow pointing forward): You strictly need A to understand B.
-   **"Deep Dive"** (Thicker line): B is a more complex version of A.
-   **"Related"** (Dotted line): Contextual link (e.g., "History of...").

---

## 🧠 VI. AI Assistants & Intelligence Layers

### **1. Visual Assistant (The "Eye")**
-   **Tech**: Groq API + Llama 3.2 Vision.
-   **Workflow**:
    1.  User pauses video on a complex diagram or code block.
    2.  User captures/uploads screenshot.
    3.  Vision AI analyzes the *pixels* + *module context*.
    4.  **Output**: A detailed breakdown of the visual ("This is a React `useEffect` hook causing a re-render loop because...").

### **2. Chat Companion (The "Whisperer")**
-   **Context-Aware**: It knows exactly which Module and Chapter the user is currently viewing.
-   **RAG (Retrieval Augmented Generation)**: It can "read" the transcript of the current video to answer specific questions ("What did he say about the dependency array?").

---

## 🎨 VII. UI/UX Design System
*Aesthetic Goal: "Cyberpunk Zen" - High-tech functionality with a calm, focused atmosphere.*

### **1. Visual Language**
-   **Palette**: Deep Void Black (`#0a0a0a`), Neon Teal (`#2dd4bf`), Electric Blue (`#3b82f6`).
-   **Materials**: Glassmorphism (Backdrop Blur), Thin Borders (`1px` border-white/10), Subtle Glows.
-   **Typography**: **Inter** (UI) + **JetBrains Mono** (Code/Technical Terms).

### **2. Interaction Design**
-   **Micro-Interactions**: Hovering a node causes it to "pulse." Completing a task triggers a "success particle" explosion.
-   **Transitions**: No hard cuts. Pages "morph" into each other using `AnimatePresence`.
-   **Feedback**: Loading states are never just spinners. They are "Constructing Neural Pathways..." or "Decrypting Signal..." text animations.

---

## 💾 VIII. Data Strategy & Persistence

### **1. The "Video Vault" (Caching)**
To prevent "Sloppiness" (slow API calls):
-   **Table**: `video_vault` in Supabase.
-   **Key**: `hashed_search_query` + `filters`.
-   **Value**: The full JSON array of curated, reranked videos.
-   **Logic**: Before calling YouTube/Gemini, check the Vault. If hit -> Return instantly (100ms). If miss -> Generate & Store (5s).

### **2. Nexus State**
-   We persist the user's unique "Explored Graph" structure.
-   Every node they unlock is saved.
-   This allows them to "resume" their journey exactly where they left off in the infinite void.
