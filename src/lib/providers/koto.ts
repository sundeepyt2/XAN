// lib/providers/koto.ts
// ✅ Koto provider — embeds megaplay.buzz player
// ✅ Public iframe embed (no API call needed — direct iframe URL)
// ✅ 0 Vercel bandwidth (iframe loads directly from megaplay.buzz)

export interface KotoSource {
  url: string;
  type: "iframe";
  quality: string | null;
  sourceName: string;
  provider: "koto";
}

/**
 * Build the Koto (megaplay.buzz) embed URL
 * @param anilistId - The AniList anime ID
 * @param episode - The episode number
 * @param mode - "sub" or "dub"
 * @returns Single iframe embed source
 */
export function getKotoSource(
  anilistId: number,
  episode: number,
  mode: "sub" | "dub" = "sub",
): KotoSource {
  return {
    url: `https://megaplay.buzz/stream/ani/${anilistId}/${episode}/${mode}`,
    type: "iframe",
    quality: null,
    sourceName: "Koto",
    provider: "koto",
  };
}
