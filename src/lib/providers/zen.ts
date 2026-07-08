// lib/providers/zen.ts
// ✅ Zen provider — fetches stream URLs from flixcloud.cc
// ✅ Public API (no auth needed) — returns HLS player URL
// ✅ We proxy through /api/stream-zen to avoid CORS

export interface ZenSource {
  url: string;
  type: "iframe"; // flixcloud returns a player_url that's an embed page
  quality: string | null;
  sourceName: string;
  provider: "zen";
}

interface FlixcloudResponse {
  status?: string;
  data?: Array<{
    player_url?: string;
    quality?: string;
  }>;
  error?: string;
}

/**
 * Fetch stream sources from Zen (flixcloud.cc)
 * @param anilistId - The AniList anime ID
 * @param episode - The episode number
 * @returns Array of sources (usually 1 iframe embed)
 */
export async function fetchZenSources(
  anilistId: number,
  episode: number,
): Promise<ZenSource[]> {
  try {
    // Use our proxy to avoid CORS issues (flixcloud.cc is behind Cloudflare)
    const res = await fetch(
      `/api/stream-zen?anilistId=${anilistId}&episode=${episode}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];

    const json: FlixcloudResponse = await res.json();
    if (json.status !== "success" || !json.data) return [];

    const sources: ZenSource[] = [];
    for (const item of json.data) {
      if (item.player_url) {
        sources.push({
          url: item.player_url,
          type: "iframe",
          quality: item.quality ?? null,
          sourceName: "Zen",
          provider: "zen",
        });
      }
    }
    return sources;
  } catch (err) {
    console.warn("[zen] fetch failed:", err);
    return [];
  }
}
