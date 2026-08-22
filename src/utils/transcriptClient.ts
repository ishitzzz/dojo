/**
 * 👂 Transcript Sentinel Client (Python Bridge)
 * 
 * Uses `youtube_transcript_api` (Python) to fetch the "Intro" (First 60s).
 * This bypasses the blocks that affect Node.js scrapers.
 */

import { exec } from "child_process";
import path from "path";
import util from "util";

const execPromise = util.promisify(exec);

export interface TranscriptSnippet {
    videoId: string;
    text: string;
    isAvailable: boolean;
}

/**
 * Fetch the first 60 seconds (approx 1000 chars) of a video's transcript.
 * Spawns a Python process to use the robust `youtube_transcript_api`.
 */
export async function fetchIntroTranscript(videoId: string): Promise<TranscriptSnippet> {
    try {
        // Path to the python script
        const scriptPath = path.join(process.cwd(), "src", "utils", "scripts", "fetch_transcript.py");

        // Execute python script
        // Note: Assumes 'python' is in PATH. In some envs it might be 'python3'.
        const { stdout } = await execPromise(`python "${scriptPath}" ${videoId}`);

        const result = JSON.parse(stdout.trim());

        if (result.error) {
            // console.warn(`⚠️ Transcript Error (${videoId}):`, result.error);
            return { videoId, text: "", isAvailable: false };
        }

        return {
            videoId: result.videoId,
            text: result.text || "",
            isAvailable: result.isAvailable || false
        };

    } catch (error) {
        // Python missing or script failure
        // console.error("❌ Transcript Bridge Error:", error);
        return { videoId, text: "", isAvailable: false };
    }
}

/**
 * Batch fetch intros for multiple videos (Parallel)
 */
export async function fetchIntroTranscripts(videoIds: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    // Run in parallel
    const promises = videoIds.map(id => fetchIntroTranscript(id));
    const snippets = await Promise.all(promises);

    snippets.forEach(snippet => {
        if (snippet.isAvailable && snippet.text.length > 0) {
            results.set(snippet.videoId, snippet.text);
        }
    });

    if (results.size > 0) {
        console.log(`👂 Peaked at transcripts for ${results.size} candidates (via Python).`);
    }

    return results;
}
