// lib/allanime.ts
// ✅ AllAnime GraphQL client — the public GraphQL API at api.allanime.day
// No API key required. Works publicly.
//
// Provides:
//   - Search by title → returns AllAnime ID + AniList ID mapping
//   - Full anime info (score, description, episode count, available episodes)
//   - Direct lookup by AniList ID (using the `aniListId` field on every show)
//
// Stream URLs are Cloudflare-protected. The user must manually solve the CF
// challenge in their browser and paste the cf_clearance cookie into /settings.
// We store it server-side (lib/cf-cookie-store.ts) and attach it to /episodes
// requests. See /settings page for the verification UI.

import { z } from "zod";
import { getStoredCookie } from "./cf-cookie-store";

const ALLANIME_GRAPHQL = "https://api.allanime.day/api/graphql";
const ALLANIME_EPISODES = "https://api.allanime.day/episodes";
const REQUEST_TIMEOUT_MS = 12000;

// ─── Schemas ───
export const AllAnimeShowSchema = z.object({
  _id: z.string(),
  name: z.string(),
  englishName: z.string().nullable().default(null),
  nativeName: z.string().nullable().default(null),
  aniListId: z.string().nullable().default(null),
  malId: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  thumbnail: z.string().nullable().default(null),
  banner: z.string().nullable().default(null),
  score: z.number().nullable().default(null),
  type: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
  season: z.unknown().nullable().default(null),
  airedStart: z.unknown().nullable().default(null),
  genres: z.array(z.string()).default([]),
  studios: z.array(z.string()).default([]),
  episodeCount: z.string().nullable().default(null),
  episodeDuration: z.string().nullable().default(null),
  availableEpisodes: z
    .object({
      sub: z.number().default(0),
      dub: z.number().default(0),
      raw: z.number().default(0),
    })
    .nullable()
    .default(null),
  availableEpisodesDetail: z
    .object({
      sub: z.array(z.string()).default([]),
      dub: z.array(z.string()).default([]),
      raw: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  countryOfOrigin: z.string().nullable().default(null),
});
export type AllAnimeShow = z.infer<typeof AllAnimeShowSchema>;

const ShowsResponseSchema = z.object({
  data: z.object({
    shows: z.object({
      edges: z.array(AllAnimeShowSchema).default([]),
    }),
  }),
});

const ShowResponseSchema = z.object({
  data: z.object({
    show: AllAnimeShowSchema.nullable(),
  }),
});

// ─── Internal fetch ───
async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ALLANIME_GRAPHQL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131",
        Referer: "https://allmanga.to/",
        Origin: "https://allmanga.to",
      },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`[AllAnime] HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    if (json?.errors) {
      console.error("[AllAnime] GraphQL errors:", json.errors[0]?.message);
      return null;
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      console.error("[AllAnime] invalid response:", parsed.error.issues.slice(0, 3));
      return null;
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[AllAnime] timed out");
    } else {
      console.error("[AllAnime] fetch failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───

export interface AllAnimeSearchResult {
  edges: AllAnimeShow[];
}

export async function searchAllAnime(
  query: string,
  limit = 10,
): Promise<AllAnimeSearchResult | null> {
  if (!query.trim()) return null;
  const result = await gql(
    `query($s:SearchInput,$limit:Int){shows(search:$s,limit:$limit){edges{_id name englishName aniListId malId thumbnail score type episodeCount availableEpisodes}}}`,
    { s: { query }, limit },
    ShowsResponseSchema,
  );
  if (!result) return null;
  return { edges: result.data.shows.edges };
}

export async function fetchAllAnimeById(
  allAnimeId: string,
): Promise<AllAnimeShow | null> {
  const result = await gql(
    `query($id:String!){show(_id:$id){_id name englishName nativeName aniListId malId description thumbnail banner score type status season airedStart genres studios episodeCount episodeDuration availableEpisodes availableEpisodesDetail countryOfOrigin}}`,
    { id: allAnimeId },
    ShowResponseSchema,
  );
  return result?.data.show ?? null;
}

/**
 * Find AllAnime show by AniList ID. AllAnime stores `aniListId` on every show,
 * but there's no direct lookup — we have to use `showsWithIds` or search by the
 * AniList anime's English title.
 */
export async function findShowByAniListId(
  anilistId: number,
  anilistTitle: string,
): Promise<AllAnimeShow | null> {
  // First try searching by title — AllAnime search is fuzzy enough that this
  // almost always finds the right show. Then we filter by aniListId match.
  const search = await searchAllAnime(anilistTitle, 10);
  if (!search) return null;

  const exact = search.edges.find((s) => s.aniListId === String(anilistId));
  if (exact) return exact;

  // Fallback: fetch full details for the top 3 search results and look for an aniListId match
  for (const candidate of search.edges.slice(0, 3)) {
    const full = await fetchAllAnimeById(candidate._id);
    if (full?.aniListId === String(anilistId)) return full;
  }

  // Final fallback: return first search result
  return search.edges[0] ?? null;
}

/**
 * Best-effort attempt to fetch stream sources for an episode.
 *
 * Uses the stored `cf_clearance` cookie (from /settings page) to bypass
 * Cloudflare. If the cookie is missing or expired, returns null.
 */
export async function fetchAllAnimeStreamSources(
  allAnimeId: string,
  episode: string,
  type: "sub" | "dub" = "sub",
): Promise<{ url: string; quality: string | null }[] | null> {
  const stored = await getStoredCookie();
  if (!stored) {
    console.warn("[AllAnime] No cf_clearance cookie stored — visit /settings to verify");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${ALLANIME_EPISODES}?id=${encodeURIComponent(allAnimeId)}&episode=${encodeURIComponent(episode)}&type=${type}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": stored.userAgent,
        Accept: "application/json",
        Referer: "https://allmanga.to/",
        Origin: "https://allmanga.to",
        Cookie: `cf_clearance=${stored.value}`,
      },
    });

    if (!res.ok) {
      console.warn(
        `[AllAnime] stream endpoint HTTP ${res.status} — cookie may be expired or invalid`,
      );
      return null;
    }

    const json = await res.json();
    const sources = z
      .array(
        z.object({
          url: z.string(),
          quality: z.string().nullable().default(null),
        }),
      )
      .safeParse(json?.sources ?? []);

    return sources.success ? sources.data : null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[AllAnime] stream fetch timed out");
    } else {
      console.error("[AllAnime] stream fetch failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Test whether the stored cf_clearance cookie works.
 * Returns the HTTP status and a snippet of the response body.
 */
export async function testStoredCookie(): Promise<{
  status: number;
  ok: boolean;
  bodySnippet: string;
  hasCookie: boolean;
}> {
  const stored = await getStoredCookie();
  if (!stored) {
    return { status: 0, ok: false, bodySnippet: "", hasCookie: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    // Use a known anime ID (Cowboy Bebop) for the test
    const url = `${ALLANIME_EPISODES}?id=PGcK4wGnqDoeihT6n&episode=1&type=sub`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": stored.userAgent,
        Accept: "application/json",
        Referer: "https://allmanga.to/",
        Origin: "https://allmanga.to",
        Cookie: `cf_clearance=${stored.value}`,
      },
    });

    const body = await res.text();
    return {
      status: res.status,
      ok: res.ok && !body.includes("Just a moment"),
      bodySnippet: body.substring(0, 500),
      hasCookie: true,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        status: 0,
        ok: false,
        bodySnippet: "Request timed out",
        hasCookie: true,
      };
    }
    return {
      status: 0,
      ok: false,
      bodySnippet: err instanceof Error ? err.message : "Unknown error",
      hasCookie: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Helpers ───

export function getAllAnimeTitle(show: AllAnimeShow): string {
  return show.englishName ?? show.name ?? show.nativeName ?? "Untitled";
}

export function getAllAnimeCover(show: AllAnimeShow): string {
  return show.thumbnail ?? "/placeholder-card.png";
}

export function formatAllAnimeScore(score: number | null): string {
  if (score == null) return "N/A";
  return score.toFixed(2);
}
