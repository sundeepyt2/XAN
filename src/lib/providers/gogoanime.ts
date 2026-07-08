// lib/providers/gogoanime.ts
// ✅ Gogoanime provider — scrapes gogoanime.fi for stream URLs
// ✅ Uses server-side scraping (bypasses CORS) via /api/stream-gogo route
// ✅ Searches by title, finds the episode, extracts the stream URL

export interface GogoanimeSource {
  url: string;
  type: "hls" | "mp4";
  quality: string | null;
  sourceName: string;
  provider: "gogoanime";
  headers?: Record<string, string>;
}

interface GogoSearchResult {
  title: string;
  url: string;
}

interface GogoEpisodeStream {
  sources: Array<{
    url: string;
    quality: string;
  }>;
  headers?: Record<string, string>;
}

/**
 * Fetch gogoanime sources by searching for the anime title and extracting
 * stream URLs from the episode page.
 *
 * This calls our /api/stream-gogo proxy (server-side scraping).
 *
 * @param title - Anime title to search for
 * @param episode - Episode number
 * @returns Array of stream sources
 */
export async function fetchGogoanimeSources(
  title: string,
  episode: number,
): Promise<GogoanimeSource[]> {
  if (!title.trim()) return [];

  try {
    const params = new URLSearchParams({
      title: title,
      episode: String(episode),
    });
    const res = await fetch(`/api/stream-gogo?${params.toString()}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];

    const json = await res.json();
    if (!json.sources || !Array.isArray(json.sources)) return [];

    const sources: GogoanimeSource[] = [];
    for (const src of json.sources) {
      if (src.url) {
        const isHls = src.url.includes(".m3u8");
        sources.push({
          url: src.url,
          type: isHls ? "hls" : "mp4",
          quality: src.quality ?? null,
          sourceName: "Gogoanime",
          provider: "gogoanime",
          headers: json.headers,
        });
      }
    }
    return sources;
  } catch (err) {
    console.warn("[gogoanime] fetch failed:", err);
    return [];
  }
}
