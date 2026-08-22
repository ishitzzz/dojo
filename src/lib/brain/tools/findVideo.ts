import { searchVideos } from "@/utils/youtubeApi";
import { bandToApiDuration } from "@/utils/videoSpec";
import type { BrainTool, ToolResult } from "./types";

// ═══════════════════════════════════════════════════════════════
// find_video — thin wrapper over the existing YouTube search.
//
// Deliberately does NOT duplicate the get-video pipeline (reranking,
// transcripts, vault, etc.); it surfaces raw candidates to the model
// so the tutor can reason about and pick videos itself.
// ═══════════════════════════════════════════════════════════════

const DURATION_BANDS = ["short", "medium", "long"] as const;
type Band = (typeof DURATION_BANDS)[number];

function parseBand(value: unknown): Band | undefined {
    return typeof value === "string" && (DURATION_BANDS as readonly string[]).includes(value)
        ? (value as Band)
        : undefined;
}

export const findVideoTool: BrainTool = {
    name: "find_video",
    description:
        "Find YouTube videos for a learning topic; optionally constrained by duration band",
    parameters: {
        type: "object",
        properties: {
            q: {
                type: "string",
                description: "Search query for the learning topic",
            },
            targetDurationBand: {
                type: "string",
                enum: [...DURATION_BANDS],
                description:
                    "Optional duration constraint: short (<4min), medium (4-20min), long (>20min)",
            },
        },
        required: ["q"],
    },

    async execute(args): Promise<ToolResult> {
        const q = typeof args.q === "string" ? args.q.trim() : "";
        if (!q) {
            return {
                content: JSON.stringify({ error: "Missing required parameter 'q'" }),
                success: false,
            };
        }

        const band = parseBand(args.targetDurationBand);

        try {
            const results = await searchVideos(q, {
                maxResults: 5,
                videoDuration: band ? bandToApiDuration(band) : undefined,
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const videos = results.slice(0, 3).map((v: any) => ({
                videoId: String(v.videoId),
                title: v.title ?? "",
                channel: v.author?.name ?? "Unknown",
                ...(typeof v.seconds === "number" && v.seconds > 0
                    ? { durationSeconds: v.seconds }
                    : {}),
            }));

            return {
                content: JSON.stringify({ query: q, band: band ?? null, videos }),
                sources: videos,
                success: true,
            };
        } catch (error) {
            // Tool failures are fed back to the model; the loop continues.
            return {
                content: `find_video failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
                success: false,
            };
        }
    },
};
