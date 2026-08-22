/**
 * validateResourceUrls.ts
 *
 * Validates each resource URL server-side (HEAD probe with GET fallback,
 * 6s timeout, fully parallel).
 *
 * Contract (regression fix — NEVER substitute a search URL):
 * - Working URLs pass through completely untouched.
 * - Failed URLs keep their ORIGINAL url and are flagged
 *   {urlStatus:"unverified"} so the UI can render a "we couldn't verify
 *   this link" hint. We never rewrite them to Google/domain searches.
 * - A resource is dropped ONLY when its url is literally malformed
 *   (unparseable or not an absolute http(s) URL).
 */

interface ResourceLike {
  title: string;
  url: string;
  why?: string;
  urlStatus?: "ok" | "unverified";
}

/** Rejects LLM-hallucinated search links at generation-parse time. */
export function isSearchEngineUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return (
      host === "google.com" ||
      host.endsWith(".google.com") ||
      host === "bing.com" ||
      host === "duckduckgo.com"
    );
  } catch {
    return false;
  }
}

function isWellFormedHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function checkUrl(url: string, timeoutMs = 6000): Promise<boolean> {
  // Some sites reject bare HEAD probes; retry once with GET before giving up.
  for (const method of ["HEAD", "GET"] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LearningDojoBot/1.0)" },
      });
      clearTimeout(timer);
      if (res.status < 400) return true;
      if (method === "GET") return false;
    } catch {
      clearTimeout(timer);
      if (method === "GET") return false;
    }
  }
  return false;
}

/**
 * Main export: validates every resource URL in parallel.
 *
 * Behavior:
 * - alive        → resource returned unchanged (urlStatus:"ok")
 * - unreachable  → ORIGINAL url kept, urlStatus set to "unverified"
 * - malformed    → resource dropped entirely (not a http(s) URL)
 */
export async function validateResourceUrls<
  T extends ResourceLike
>(resources: T[], _topic?: string): Promise<T[]> {
  void _topic; // kept for backward-compatible call sites; no longer used

  if (!resources || resources.length === 0) return [];

  const results = await Promise.all(
    resources.map(async (resource) => {
      if (!isWellFormedHttpUrl(resource.url)) {
        console.warn(
          `[ResourceValidator] Dropped malformed URL for "${resource.title}": ${resource.url}`
        );
        return null;
      }

      if (isSearchEngineUrl(resource.url)) {
        console.warn(
          `[ResourceValidator] Dropped search-engine URL for "${resource.title}": ${resource.url}`
        );
        return null;
      }

      const isAlive = await checkUrl(resource.url);

      if (isAlive) {
        return { ...resource, urlStatus: "ok" } as T;
      }

      console.log(
        `[ResourceValidator] Unverified URL kept as-is (flagged): "${resource.title}" -> ${resource.url}`
      );
      return { ...resource, urlStatus: "unverified" } as T;
    })
  );

  return results.filter((r) => r !== null) as T[];
}
