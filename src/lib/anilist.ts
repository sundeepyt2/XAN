// lib/anilist.ts
// ✅ Defensive API client — bounded retry + AbortController + per-item Zod validation

import {
  AnimeSchema,
  PageInfoSchema,
  AnimeDetailSchema,
  AiringScheduleSchema,
  type Anime,
  type AnimeDetail,
  type AiringSchedule,
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

async function fetchFromAniList(
  query: string,
  variables: Record<string, unknown>,
  _retryCount = 0,
): Promise<unknown | null> {
  // ✅ Cloudflare Workers compatibility:
  // - Don't use `next: { revalidate }` (Next.js-specific, breaks on Workers)
  // - Don't use AbortController/signal (limited support on Workers)
  // - Use a manual timeout race instead
  try {
    // Build fetch options — only include Next.js extensions in Node.js env
    const fetchOptions: RequestInit & { next?: { revalidate?: number } } = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    };

    // ✅ Only add `next: { revalidate }` in Node.js (Next.js) environment
    // Cloudflare Workers don't support this and throw an error
    if (typeof process !== "undefined" && process.versions?.node) {
      fetchOptions.next = { revalidate: 300 };
    }

    // ✅ Only add AbortSignal in environments that support it properly
    if (typeof AbortController !== "undefined") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      fetchOptions.signal = controller.signal;

      // Race between fetch and timeout
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, REQUEST_TIMEOUT_MS);
      });

      const response = (await Promise.race([
        fetch(ANILIST_URL, fetchOptions),
        timeoutPromise,
      ])) as Response | null;

      clearTimeout(timeout);

      if (!response) {
        console.error("[AniList] Request timed out after", REQUEST_TIMEOUT_MS, "ms");
        return null;
      }

      return await handleResponse(response, query, variables, _retryCount);
    }

    // Fallback: no AbortController (very old environments)
    const response = await fetch(ANILIST_URL, fetchOptions);
    return await handleResponse(response, query, variables, _retryCount);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error("[AniList] Request timed out after", REQUEST_TIMEOUT_MS, "ms");
    } else {
      console.error("[AniList] Fetch failed:", error);
    }
    return null;
  }
}

// ✅ Extracted response handler to avoid duplication
async function handleResponse(
  response: Response,
  query: string,
  variables: Record<string, unknown>,
  _retryCount: number,
): Promise<unknown | null> {
  if (!response.ok) {
    const shouldRetry =
      (response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504) &&
      _retryCount < MAX_RETRIES;

    if (shouldRetry) {
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : RETRY_DELAY_MS * (_retryCount + 1);
      await new Promise((r) => setTimeout(r, delay));
      return fetchFromAniList(query, variables, _retryCount + 1);
    }
    if (response.status === 404) {
      console.warn(`[AniList] 404: Resource not found (this is expected for invalid IDs)`);
    } else {
      console.error(`[AniList] HTTP ${response.status}: ${response.statusText}`);
    }
    return null;
  }

  return await response.json();
}

async function fetchList(
  query: string,
  variables: Record<string, unknown>,
): Promise<FetchResult | null> {
  const json = await fetchFromAniList(query, variables);
  if (!json) return null;

  const media = (json as any)?.data?.Page?.media;
  const pageInfoRaw = (json as any)?.data?.Page?.pageInfo;

  if (!Array.isArray(media)) {
    console.error("[AniList] Unexpected response shape — media is not an array");
    return null;
  }

  const validated = media
    .map((item: unknown) => AnimeSchema.safeParse(item))
    .filter((r): r is z.ZodSafeParseSuccess<Anime> => r.success)
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

export async function fetchByGenre(
  genre: string,
  page = 1,
  perPage = 20,
): Promise<FetchResult | null> {
  if (isTag(genre)) {
    return fetchList(SEARCH_QUERY, {
      search: null,
      page,
      perPage,
      tags: [genre],
    });
  }
  return fetchList(SEARCH_QUERY, {
    search: null,
    page,
    perPage,
    genres: [genre],
  });
}

export interface AiringScheduleResult {
  data: AiringSchedule[];
  pageInfo: PageInfo;
}

export async function fetchAiringSchedule(
  startTime: number,
  endTime: number,
  page = 1,
  perPage = 50,
): Promise<AiringScheduleResult | null> {
  const json = await fetchFromAniList(AIRING_SCHEDULE_QUERY, {
    page,
    perPage,
    airingAtGreater: startTime,
    airingAtLesser: endTime,
  });
  if (!json) return null;

  const schedulesRaw = (json as any)?.data?.Page?.airingSchedules;
  const pageInfoRaw = (json as any)?.data?.Page?.pageInfo;
  if (!Array.isArray(schedulesRaw)) {
    console.error("[AniList] AiringSchedule: response shape unexpected");
    return null;
  }

  const validated = schedulesRaw
    .map((item: unknown) => AiringScheduleSchema.safeParse(item))
    .filter((r): r is z.ZodSafeParseSuccess<AiringSchedule> => r.success)
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
          perPage: 50,
          total: null,
        },
  };
}
