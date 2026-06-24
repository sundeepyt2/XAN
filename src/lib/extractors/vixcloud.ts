// lib/extractors/vixcloud.ts
// ✅ TypeScript port of SNI's VixcloudExtractor.
// Scrapes the Vixcloud embed page to find stream URLs.

const VIXCLOUD_SOURCES_REGEX = /"sources":\s*\[(\{[^}]+\})\]/;
const VIXCLOUD_FILE_REGEX = /"file":\s*"(.*?)"/;

export interface ExtractedStream {
  url: string;
  quality: string | null;
  type: "hls" | "mp4";
}

/**
 * Extract a playable stream URL from a Vixcloud embed page.
 *
 * @param embedUrl The Vixcloud embed URL
 * @returns ExtractedStream or null if extraction fails
 */
export async function extractVixcloud(
  embedUrl: string,
): Promise<ExtractedStream | null> {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: "https://youtu-chan.com",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Vixcloud] HTTP ${res.status} for ${embedUrl}`);
      return null;
    }

    const html = await res.text();

    // Try sources array format first
    const sourcesMatch = html.match(VIXCLOUD_SOURCES_REGEX);
    if (sourcesMatch?.[1]) {
      try {
        const sourceObj = JSON.parse(sourcesMatch[1]);
        if (sourceObj.file) {
          return {
            url: sourceObj.file,
            quality: sourceObj.label ?? null,
            type: sourceObj.file.includes(".m3u8") ? "hls" : "mp4",
          };
        }
      } catch {
        // Fall through to file regex
      }
    }

    // Try direct file: regex
    const fileMatch = html.match(VIXCLOUD_FILE_REGEX);
    if (fileMatch?.[1]) {
      const url = fileMatch[1];
      // Check if it's an HLS playlist or MP4
      return {
        url,
        quality: null,
        type: url.includes(".m3u8") ? "hls" : "mp4",
      };
    }

    console.warn("[Vixcloud] No source URL found in embed page");
    return null;
  } catch (err) {
    console.error("[Vixcloud] Extraction failed:", err);
    return null;
  }
}

/**
 * Check if a URL is a Vixcloud embed URL.
 */
export function isVixcloudUrl(url: string): boolean {
  return (
    url.includes("vixcloud") ||
    url.includes("vizcloud") ||
    url.includes("streamable")
  );
}
