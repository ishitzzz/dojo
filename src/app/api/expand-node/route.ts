import { generateContentWithFailover } from "@/utils/gemini";
import { NextResponse } from "next/server";
import { safeParseJsonObject } from "@/utils/safeJsonParser";

// ═══════════════════════════════════════════════════════════════
// EXPAND NODE API
// JIT generation of new nodes from user questions
// ═══════════════════════════════════════════════════════════════

interface ExpandRequest {
  parentNodeId: string;
  parentTitle: string;
  userQuestion: string;
  originTopic?: string;
}

interface NodeContent {
  introduction: string;
  sections: { heading: string; body: string }[];
}

interface NewNode {
  title: string;
  summary: string;
  content: NodeContent;
  youtubeQuery: string;
}

interface ExpandResponse {
  newNode: NewNode;
  edgeLabel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  suggestedPaths: any[];
}

export async function POST(req: Request) {
  try {
    const body: ExpandRequest = await req.json();
    const {
      parentNodeId,
      parentTitle,
      userQuestion,
      originTopic = "",
    } = body;

    if (!parentNodeId || !userQuestion) {
      return NextResponse.json(
        { error: "Missing parent node or question" },
        { status: 400 }
      );
    }

    const prompt = `
You are a friendly learning guide. A user is exploring a topic and asked a follow-up question.

CONTEXT:
- Original Learning Goal: "${originTopic}"
- Current Topic: "${parentTitle}"
- User's Question: "${userQuestion}"

YOUR TASK: Create a new learning node that answers their question.

CRITICAL RULES:
1. USE SIMPLE, CLEAR TITLES - No jargon. A 12-year-old should understand.
2. WRITE DETAILED EXPLANATIONS - Each section should have 3-5 sentences.
3. DIRECTLY ANSWER THEIR QUESTION - Don't go off on tangents.

EXAMPLE of good vs bad:
❌ BAD TITLE: "The Epistemological Framework of Visual Cognition"
✅ GOOD TITLE: "How Our Eyes See Color"

RETURN THIS JSON:
{
  "newNode": {
    "title": "Simple, clear title answering their question",
    "summary": "3-4 sentences that directly answer their question in plain language.",
    "content": {
      "introduction": "A welcoming paragraph (3-4 sentences) introducing this topic and connecting it to their question.",
      "sections": [
        {
          "heading": "The Simple Answer",
          "body": "2-3 sentences giving a direct, easy-to-understand answer."
        },
        {
          "heading": "Going Deeper",
          "body": "2-3 sentences adding more detail for curious learners."
        },
        {
          "heading": "Real-World Example",
          "body": "A concrete example or analogy that makes this tangible."
        },
        {
          "heading": "Try This",
          "body": "A simple exercise or something they can do to explore this."
        }
      ]
    },
    "youtubeQuery": "beginner tutorial [specific topic] explained simply"
  },
  "edgeLabel": "Short label (2-3 words) describing the connection",
  "suggestedPaths": [
    {
      "question": "A natural follow-up question they might ask next",
      "preview": "Brief preview of what they'd learn"
    },
    {
      "question": "Another follow-up question",
      "preview": "Brief preview"
    },
    {
      "question": "Third follow-up question",
      "preview": "Brief preview"
    }
  ]
}

REMEMBER:
- Simple language, no jargon
- Detailed explanations (not one-liners)  
- Directly answer their question
- The suggestedPaths help them explore further
`;

    const result = await generateContentWithFailover(prompt, {
      responseMimeType: "application/json",
      temperature: 0.7,
    });

    console.log(`🐇 Node Expanded [Model: ${result.modelUsed}]`);

    const data = safeParseJsonObject<ExpandResponse>(result.text);

    if (!data || !data.newNode) {
      throw new Error("Invalid expansion structure");
    }

    const newNodeId = `node-${Date.now()}`;

    const response = {
      newNode: {
        id: newNodeId,
        ...data.newNode,
        status: "ghost",
        parentId: parentNodeId,
      },
      edge: {
        id: `edge-${parentNodeId}-${newNodeId}`,
        sourceId: parentNodeId,
        targetId: newNodeId,
        edgeType: "deep_dive",
        label: data.edgeLabel || "Learn More",
      },
      suggestedPaths: data.suggestedPaths || [],
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("❌ Node Expansion Failed:", error);
    return NextResponse.json(
      {
        error: "Failed to expand node",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
