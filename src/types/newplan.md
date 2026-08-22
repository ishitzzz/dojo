# Unified Master Blueprint: Multi-Model Architecture & Pipeline Specification

This blueprint merges your original multi-model pipeline with the technical upgrades we have established—including the dual-engine execution model, client-side relay, zero-friction WebSocket bridge, dynamic tool routing, and three-tier memory architecture.

---

## 1. The Multi-Model Pipeline ("Enriched Context" Flow)

Your original sensory-and-reasoning hierarchy remains intact, upgraded with dedicated DOM and Canvas execution paths.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER TRIGGER & CAPTURE                          │
│         (ChatGPT text, active tab DOM, screenshot, extension input)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STEP A: INTENT & STRUCTURING                         │
│            Grok (Fast Intent) ──► Qwen 2.5 72B (Structuring)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               STEP B: INTELLIGENT NAVIGATION PIPELINE                   │
│              Crawl4AI Prefetch Tool (URL Resolution & 404 Check)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       STEP C: EXECUTION PATHWAY                        │
│   ┌───────────────────────────────┐   ┌────────────────────────────┐   │
│   │   DOM / Standard Web Apps     │   │   HTML5 Canvas / Design    │   │
│   │   (Midscene.js + GPT-4o Mini) │   │   (UI-TARS + Qwen-VL)      │   │
│   └───────────────┬───────────────┘   └─────────────┬──────────────┘   │
└───────────────────┼─────────────────────────────────┼──────────────────┘
                    │ (If Success)                    │ (If Failure / Blocker)
                    ▼                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    STEP D: ULTIMATE REASONER                           │
│      DeepSeek R1 (Strategic Decision, Failure Recovery & Re-Planning)  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Step A: Capture, Intent Parsing & Structuring
* **Trigger:** The extension activates via user prompt, active tab inspection, or a generated ChatGPT plan.
* **Grok:** Acts as the fast, low-latency entry filter to classify the initial intent (e.g., *Is this web automation, research, design, or email?*).
* **Qwen 2.5 72B:** Receives raw chat history, DOM metadata, and screenshots. It structures this data into a clean, step-by-step master plan and formats visual metadata.

### Step B: The Intelligent Navigation Pipeline ("The Link Factor")
* **The Problem:** LLMs often hallucinate URLs or output broken/vague links (e.g., `404 Not Found` or plain text like "Go to Figma").
* **Crawl4AI URL Resolver Tool:** Before any navigation occurs, Qwen routes target links through a dedicated URL Resolver tool powered by Crawl4AI in `prefetch` mode.
* **Execution:** Crawl4AI verifies whether the link resolves, extracts the canonical URL, and checks HTTP status codes in the background without launching a heavy headless browser. If a link is missing or broken, it executes a light search query to retrieve the verified, official URL before proceeding.

### Step C: Sensory Execution (Dual-Engine Routing)
Once a clean target URL is loaded, execution branches depending on the target page's underlying technology:

#### Pathway 1: Standard Web Pages (Midscene.js + GPT-4o Mini)
* Used for YouTube, Google Docs, Gmail, form filling, and standard DOM structures.
* **Midscene.js (Client-Side):** Takes a local snapshot of the active or hidden background tab and extracts a compact Accessibility Tree.
* **GPT-4o Mini (The Operator):** Receives the Accessibility Tree alongside the immediate action command. GPT-4o Mini identifies the exact interactive element ID and returns a JSON command.
* **Native Execution:** Midscene dispatches the click or keypress natively via the Chrome extension context.

#### Pathway 2: HTML5 Canvas & Complex Visual Apps (UI-TARS + Qwen-VL)
* Triggered when interacting with `<canvas>` elements (e.g., Figma) where no DOM node IDs exist.
* **UI-TARS:** Analyzes the viewport screenshot to calculate exact visual $(x, y)$ coordinates for tools, buttons, or canvas areas.
* **Qwen-VL:** Simultaneously inspects the screenshot to verify state (e.g., *"Rectangle tool selected, canvas is clear"*).
* **Scaling & Execution:** The extension normalizes coordinates against `window.devicePixelRatio` and dispatches native CDP mouse drag/click events.

### Step D: The Ultimate Reasoner (DeepSeek R1)
* **Role:** DeepSeek R1 does not write DOM queries or calculate visual coordinates. It acts purely as the high-level strategic brain.
* **Activation:** Invoked when Pathway 1 or Pathway 2 encounters an obstacle (e.g., `ElementNotInteractable`, modal overlay, unexpected captcha, or UI-TARS failure).
* **The Payload:** DeepSeek receives:
  * Static Anchor Memory (Original user goal + master plan).
  * Qwen's structured execution state.
  * UI-TARS thought log or Midscene failure error.
  * Qwen-VL's visual state analysis.
* **Decision Loop:** DeepSeek R1 evaluates the failure, adjusts the strategic path, and sends an updated directive back down to the execution layer. If more context is needed, it triggers a background tool to query ChatGPT, feeding the response back into Qwen to continue the loop.

---

## 2. Dynamic Tool Router & 100+ Tool Storage Strategy

To prevent blowing DeepSeek R1's context window or causing "schema paralysis" with dozens of tool definitions, tools are stored and retrieved using a two-tier vector routing system.

```
                              ┌───────────────────────────────┐
                              │  Massive Tool Library (100+)  │
                              │  (Stored in Vector DB / JSON)  │
                              └───────────────┬───────────────┘
                                              │
                                              ▼
┌──────────────────────────────┐     ┌────────────────────────────────┐
│   DeepSeek R1 Intent State   │────►│    Semantic Tool Router        │
└──────────────────────────────┘     │  (Vector Match Top 3 Tools)    │
                                     └────────────────┬───────────────┘
                                                      │
                                                      ▼
                                     ┌────────────────────────────────┐
                                     │  Active Context Window (4)     │
                                     │  • Tool 1 (Top Match)          │
                                     │  • Tool 2 (Top Match)          │
                                     │  • Tool 3 (Top Match)          │
                                     │  • search_tool_library         │
                                     │    (Safety Hatch)              │
                                     └────────────────────────────────┘
```

### Tool Library Storage
* All 100+ specialized tools (e.g., `switch_tab`, `close_tab`, `verify_url`, `fill_form_field`, `canvas_drag`) are stored as JSON schemas inside a light vector index (or local JSON manifest on Cloudflare Workers).

### Retrieval Flow
1. **Semantic Search Filtering:** When DeepSeek R1 states its current intent, the Tool Router runs a fast vector similarity search against the Tool Library to find the top 3 most relevant tool schemas.
2. **The "3 + 1" Schema Injection:** DeepSeek R1 is prompted with exactly 4 tools:
   * **Tools 1, 2, 3:** The top semantic matches provided by the router.
   * **Tool 4 (`search_tool_library`):** A permanent safety hatch tool.
3. **Safety Hatch Execution:** If the Tool Router selects the wrong tools, DeepSeek R1 invokes `search_tool_library("query")` to explicitly fetch the exact tool schema it requires from the database, preventing silent failures.

---

## 3. Unified Three-Tier Memory Architecture

To eliminate "catastrophic forgetting" and keep context usage tight, memory is distributed across three storage layers.

| Memory Tier | Storage Engine | Location | Lifetime | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Short-Term Edge** | **IndexedDB** | In-Browser (Client) | Active Session | Stores raw DOM snapshots, screen coordinates, and the last 2–3 execution steps. |
| **Episodic Memory** | **Pinecone** | Serverless Vector DB | Persistent | Stores embedded step-by-step traces of past *successful* tasks for semantic retrieval. |
| **Long-Term Anchor** | **MongoDB / Neon** | Serverless Backend | Permanent | Stores user profiles, personalization rules, session IDs, and master system prompts. |

### Context Window Structure

```
┌────────────────────────────────────────────────────────────────────────┐
│ THE ANCHOR (Static - Top Pinned)                                       │
│ • System Prompt & Personalization Rules                                │
│ • User's Original Objective                                            │
│ • Qwen's High-Level Master Plan                                        │
├────────────────────────────────────────────────────────────────────────┤
│ THE MIDDLE (Compressed - Dynamic)                                      │
│ • Summarized log of completed steps (e.g., "Steps 1-4 completed")      │
│ • Relevant past task insights retrieved from Pinecone                  │
├────────────────────────────────────────────────────────────────────────┤
│ THE EDGE (Raw - Sliding Window)                                        │
│ • Raw outputs from last 2-3 execution turns                            │
│ • Immediate UI-TARS coordinates / Midscene DOM node state              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Infrastructure, Network & Out-of-Band Integration

### Reverse WebSocket Architecture (Zero-UX-Friction)
To run the heavy orchestrator on a backend server while executing Midscene.js locally inside the extension without forcing users to configure local IP ports or bridge settings:

1. **Client Connection:** The Chrome extension background script initiates an outbound WebSocket connection (`wss://api.follome.app/agent-session`) to Cloudflare Workers.
2. **Duplex Messaging:** The backend streams action commands down the socket (`{"action": "aiTap", "target": "Save button"}`).
3. **Local Execution:** The extension receives the message, executes Midscene.js / `chrome.debugger` locally within the browser, and returns the result back up the WebSocket.

### Hardening OpenRouter Pipelines
To prevent API throttling and maximize provider prompt caching:
* **Sticky Routing:** Every OpenRouter request includes an `x-session-id` HTTP header. This routes consecutive agent turns to the exact same provider node, achieving high prompt-cache hit rates for static system instructions.
* **Rate-Limit Backoff:** The OpenRouter client SDK is configured with exponential backoff:
```javascript
const client = new OpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  retryConfig: {
    strategy: "backoff",
    maxRetries: 5,
    initialIntervalMs: 1000,
    maxIntervalMs: 16000
  }
});
```