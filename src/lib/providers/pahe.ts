// lib/providers/pahe.ts
// ✅ AnimePahe provider — fetches download/stream links from nekostream mapper
// ✅ Public API (no auth needed) — returns direct MP4 download URLs
// ✅ We proxy through /api/stream-pahe to avoid CORS

export interface PaheSource {
  url: string;
  type: "mp4";
  quality: string | null;
  sourceName: string;
  provider: "pahe";
  headers?: Record<string, string>;
}

interface NekostreamResponse {
  status?: string;
  [provider: string]: unknown;
}

/**
 * Fetch stream/download sources from AnimePahe (via nekostream mapper)
 * @param malId - The MyAnimeList anime ID
 * @param episode - The episode number
 * @returns Array of MP4 download sources
 */
export async function fetchPaheSources(
  malId: number | null | undefined,
  episode: number,
): Promise<PaheSource[]> {
  if (!malId) return [];

  try {
    // Use our proxy to avoid CORS issues
    const timestamp = Math.floor(Date.now() / 1000);
    const res = await fetch(
      `/api/stream-pahe?malId=${malId}&episode=${episode}&ts=${timestamp}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];

    const json: NekostreamResponse = await res.json();
    if (json.status && json.status !== "success") return [];

    const sources: PaheSource[] = [];
    // The response is an object with provider names as keys
    for (const [providerKey, value] of Object.entries(json)) {
      if (providerKey === "status") continue;

      // Each provider has an object with quality levels as keys
      if (value && typeof value === "object") {
        const qualityObj = value as Record<string, unknown>;
        for (const [quality, urlVal] of Object.entries(qualityObj)) {
          if (typeof urlVal === "string" && urlVal.startsWith("http")) {
            // Replace the pahe.nekostream.site URL with the CF Worker proxy
            // (the original URL requires Referer; the workers.dev URL doesn't)
            const finalUrl = urlVal.replace(
              "https://pahe.nekostream.site/",
              "https://proud-dew-d754.download992.workers.dev/",
            );
            sources.push({
              url: finalUrl,
              type: "mp4",
              quality: quality || null,
              sourceName: `Pahe-${providerKey}`,
              provider: "pahe",
            });
          }
        }
      }
    }
    return sources;
  } catch (err) {
    console.warn("[pahe] fetch failed:", err);
    return [];
  }
}
