// lib/anilist.ts
// ✅ Defensive API client — bounded retry + AbortController + per-item Zod validation

import {
  AnimeSchema,
  PageInfoSchema,
  AnimeDetailSchema,
  type Anime,
  type AnimeDetail,
  type PageInfo,
} from "@/types/anime";
import {
  TRENDING_QUERY,
  POPULAR_QUERY,
  SEARCH_QUERY,
  ANIME_DETAIL_QUERY,
  AIRING_SCHEDULE_QUERY,
} from "./anilist-queries";
import { isTag } from "./constants";
import { z } from "zod";

const ANILIST_URL = "https://graphql.anilist.co";
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 10000;

interface FetchResult {
  data: Anime[];
  pageInfo: PageInfo;
}

interface FetchDetailResult {
  data: AnimeDetail | null;
}

// ✅ Bug #18: AbortController for request timeout
// ✅ Bug #3: Bounded retry counter (MAX 1 retry, not infinite recursion)
async function fetchFromAniList(
  query: string,
  variables: Record<string, unknown>,
  _retryCount = 0,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      next: { revalidate: 300 }, // ✅ ISR: cache for 5 minutes
    });

    if (!response.ok) {
      if (response.status === 429 && _retryCount < MAX_RETRIES) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : RETRY_DELAY_MS;
        await new Promise((r) => setTimeout(r, delay));
        return fetchFromAniList(query, variables, _retryCount + 1);
      }
      console.error(`[AniList] HTTP ${response.status}: ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error(
        "[AniList] Request timed out after",
        REQUEST_TIMEOUT_MS,
        "ms",
      );
    } else {
      console.error("[AniList] Fetch failed:", error);
    }
    return null;
  } finally {
    clearTimeout(timeout); // ✅ Bug #19: Always clean up timeout
  }
}

// ─── Paginated fetcher (for lists of anime) ───
async function fetchList(
  query: string,
  variables: Record<string, unknown>,
): Promise<FetchResult | null> {
  const json = await fetchFromAniList(query, variables);
  if (!json) return null;

  // Validate response shape before accessing nested properties
  const media = (json as any)?.data?.Page?.media;
  const pageInfoRaw = (json as any)?.data?.Page?.pageInfo;

  if (!Array.isArray(media)) {
    console.error("[AniList] Unexpected response shape — media is not an array");
    return null;
  }

  // ✅ Validate each item individually — skip bad items instead of crashing
  const validated = media
    .map((item: unknown) => AnimeSchema.safeParse(item))
    .filter(
      (r): r is z.ZodSafeParseSuccess<Anime> => r.success,
    )
    .map((r) => r.data);

  const pageInfo = PageInfoSchema.safeParse(pageInfoRaw);

  return {
    data: validated,
    pageInfo: pageInfo.success
      ? pageInfo.data
      : {
          currentPage: 1,
          hasNextPage: false,
          lastPage: null,
          perPage: 20,
          total: null,
        },
  };
}

// ─── Convenience Functions ───
export async function fetchTrending(
  page = 1,
  perPage = 20,
): Promise<FetchResult | null> {
  return fetchList(TRENDING_QUERY, { page, perPage });
}

export async function fetchPopular(
  page = 1,
  perPage = 20,
): Promise<FetchResult | null> {
  return fetchList(POPULAR_QUERY, { page, perPage });
}

export async function fetchSearch(
  search: string,
  page = 1,
  perPage = 20,
  genres?: string[],
  sort?: string,
  tags?: string[],
): Promise<FetchResult | null> {
  return fetchList(SEARCH_QUERY, {
    search: search || null,
    page,
    perPage,
    genres: genres && genres.length > 0 ? genres : undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    sort: sort ? [sort] : undefined,
  });
}

// ─── Airing Schedule ───
export interface AiringScheduleEntry {
  id: number;
  airingAt: number;
  episode: number;
  media: Anime;
}

export async function fetchAiringSchedule(
  startTime: number,
  endTime: number,
  page = 1,
  perPage = 50,
): Promise<{ data: AiringScheduleEntry[]; hasNextPage: boolean } | null> {
  const json = await fetchFromAniList(AIRING_SCHEDULE_QUERY, {
    page,
    perPage,
    airingAtGreater: startTime,
    airingAtLesser: endTime,
  });
  if (!json) return null;

  const schedules = (json as any)?.data?.Page?.airingSchedules;
  const pageInfo = (json as any)?.data?.Page?.pageInfo;
  if (!Array.isArray(schedules)) {
    console.error("[AniList] Unexpected airing schedule response shape");
    return null;
  }

  // Validate each schedule entry, skip invalid ones
  const validated: AiringScheduleEntry[] = [];
  for (const entry of schedules) {
    if (!entry?.media) continue;
    const parsed = AnimeSchema.safeParse(entry.media);
    if (parsed.success) {
      validated.push({
        id: entry.id,
        airingAt: entry.airingAt,
        episode: entry.episode,
        media: parsed.data,
      });
    }
  }

  return {
    data: validated,
    hasNextPage: pageInfo?.hasNextPage ?? false,
  };
}

export async function fetchAnimeDetail(
  id: number,
): Promise<FetchDetailResult | null> {
  const json = await fetchFromAniList(ANIME_DETAIL_QUERY, { id });
  if (!json) return null;

  const raw = (json as any)?.data?.Media;
  if (!raw) {
    console.error("[AniList] Detail response missing Media field");
    return { data: null };
  }

  const parsed = AnimeDetailSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[AniList] Detail validation failed:", parsed.error.issues);
    return { data: null };
  }

  return { data: parsed.data };
}

// ─── Helper: Fetch anime by genre or tag ───
// If the category is actually a tag (Shounen, Seinen, etc.), query via tag_in.
export async function fetchByGenre(
  genre: string,
  page = 1,
  perPage = 20,
): Promise<FetchResult | null> {
  const categoryIsTag = isTag(genre);
  return fetchList(SEARCH_QUERY, {
    search: null,
    page,
    perPage,
    genres: categoryIsTag ? undefined : [genre],
    tags: categoryIsTag ? [genre] : undefined,
  });
}
