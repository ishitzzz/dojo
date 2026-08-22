#!/usr/bin/env node
// Milestone 1 verification — pure logic checks + optional live Data API test.
// Run: node --env-file=.env.local scripts/verify_m1.mjs
// (plain `node scripts/verify_m1.mjs` also works; live test is skipped without a key)

import assert from "node:assert/strict";
import {
  normalizeVideoSpec,
  bandToApiDuration,
  DEFAULT_VIDEO_SPEC,
} from "../src/utils/videoSpec.ts";

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

console.log("── normalizeVideoSpec: malformed inputs ─────────────────");

await check("M1: null returns full default", () => {
  const spec = normalizeVideoSpec(null);
  assert.deepStrictEqual(spec, DEFAULT_VIDEO_SPEC);
});

await check("M2: non-object primitive returns full default", () => {
  const spec = normalizeVideoSpec("make me a roadmap");
  assert.deepStrictEqual(spec, DEFAULT_VIDEO_SPEC);
});

await check("M3: empty object falls back per-field", () => {
  const spec = normalizeVideoSpec({});
  assert.deepStrictEqual(spec, DEFAULT_VIDEO_SPEC);
});

await check("M4: every field invalid enum/type returns defaults", () => {
  const spec = normalizeVideoSpec({
    targetDurationBand: "ultra",
    expectedMinutes: { min: 5, max: 30 },
    stylePriority: "tutorial",
    depth: "wizard",
  });
  assert.deepStrictEqual(spec, DEFAULT_VIDEO_SPEC);
});

await check("M5: valid band/styles/depth kept, numbers clamped, junk styles dropped", () => {
  const spec = normalizeVideoSpec({
    targetDurationBand: "long",
    expectedMinutes: [9999, -5],
    stylePriority: ["lecture", "vibes", "documentary"],
    depth: "mastery",
  });
  assert.strictEqual(spec.targetDurationBand, "long");
  assert.deepStrictEqual(spec.expectedMinutes, [240, 240]);
  assert.deepStrictEqual(spec.stylePriority, ["lecture", "documentary"]);
  assert.strictEqual(spec.depth, "mastery");
});

await check("V1: fully valid spec passes through unchanged", () => {
  const input = {
    targetDurationBand: "medium",
    expectedMinutes: [6, 18],
    stylePriority: ["deep_dive", "tutorial"],
    depth: "implementation",
  };
  assert.deepStrictEqual(normalizeVideoSpec(input), input);
});

console.log("── bandToApiDuration mapping ────────────────────────────");

await check("short -> short", () => {
  assert.strictEqual(bandToApiDuration("short"), "short");
});
await check("medium -> medium", () => {
  assert.strictEqual(bandToApiDuration("medium"), "medium");
});
await check("long -> long", () => {
  assert.strictEqual(bandToApiDuration("long"), "long");
});
await check("invalid band -> medium default", () => {
  assert.strictEqual(bandToApiDuration("colossal"), "medium");
  assert.strictEqual(bandToApiDuration(undefined), "medium");
  assert.strictEqual(bandToApiDuration(42), "medium");
});

console.log("── live YouTube Data API (videoDuration: long) ──────────");

if (!process.env.YOUTUBE_API_KEY) {
  console.log("SKIP  YOUTUBE_API_KEY not set — live test skipped");
} else {
  const { searchVideos, USE_YT_API } = await import("../src/utils/youtubeApi.ts");
  if (!USE_YT_API) {
    console.log("SKIP  key present at runtime check failed — env not loaded?");
  } else {
    await check("searchVideos(videoDuration:'long') returns results", async () => {
      const results = await searchVideos("docker networking explained", {
        maxResults: 10,
        videoDuration: "long",
      });
      assert.ok(Array.isArray(results));
      assert.ok(results.length > 0, "expected at least one result");
      globalThis.__m1LiveResults = results;
    });

    await check("all known durations > 240s (unknown counted, not failing)", () => {
      const results = globalThis.__m1LiveResults || [];
      let unknown = 0;
      for (const video of results) {
        if (!Number.isFinite(video.seconds) || video.seconds <= 0) {
          unknown++;
          continue;
        }
        assert.ok(
          video.seconds > 240,
          `${video.videoId} "${video.title.slice(0, 40)}" is ${video.seconds}s (<= 240s)`
        );
      }
      console.log(`      durations known: ${results.length - unknown}, unknown: ${unknown}`);
    });
  }
}

console.log("──────────────────────────────────────────────────────────");
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
