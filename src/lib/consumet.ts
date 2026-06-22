// lib/consumet.ts
// ✅ Consumet API client — two-step flow:
//   1. GET {CONSUMET_URL}/anime/animepahe/info/{anilistId}  → episode list
//   2. GET {CONSUMET_URL}/anime/animepahe/watch?episodeId=... → stream sources
//
// NOTE: The public api.consumet.org endpoint is DEAD (returns HTTP 451).
// You must self-host Consumet: https://github.com/consumet/api.consumet.org
// Then set CONSUMET_URL in your .env.local to your instance URL.

import { z } from "zod";

const CONSUMET_URL = process.env.CONSUMET_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "";
const REQUEST_TIMEOUT_MS = 12000; // Consumet is slow — give it more headroom

// ─── Consumet /info response schema ───
export const ConsumetEpisodeSchema = z.object({
  id: z.string(), // episodeId used for the /watch call
  number: z.number(),
  title: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  image: z.string().nullable().default(null),
  thumbnail: z.string().nullable().default(null),
  duration: z.number().nullable().default(null),
  airDate: z.string().nullable().default(null),
});
export type ConsumetEpisode = z.infer<typeof ConsumetEpisodeSchema>;

export const ConsumetInfoSchema = z.object({
  id: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  malId: z.number().nullable().default(null),
  episodes: z.array(ConsumetEpisodeSchema).default([]),
});
export type ConsumetInfo = z.infer<typeof ConsumetInfoSchema>;

// ─── Consumet /watch response schema ───
export const ConsumetSourceSchema = z.object({
  url: z.string(),
  quality: z.string().nullable().default(null),
  isM3U8: z.boolean().default(false),
});
export type ConsumetSource = z.infer<typeof ConsumetSourceSchema>;

export const ConsumetWatchSchema = z.object({
  sources: z.array(ConsumetSourceSchema).default([]),
  headers: z.record(z.string()).default({}),
  subtitles: z
    .array(z.object({ url: z.string(), lang: z.string().nullable().default(null) }))
    .default([]),
});
export type ConsumetWatch = z.infer<typeof ConsumetWatchSchema>;

export interface ConsumetConfig {
  configured: boolean;
  url: string;
}

export function getConsumetConfig(): ConsumetConfig {
  return {
    configured: Boolean(CONSUMET_URL),
    url: CONSUMET_URL,
  };
}

// ─── Fetch with timeout helper ───
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 600 }, // cache episode lists 10 min
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Step 1: Fetch the list of episodes for a given anime.
 * @param anilistId The AniList anime ID (Consumet accepts this directly for animepahe)
 */
export async function fetchConsumetInfo(
  anilistId: number,
): Promise<ConsumetInfo | null> {
  if (!CONSUMET_URL) {
    console.warn("[Consumet] CONSUMET_URL not set");
    return null;
  }

  const url = `${CONSUMET_URL.replace(/\/$/, "")}/anime/animepahe/info/${anilistId}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.error(`[Consumet] info HTTP ${res.status} for ${url}`);
      return null;
    }
    const json = await res.json();
    const parsed = ConsumetInfoSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[Consumet] info response invalid:", parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[Consumet] info request timed out");
    } else {
      console.error("[Consumet] info fetch failed:", err);
    }
    return null;
  }
}

/**
 * Step 2: Fetch the actual stream sources for a given episode.
 * @param episodeId The episode ID returned by fetchConsumetInfo
 */
export async function fetchConsumetWatch(
  episodeId: string,
): Promise<ConsumetWatch | null> {
  if (!CONSUMET_URL) {
    console.warn("[Consumet] CONSUMET_URL not set");
    return null;
  }

  const url = `${CONSUMET_URL.replace(/\/$/, "")}/anime/animepahe/watch?episodeId=${encodeURIComponent(episodeId)}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.error(`[Consumet] watch HTTP ${res.status} for ${url}`);
      return null;
    }
    const json = await res.json();
    const parsed = ConsumetWatchSchema.safeParse(json);
    if (!parsed.success) {
      console.error("[Consumet] watch response invalid:", parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[Consumet] watch request timed out");
    } else {
      console.error("[Consumet] watch fetch failed:", err);
    }
    return null;
  }
}

/**
 * Combined helper: fetch a streamable source for (animeId, episodeNumber).
 * Returns the first HLS source if available, otherwise the first MP4 source.
 */
export async function fetchConsumetStream(
  animeId: number,
  episodeNumber: number,
): Promise<{
  url: string;
  type: "hls" | "mp4";
  quality: string | null;
} | null> {
  // Step 1: get episode list
  const info = await fetchConsumetInfo(animeId);
  if (!info || info.episodes.length === 0) {
    console.warn(`[Consumet] no episodes found for anime ${animeId}`);
    return null;
  }

  // Step 2: find the episode matching the requested number
  const episode = info.episodes.find((e) => e.number === episodeNumber);
  if (!episode) {
    console.warn(
      `[Consumet] episode ${episodeNumber} not found for anime ${animeId} (have ${info.episodes.length} episodes)`,
    );
    return null;
  }

  // Step 3: fetch stream sources
  const watch = await fetchConsumetWatch(episode.id);
  if (!watch || watch.sources.length === 0) {
    console.warn(`[Consumet] no sources for episode ${episode.id}`);
    return null;
  }

  // Prefer HLS, fall back to MP4
  const hls = watch.sources.find((s) => s.isM3U8);
  const mp4 = watch.sources.find((s) => !s.isM3U8);
  const picked = hls ?? mp4;
  if (!picked) return null;

  return {
    url: picked.url,
    type: picked.isM3U8 ? "hls" : "mp4",
    quality: picked.quality,
  };
}
