/**
 * validateResourceUrls.ts
 *
 * Validates each practiceResource URL by sending a HEAD request.
 * If the URL is unreachable (DNS failure, 404, 4xx, etc.) it replaces
 * it with a guaranteed-working fallback: a Google search for the resource
 * title + topic. This keeps the feature fully intact — the card still
 * shows, the link still opens something useful — we just never send the
 * user to a dead page.
 */

interface PracticeResource {
  type: "visualization" | "interactive" | "article" | "exercise" | "tool";
  title: string;
  url: string;
  why: string;
  effort: "5 min" | "15 min" | "30 min+";
  emoji: string;
}

/** Domains that block HEAD/GET from servers (CORS/robots) but are definitely real */
const TRUSTED_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "github.com",
  "mdn.mozilla.org",
  "developer.mozilla.org",
  "en.wikipedia.org",
  "arxiv.org",
  "kaggle.com",
  "colab.research.google.com",
  "leetcode.com",
  "hackerrank.com",
  "codepen.io",
  "replit.com",
  "jsfiddle.net",
  "stackblitz.com",
  "phet.colorado.edu",
  "wolframalpha.com",
  "numpy.org",
  "pytorch.org",
  "tensorflow.org",
  "docs.python.org",
  "docs.oracle.com",
  "cppreference.com",
  "rust-lang.org",
  "go.dev",
];

/** Safe search-level URLs per domain — used when AI gives a deep path that 404s */
const DOMAIN_SEARCH_TEMPLATES: Record<string, (title: string, topic: string) => string> = {
  "visualgo.net": (_, t) => `https://visualgo.net/en/${encodeURIComponent(t.toLowerCase().replace(/\s+/g, ""))}`,
  "brilliant.org": (title) => `https://brilliant.org/search/?q=${encodeURIComponent(title)}`,
  "khanacademy.org": (title) => `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(title)}`,
  "3blue1brown.com": () => `https://www.3blue1brown.com/`,
  "betterexplained.com": (title) => `https://betterexplained.com/?s=${encodeURIComponent(title)}`,
  "observablehq.com": (title) => `https://observablehq.com/search?query=${encodeURIComponent(title)}`,
  "desmos.com": () => `https://www.desmos.com/calculator`,
  "geogebra.org": (title) => `https://www.geogebra.org/search/${encodeURIComponent(title)}`,
  "scratch.mit.edu": () => `https://scratch.mit.edu/`,
  "codecademy.com": (title) => `https://www.codecademy.com/search?query=${encodeURIComponent(title)}`,
  "freecodecamp.org": (title) => `https://www.freecodecamp.org/news/search/?query=${encodeURIComponent(title)}`,
  "geeksforgeeks.org": (title) => `https://www.geeksforgeeks.org/search/?query=${encodeURIComponent(title)}`,
  "towardsdatascience.com": (title) => `https://towardsdatascience.com/search?q=${encodeURIComponent(title)}`,
  "medium.com": (title) => `https://medium.com/search?q=${encodeURIComponent(title)}`,
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isTrustedDomain(url: string): boolean {
  const domain = extractDomain(url);
  return TRUSTED_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

function googleSearchFallback(title: string, topic: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} ${topic}`)}`;
}

function buildFallbackUrl(url: string, title: string, topic: string): string {
  const domain = extractDomain(url);
  const template = DOMAIN_SEARCH_TEMPLATES[domain];
  if (template) return template(title, topic);
  return googleSearchFallback(title, topic);
}

async function checkUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      // Some sites reject requests without a user-agent
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LearningDojoBot/1.0)" },
    });
    clearTimeout(timer);
    // Accept any 2xx or 3xx — the redirect itself means the page exists
    return res.status < 400;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

/**
 * Main export: validates every resource URL in parallel.
 * Dead URLs are replaced with a working fallback. Shape is preserved.
 */
export async function validateResourceUrls(
  resources: PracticeResource[],
  topic: string
): Promise<PracticeResource[]> {
  if (!resources || resources.length === 0) return [];

  const results = await Promise.all(
    resources.map(async (resource) => {
      // Skip check for known-safe domains that block server-side requests
      if (isTrustedDomain(resource.url)) {
        return resource;
      }

      const isAlive = await checkUrl(resource.url);

      if (isAlive) {
        return resource;
      }

      // URL is dead — build a working fallback
      const fallbackUrl = buildFallbackUrl(resource.url, resource.title, topic);
      console.log(`[ResourceValidator] Dead URL replaced: ${resource.url} → ${fallbackUrl}`);

      return {
        ...resource,
        url: fallbackUrl,
        // Add a small hint in the why text that this is a search result
        why: resource.why + " (Opens search — direct page unavailable.)",
      };
    })
  );

  return results;
}
