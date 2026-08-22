import { generateContentWithFailover } from "@/utils/gemini";
import { NextResponse } from "next/server";
import { safeParseJsonObject } from "@/utils/safeJsonParser";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { command, currentRoadmap, userContext } = body;

    const systemPrompt = `You are the Roadmap Surgeon for a learning platform. You control the entire learning pipeline.
You can: add/delete/reorder modules, change the anchor YouTube channel, change video language (append 'in Hindi'/'in Spanish' etc to queries), 
adjust difficulty (beginner/intermediate/advanced affects query words), find simpler/shorter videos, 
change specific chapter videos by modifying youtubeQuery. 
Parse the user command and return valid JSON SurgeonAction.
For CHANGE_ANCHOR: newAnchorChannel must be a real YouTube channel name.
For language changes: modify all youtubeQuery fields in the roadmap.
Be conversational in humanResponse.

Format:
{
  "type": "ACTION_TYPE",
  "payload": { ... },
  "humanResponse": "...",
  "requiresVideoRefetch": boolean
}

Available Action Types:
ADD_MODULE, DELETE_MODULE, CHANGE_ANCHOR, CHANGE_CHAPTER_VIDEO, CHANGE_LANGUAGE, CHANGE_DIFFICULTY, REORDER_MODULES, MODIFY_MODULE, FIND_SIMPLER_VIDEO, FIND_VIDEO_BY_LANGUAGE, EXPLAIN_PIPELINE_STATUS, CUSTOMIZE_RESOURCES

Crucial Payload Requirements:
- For ADD_MODULE: payload MUST contain a "module" object (e.g., {"module": {"moduleTitle": "...", "moduleDescription": "...", "chapters": []}, "at": 0})
- For DELETE_MODULE: payload MUST contain "moduleIndex" (e.g., {"moduleIndex": 2})
- For CHANGE_ANCHOR: payload MUST contain "newAnchorChannel" (e.g., {"newAnchorChannel": "Traversy Media"})

For CUSTOMIZE_RESOURCES: Use when user asks to "find more practice resources", "add exercises", "find a coding exercise", or similar requests about hands-on practice. Set humanResponse to explain what you're doing. payload can be {}.

If the user asks "what is happening", "pipeline status", or "show me":
Use EXPLAIN_PIPELINE_STATUS and respond with a human-readable breakdown.`;

    const promptStr = `
CURRENT ROADMAP STATE:
Modules: ${currentRoadmap?.modules?.length || 0}
Anchor Channel: ${currentRoadmap?.anchorChannel || 'None'}

USER CONTEXT:
${JSON.stringify(userContext || {})}

USER COMMAND:
"${command}"
`;

    const result = await generateContentWithFailover([systemPrompt, promptStr].join("\n\n"), {
      responseMimeType: "application/json",
      temperature: 0.2,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = safeParseJsonObject<any>(result.text);

    if (!parsed) {
      return NextResponse.json({
        type: "EXPLAIN_PIPELINE_STATUS",
        humanResponse: "I had trouble processing that command.",
        payload: { explanation: "Error parsing intent." },
        requiresVideoRefetch: false
      });
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Roadmap Surgeon error:", error);
    return NextResponse.json({
        type: "EXPLAIN_PIPELINE_STATUS",
        humanResponse: "Pipeline error.",
        payload: { explanation: "Error executing command." }
    });
  }
}
