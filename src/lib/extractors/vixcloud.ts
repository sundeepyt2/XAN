// lib/extractors/vixcloud.ts
const VIXCLOUD_HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Referer: "https://youtu-chan.com",
  Origin: "https://youtu-chan.com",
};

export interface ExtractedSource {
  url: string;
  quality: string | null;
  type: "hls" | "mp4" | "iframe";
}

export async function extractVixcloud(embedUrl: string): Promise<ExtractedSource[]> {
  try {
    const res = await fetch(embedUrl, {
      headers: VIXCLOUD_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: ExtractedSource[] = [];

    const sourcesBlockMatch = html.match(/sources\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
    if (sourcesBlockMatch?.[1]) {
      try {
        const arr = JSON.parse(sourcesBlockMatch[1]) as Array<Record<string, unknown>>;
        for (const entry of arr) {
          const file = entry?.file;
          if (typeof file === "string" && file) {
            const isHls = file.includes(".m3u8");
            results.push({
              url: file,
              quality:
                typeof entry.label === "string"
                  ? entry.label
                  : typeof entry.quality === "string"
                    ? entry.quality
                    : null,
              type: isHls ? "hls" : "mp4",
            });
          }
        }
      } catch {
        // fall through
      }
    }

    if (results.length === 0) {
      const fileMatch = html.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
      if (fileMatch?.[1]) {
        results.push({ url: fileMatch[1], quality: null, type: "hls" });
      }
      const mp4Match = html.match(/file\s*:\s*["']([^"']+\.mp4[^"']*)["']/);
      if (mp4Match?.[1]) {
        results.push({ url: mp4Match[1], quality: null, type: "mp4" });
      }
    }

    return results;
  } catch (err) {
    console.error("[vixcloud] extract failed:", err);
    return [];
  }
}
