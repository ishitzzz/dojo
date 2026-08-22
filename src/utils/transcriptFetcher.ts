/**
 * 📝 Transcript Fetcher
 * Handles YouTube transcript extraction for content analysis.
 * Uses free tier approaches with graceful fallbacks.
 */

export interface TranscriptResult {
    success: boolean;
    transcript: string;
    source: "captions" | "description" | "none";
    language?: string;
    isLowDensity: boolean;
}

export interface TranscriptSegment {
    text: string;
    start: number;
    duration: number;
}

/**
 * Fetch transcript using YouTube's timedtext API (free approach)
 * This is a lightweight approach that doesn't require API keys
 */
export async function fetchTranscript(
    videoId: string
): Promise<TranscriptResult> {
    try {
        // Attempt to fetch transcript via YouTube's internal API
        const transcript = await fetchYouTubeTranscript(videoId);

        if (transcript && transcript.length > 100) {
            return {
                success: true,
                transcript,
                source: "captions",
                isLowDensity: false,
            };
        }

        // Fallback: Try to get video description
        const description = await fetchVideoDescription(videoId);
        if (description && description.length > 50) {
            return {
                success: true,
                transcript: description,
                source: "description",
                isLowDensity: true,  // Flag as low density since it's just description
            };
        }

        return {
            success: false,
            transcript: "",
            source: "none",
            isLowDensity: true,
        };

    } catch (error) {
        console.error(`❌ Transcript fetch failed for ${videoId}:`, error);
        return {
            success: false,
            transcript: "",
            source: "none",
            isLowDensity: true,
        };
    }
}

/**
 * Fetch transcript using YouTube's timedtext endpoint
 */
async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
    try {
        // First, get the video page to extract caption track info
        const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(videoPageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        // Extract caption track URL from the page
        const captionTrackMatch = html.match(
            /"captionTracks":\s*\[([^\]]+)\]/
        );

        if (!captionTrackMatch) {
            console.log(`ℹ️ No captions found for ${videoId}`);
            return null;
        }

        // Parse the caption tracks
        const captionTracksStr = `[${captionTrackMatch[1]}]`;

        // Find the English caption track URL
        const baseUrlMatch = captionTracksStr.match(
            /"baseUrl":\s*"([^"]+(?:en|a\.en)[^"]*)"/
        ) || captionTracksStr.match(/"baseUrl":\s*"([^"]+)"/);

        if (!baseUrlMatch) {
            return null;
        }

        // Clean up the URL (it's escaped in the HTML)
        const captionUrl = baseUrlMatch[1]
            .replace(/\\u0026/g, "&")
            .replace(/\\\//g, "/");

        // Fetch the actual captions
        const captionResponse = await fetch(captionUrl);
        if (!captionResponse.ok) {
            return null;
        }

        const captionXml = await captionResponse.text();

        // Parse XML and extract text
        const textMatches = captionXml.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
        const transcriptParts: string[] = [];

        for (const match of textMatches) {
            const text = decodeHtmlEntities(match[1]);
            if (text.trim()) {
                transcriptParts.push(text.trim());
            }
        }

        return transcriptParts.join(" ");

    } catch (error) {
        console.error("Transcript extraction error:", error);
        return null;
    }
}

/**
 * Fetch video description as fallback
 */
async function fetchVideoDescription(videoId: string): Promise<string | null> {
    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        // Try to extract description from various patterns
        const descriptionMatch = html.match(
            /"description":\s*\{"simpleText":\s*"([^"]{50,})"/
        ) || html.match(
            /"shortDescription":\s*"([^"]{50,})"/
        );

        if (descriptionMatch) {
            return decodeHtmlEntities(
                descriptionMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')
            );
        }

        return null;

    } catch (error) {
        console.error("Description fetch error:", error);
        return null;
    }
}

/**
 * Decode HTML entities in text
 */
function decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&apos;": "'",
        "&#x27;": "'",
        "&#x2F;": "/",
    };

    return text.replace(
        /&(?:amp|lt|gt|quot|#39|apos|#x27|#x2F);/g,
        (match) => entities[match] || match
    );
}

/**
 * Chunk transcript for embedding storage
 */
export function chunkTranscript(
    transcript: string,
    chunkSize: number = 500,
    overlap: number = 50
): string[] {
    const words = transcript.split(/\s+/);
    const chunks: string[] = [];

    let i = 0;
    while (i < words.length) {
        const chunk = words.slice(i, i + chunkSize).join(" ");
        chunks.push(chunk);
        i += chunkSize - overlap;
    }

    return chunks;
}

/**
 * Extract key technical terms from transcript
 */
export function extractTechnicalTerms(transcript: string): string[] {
    const technicalPatterns = [
        /\b(?:function|class|method|api|algorithm|database|server|client)\b/gi,
        /\b(?:import|export|require|module|package)\b/gi,
        /\b(?:async|await|promise|callback|event)\b/gi,
        /\b(?:component|props|state|hook|context)\b/gi,
        /\b(?:query|mutation|schema|resolver|graphql)\b/gi,
        /\b(?:docker|kubernetes|aws|azure|gcp)\b/gi,
        /\b(?:git|github|commit|branch|merge)\b/gi,
    ];

    const terms: Set<string> = new Set();

    for (const pattern of technicalPatterns) {
        const matches = transcript.match(pattern);
        if (matches) {
            matches.forEach((m) => terms.add(m.toLowerCase()));
        }
    }

    return Array.from(terms);
}
