/**
 * 🎙️ Provider 4 — Groq Whisper ASR (last resort, caption-less videos)
 *
 * Downloads the audio track (via the yt-dlp binary) and transcribes it with
 * whisper-large-v3-turbo on Groq (~$0.04/hr). This works even when YouTube
 * captions don't exist at all — it never touches YouTube's caption systems,
 * so it keeps functioning through any policy change.
 *
 * Long videos are handled by downloading overlapping 10-minute sections;
 * segment timestamps are re-based onto the global timeline.
 */

import { spawnSync } from "node:child_process";
import { access, constants as fsConstants, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchContext, ProviderOutcome, TranscriptProvider } from "../types";
import { findBinary, run as runYtDlp } from "./ytdlp";

const GROQ_MODEL = "whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 23 * 1024 * 1024;
/** Guard rail so a stray request can't silently burn hours of ASR credits. */
const MAX_DURATION_SECONDS = Number(process.env.TRANSCRIPT_ASR_MAX_SECONDS ?? 4 * 60 * 60);
const CHUNK_SECONDS = 600;
const OVERLAP_SECONDS = 30;

let ffmpegPath: string | null | undefined;

async function locateFfmpeg(): Promise<string | null> {
    if (ffmpegPath !== undefined) return ffmpegPath;

    const candidates = [
        process.env.FFMPEG_PATH,
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ];

    for (const path of candidates) {
        if (!path) continue;
        try {
            await access(path, fsConstants.X_OK);
            ffmpegPath = path;
            return ffmpegPath;
        } catch {
            continue;
        }
    }

    const which = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
    ffmpegPath = which.status === 0 && which.stdout.trim() ? which.stdout.trim() : null;
    return ffmpegPath;
}

interface VerboseSegment {
    start?: number;
    end?: number;
    text?: string;
}

async function transcribeFile(
    filePath: string
): Promise<VerboseSegment[]> {
    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const response = await groq.audio.transcriptions.create({
        file: createReadStream(filePath),
        model: GROQ_MODEL,
        response_format: "verbose_json",
        temperature: 0,
    });

    const segments = (response as unknown as { segments?: VerboseSegment[] }).segments ?? [];
    return segments.filter((segment) => typeof segment.start === "number");
}

async function downloadAudio(videoId: string, dir: string, section?: { start: number; end: number }): Promise<string> {
    const args = [
        "-f",
        "bestaudio/best",
        "-o",
        join(dir, section ? `chunk_${section.start}.%(ext)s` : "audio.%(ext)s"),
    ];

    if (section) {
        args.push("--download-sections", `"*${section.start}-${section.end}"`);
        args.push("--force-keyframes-at-cuts");
    }

    if (await locateFfmpeg()) {
        args.push("-x", "--audio-format", "opus", "--postprocessor-args", "ffmpeg:-ac 1 -ar 16000");
    }

    args.push("--no-warnings", `https://www.youtube.com/watch?v=${videoId}`);

    await runYtDlp(args, 300_000);

    const files = await readdir(dir);
    const audioFile = files.find((file) => section ? file.startsWith(`chunk_${section.start}.`) : file.startsWith("audio."));
    if (!audioFile) throw new Error("audio file was not produced");
    return join(dir, audioFile);
}

async function asrAvailable(): Promise<boolean> {
    if (process.env.TRANSCRIPT_ASR_DISABLED === "1") return false;
    if (!process.env.GROQ_API_KEY) return false;
    return (await findBinary()) !== null;
}

export const whisperProvider: TranscriptProvider = {
    name: "whisper",

    async isAvailable(): Promise<boolean> {
        return asrAvailable();
    },

    async fetch(ctx: FetchContext): Promise<ProviderOutcome> {
        let dir: string | null = null;

        try {
            if (!(await asrAvailable())) {
                return { status: "error", detail: "ASR unavailable (missing GROQ_API_KEY or yt-dlp)" };
            }

            dir = await mkdtemp(join(tmpdir(), "tf-whisper-"));

            let durationSeconds: number | undefined;
            try {
                const { stdout } = await runYtDlp([
                    "--dump-single-json",
                    "--no-warnings",
                    "--skip-download",
                    `https://www.youtube.com/watch?v=${ctx.videoId}`,
                ]);
                durationSeconds = (JSON.parse(stdout) as { duration?: number }).duration;
            } catch {
                durationSeconds = undefined;
            }

            if (durationSeconds && durationSeconds > MAX_DURATION_SECONDS) {
                return {
                    status: "error",
                    detail: `video too long for ASR (${Math.round(durationSeconds)}s > ${MAX_DURATION_SECONDS}s)`,
                };
            }

            const segments: { text: string; offsetMs: number; durationMs: number }[] = [];
            let highWaterMs = 0;

            const hasFfmpeg = Boolean(await locateFfmpeg());
            // 16 kbps mono opus ≈ 2000 bytes/sec once ffmpeg post-processing runs.
            const estimatedBytes = (durationSeconds ?? Infinity) * 2_000;
            const needsChunking = hasFfmpeg && Boolean(durationSeconds) && estimatedBytes > MAX_AUDIO_BYTES;

            if (needsChunking && durationSeconds) {
                const step = CHUNK_SECONDS - OVERLAP_SECONDS;
                for (let start = 0; start < durationSeconds; start += step) {
                    const end = Math.min(start + CHUNK_SECONDS, durationSeconds);
                    const chunkPath = await downloadAudio(ctx.videoId, dir, { start, end });
                    const chunkSegments = await transcribeFile(chunkPath);

                    for (const seg of chunkSegments) {
                        const globalStartMs = Math.round((start + (seg.start ?? 0)) * 1000);
                        if (globalStartMs < highWaterMs - 250) continue;
                        const endMs = Math.round((start + (seg.end ?? seg.start ?? 0)) * 1000);
                        highWaterMs = Math.max(highWaterMs, endMs);
                        segments.push({
                            text: (seg.text ?? "").trim(),
                            offsetMs: globalStartMs,
                            durationMs: Math.max(0, endMs - globalStartMs),
                        });
                    }
                }
            } else {
                const audioPath = await downloadAudio(ctx.videoId, dir);
                const { size } = await stat(audioPath);
                if (size > MAX_AUDIO_BYTES) {
                    return {
                        status: "error",
                        detail: `audio too large (${Math.round(size / 1e6)}MB) and ffmpeg unavailable for chunking`,
                    };
                }
                const rawSegments = await transcribeFile(audioPath);
                for (const seg of rawSegments) {
                    segments.push({
                        text: (seg.text ?? "").trim(),
                        offsetMs: Math.round((seg.start ?? 0) * 1000),
                        durationMs: Math.round((((seg.end ?? seg.start) ?? 0) - (seg.start ?? 0)) * 1000),
                    });
                }
            }

            const usable = segments.filter((segment) => segment.text.length > 0);
            if (!usable.length) {
                return { status: "error", detail: "ASR produced no usable segments" };
            }

            return {
                status: "ok",
                transcript: {
                    segments: usable,
                    language: "en",
                    isAutoGenerated: true,
                },
                detail: `${GROQ_MODEL}, ${usable.length} segments`,
            };
        } catch (error) {
            return {
                status: "error",
                detail: error instanceof Error ? error.message : String(error),
            };
        } finally {
            if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    },
};
