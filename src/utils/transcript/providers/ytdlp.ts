/**
 * 🛠️ Provider 3 — yt-dlp subtitles
 *
 * yt-dlp is the community's countermeasure to YouTube breakage: extractor
 * fixes usually land within hours of a policy change. The binary is managed
 * by youtube-dl-exec (auto-downloaded at install) or a system install.
 */

import { spawn } from "node:child_process";
import { access, constants as fsConstants } from "node:fs/promises";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchContext, ProviderOutcome, TranscriptProvider } from "../types";
import { dedupeConsecutive, parseVtt } from "../shared";

interface YtDlpProbe {
    id?: string;
    duration?: number;
    subtitles?: Record<string, unknown[]>;
    automatic_captions?: Record<string, unknown[]>;
}

let cachedBinaryPath: string | null | undefined;

async function firstExecutable(paths: (string | undefined)[]): Promise<string | null> {
    for (const path of paths) {
        if (!path) continue;
        try {
            await access(path, fsConstants.X_OK);
            return path;
        } catch {
            continue;
        }
    }
    return null;
}

/** Locate a usable yt-dlp binary once per process. */
export async function findBinary(): Promise<string | null> {
    if (cachedBinaryPath !== undefined) return cachedBinaryPath;

    cachedBinaryPath = await firstExecutable([
        process.env.YTDLP_PATH,
        join(process.cwd(), "node_modules", "youtube-dl-exec", "bin", "yt-dlp"),
        "/opt/homebrew/bin/yt-dlp",
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
    ]);

    if (!cachedBinaryPath) {
        console.warn("⚠️ [transcript] yt-dlp binary not found — provider disabled");
    }
    return cachedBinaryPath;
}

export class YtDlpError extends Error {
    readonly stderr: string;
    constructor(message: string, stderr = "") {
        super(message);
        this.name = "YtDlpError";
        this.stderr = stderr;
    }
}

export function run(args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
    return new Promise(async (resolve, reject) => {
        const bin = await findBinary();
        if (!bin) {
            reject(new YtDlpError("yt-dlp binary not available"));
            return;
        }

        const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new YtDlpError(`timed out after ${timeoutMs}ms`, stderr));
        }, timeoutMs);

        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(new YtDlpError(error.message));
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new YtDlpError(`exited ${code}`, stderr));
        });
    });
}

const LANG_FALLBACKS = ["en", "en-US", "en-GB", "en-orig"];

function pickLanguage(captions: Record<string, unknown[]> | undefined): string | null {
    if (!captions) return null;
    const keys = Object.keys(captions);
    if (!keys.length) return null;

    const exactEnglish = keys.find((key) => key.toLowerCase() === "en");
    if (exactEnglish) return exactEnglish;
    for (const fallback of LANG_FALLBACKS) {
        const hit = keys.find((key) => key.toLowerCase() === fallback.toLowerCase());
        if (hit) return hit;
    }
    return keys.find((key) => key.toLowerCase().startsWith("en")) ?? keys[0];
}

async function probe(videoId: string): Promise<YtDlpProbe> {
    const { stdout } = await run([
        "--dump-single-json",
        "--no-warnings",
        "--skip-download",
        `https://www.youtube.com/watch?v=${videoId}`,
    ]);
    return JSON.parse(stdout) as YtDlpProbe;
}

async function downloadSubtitleTrack(
    videoId: string,
    dir: string,
    langKey: string,
    isAuto: boolean
): Promise<string> {
    const args = [
        "--skip-download",
        "--no-warnings",
        "--sub-format",
        "vtt/best",
        "--sub-langs",
        langKey,
        isAuto ? "--write-auto-subs" : "--write-subs",
        "-o",
        join(dir, "%(id)s"),
        `https://www.youtube.com/watch?v=${videoId}`,
    ];

    try {
        await run(args);
    } catch (error) {
        if (error instanceof YtDlpError && /no subtitles/i.test(error.stderr)) {
            throw new NoSubtitlesError(langKey);
        }
        throw error;
    }

    const files = await readdir(dir);
    const trackFile = files.find((file) => file.endsWith(".vtt"));
    if (!trackFile) throw new NoSubtitlesError(langKey);

    const content = await readFile(join(dir, trackFile), "utf8");
    if (!content.includes("-->")) throw new Error("subtitle file contains no cues");
    return content;
}

export class NoSubtitlesError extends Error {
    constructor(langKey: string) {
        super(`no subtitle track written for ${langKey}`);
        this.name = "NoSubtitlesError";
    }
}

export const ytdlpProvider: TranscriptProvider = {
    name: "ytdlp",

    async isAvailable(): Promise<boolean> {
        return (await findBinary()) !== null;
    },

    async fetch(ctx: FetchContext): Promise<ProviderOutcome> {
        let dir: string | null = null;
        try {
            if (!(await findBinary())) {
                return { status: "error", detail: "yt-dlp binary unavailable" };
            }

            let info: YtDlpProbe;
            try {
                info = await probe(ctx.videoId);
            } catch (error) {
                return {
                    status: "error",
                    detail: `probe failed: ${error instanceof Error ? error.message : String(error)}`,
                };
            }

            const manualKeys = Object.keys(info.subtitles ?? {});
            const autoKeys = Object.keys(info.automatic_captions ?? {});
            if (!manualKeys.length && !autoKeys.length) {
                return { status: "no_captions", detail: "probe shows zero manual and automatic tracks" };
            }

            const wanted = ctx.preferredLang?.toLowerCase();
            let langKey = pickLanguage(info.subtitles) ?? pickLanguage(info.automatic_captions);
            let isAuto = false;

            if (wanted) {
                const manualExact = manualKeys.find((k) => k.toLowerCase() === wanted);
                const autoExact = autoKeys.find((k) => k.toLowerCase() === wanted);
                if (manualExact) {
                    langKey = manualExact;
                    isAuto = false;
                } else if (autoExact) {
                    langKey = autoExact;
                    isAuto = true;
                }
            }
            if (!langKey) {
                return { status: "no_captions", detail: "tracks exist but none selectable" };
            }
            if (info.subtitles?.[langKey]) isAuto = false;
            else if (info.automatic_captions?.[langKey]) isAuto = true;

            dir = await mkdtemp(join(tmpdir(), "tf-ytdlp-"));
            const vttBody = await downloadSubtitleTrack(ctx.videoId, dir, langKey, isAuto);
            const segments = dedupeConsecutive(parseVtt(vttBody));

            if (!segments.length) {
                return { status: "error", detail: "parsed subtitle file was empty" };
            }

            return {
                status: "ok",
                transcript: {
                    segments,
                    language: langKey,
                    isAutoGenerated: isAuto,
                },
                detail: `track=${langKey}${isAuto ? " (asr)" : ""}`,
            };
        } catch (error) {
            if (error instanceof NoSubtitlesError) {
                return { status: "no_captions", detail: error.message };
            }
            return {
                status: "error",
                detail: error instanceof Error ? error.message : String(error),
            };
        } finally {
            if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    },
};
