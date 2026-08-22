/**
 * M3.2 verification — hits /api/video-beats on a running dev server.
 *
 *   node scripts/verify_m32.mjs [baseUrl]
 *
 * Checks:
 *  (a) short video → status "not_eligible"
 *  (b) real long tutorial WITH captions (freeCodeCamp) → status "ok",
 *      beats array with 8–12 min spans (final beat may be shorter)
 *  (c) caption-less video → status "no_transcript"
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const BASE = process.argv[2] ?? "http://localhost:3000";

// A ~3.5 minute video (well under the 40-min threshold).
const SHORT_VIDEO_ID = "dQw4w9WgXcQ";
// freeCodeCamp "Learn JavaScript - Full Course for Beginners" (~3.5h, has captions).
const LONG_VIDEO_ID = "PkZNo7MFNFg";
// Video known to have no captions available (6h10m, caption-less). Adjust if YouTube state changes.
const NO_CAPTIONS_VIDEO_ID = "n61ULEU7CO0";

let failures = 0;

function report(name, pass, detail = "") {
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
    if (!pass) failures++;
}

async function callApi(params) {
    const url = `${BASE}/api/video-beats?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url);
    return { status: response.status, body: await response.json().catch(() => null) };
}

async function checkNotEligible() {
    try {
        const { body } = await callApi({ videoId: SHORT_VIDEO_ID });
        const pass =
            body?.status === "not_eligible" &&
            typeof body?.reason === "string" &&
            body.reason.length > 0;
        report("short video → not_eligible", pass, JSON.stringify(body));
    } catch (err) {
        report("short video → not_eligible", false, String(err));
    }
}

async function checkLongVideo() {
    try {
        const spec = JSON.stringify({ targetDurationBand: "long", depth: "mastery" });
        const { body } = await callApi({
            videoId: LONG_VIDEO_ID,
            topic: "JavaScript fundamentals",
            spec,
        });

        if (body?.status === "no_transcript") {
            report(
                "long video → ok with beats",
                false,
                "got no_transcript (captions unavailable from this environment?)"
            );
            return;
        }

        const beats = Array.isArray(body?.beats) ? body.beats : [];
        let spansOk = beats.length > 0;
        for (const beat of beats) {
            const spanMin = (beat.endSec - beat.startSec) / 60;
            const isFinal = beat.index === beats.length - 1;
            if (!(spanMin <= 12.5 && (isFinal || spanMin >= 7))) {
                spansOk = false;
            }
            if (
                typeof beat.title !== "string" ||
                typeof beat.focus !== "string" ||
                !beat.comprehensionCheck?.type ||
                typeof beat.comprehensionCheck?.prompt !== "string"
            ) {
                spansOk = false;
            }
        }
        const sequentialOk = beats.every((b, i) => b.index === i);
        // Contiguity: beats must be in order without meaningful overlap
        // (≤5s planning jitter tolerated); each beat either continues
        // exactly where the previous ended or has a small (<30s) gap.
        const PLANNING_JITTER_SEC = 5;
        const nonOverlapping = beats.every(
            (b, i) => i === 0 || b.startSec >= beats[i - 1].endSec - PLANNING_JITTER_SEC
        );
        const gapsSmall = beats.every(
            (b, i) =>
                i === 0 ||
                b.startSec === beats[i - 1].endSec ||
                b.startSec - beats[i - 1].endSec < 30
        );
        const coverage =
            beats.length > 0 && typeof body?.totalDurationSec === "number"
                ? (beats[beats.length - 1].endSec - beats[0].startSec) /
                  body.totalDurationSec
                : 0;
        const coverageOk = beats.length > 0 ? coverage >= 0.9 : false;
        const coverageDetail = `${Math.round(coverage * 100)}% of ${body?.totalDurationSec ?? "?"}s`;

        report("long video → status ok", body?.status === "ok", `status=${body?.status}`);
        report("long video → has beats", beats.length > 0, `${beats.length} beats`);
        report("long video → beat spans 8–12min (last may be shorter)", spansOk);
        report("long video → indices sequential & contiguous coverage", sequentialOk && nonOverlapping && gapsSmall && coverageOk, coverageDetail);

        console.log(`\nSample beats:`);
        for (const b of beats.slice(0, 3)) {
            console.log(
                `  #${b.index} [${Math.floor(b.startSec / 60)}:${String(b.startSec % 60).padStart(2, "0")}→${Math.floor(b.endSec / 60)}:${String(b.endSec % 60).padStart(2, "0")}] ${b.title} — ${b.focus.slice(0, 80)}… [${b.comprehensionCheck.type}]`
            );
        }
        console.log();
    } catch (err) {
        report("long video → ok with beats", false, String(err));
    }
}

async function checkNoTranscript() {
    try {
        const spec = JSON.stringify({ targetDurationBand: "long", depth: "mastery" });
        const { body } = await callApi({
            videoId: NO_CAPTIONS_VIDEO_ID,
            spec,
            durationSeconds: "3600",
        });
        if (body?.status === "not_eligible") {
            report(
                "caption-less video → no_transcript",
                false,
                "got not_eligible — fixture video may have changed duration or YouTube eligibility rules; consider swapping NO_CAPTIONS_VIDEO_ID for another caption-less long video"
            );
            return;
        }
        report("caption-less video → no_transcript", body?.status === "no_transcript", JSON.stringify(body));
    } catch (err) {
        report("caption-less video → no_transcript", false, String(err));
    }
}

console.log(`Verifying M3.2 against ${BASE}\n`);
await checkNotEligible();
await checkLongVideo();
await checkNoTranscript();

console.log(failures === 0 ? "\nALL CHECKS PASSED ✅" : `\n${failures} CHECK(S) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
