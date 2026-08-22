import ytSearch from "yt-search";

async function test() {
  try {
    const res = await ytSearch("data structures in c");
    console.log("ytSearch successful:", res.videos.length, "videos found");
  } catch (err) {
    console.error("ytSearch failed:", err);
  }
}

test();
