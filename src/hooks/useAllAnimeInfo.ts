"use client";

// hooks/useAllAnimeInfo.ts
// ✅ Dedupes /api/allanime?q=<title> requests across multiple components on the
//    same page. Previously, the watch page fired this request 3× per pageview
//    (page-level dub check + EpisodeGrid + EpisodePanel). Now they all share
//    one fetch via a module-level cache + in-flight promise tracker.

import { useEffect, useState } from "react";

export interface AllAnimeShow {
  aniListId?: string | null;
  availableEpisodes?: {
    sub?: number | null;
    dub?: number | null;
    raw?: number | null;
  } | null;
}

export interface AllAnimeInfo {
  /** All edges returned by the search */
  edges: AllAnimeShow[];
  /** The show matching the AniList ID, or the first fuzzy match */
  bestMatch: AllAnimeShow | null;
  /** Whether the best match has any dub episodes */
  dubAvailable: boolean;
  /** Max episode count across sub/dub/raw from the best match */
  episodeCount: number | null;
}

// ─── Module-level cache + in-flight tracker ───
// Keyed by title string. Persists for the lifetime of the page (not session)
// because anime metadata doesn't change during a single pageview.
const cache = new Map<string, AllAnimeInfo>();
const inFlight = new Map<string, Promise<AllAnimeInfo>>();

async function fetchAllAnimeInfo(
  title: string,
  animeId: number,
): Promise<AllAnimeInfo> {
  const cached = cache.get(title);
  if (cached) return cached;

  const existing = inFlight.get(title);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(
        `/api/allanime?q=${encodeURIComponent(title)}&limit=5`,
      );
      if (!res.ok) {
        return { edges: [], bestMatch: null, dubAvailable: false, episodeCount: null };
      }
      const json = await res.json();
      const edges: AllAnimeShow[] = json?.edges ?? [];
      const match =
        edges.find((e) => e.aniListId === String(animeId)) ?? edges[0] ?? null;

      let dubAvailable = false;
      let episodeCount: number | null = null;
      if (match?.availableEpisodes) {
        const sub = match.availableEpisodes.sub ?? 0;
        const dub = match.availableEpisodes.dub ?? 0;
        const raw = match.availableEpisodes.raw ?? 0;
        if (dub > 0) dubAvailable = true;
        const max = Math.max(sub, dub, raw);
        if (max > 0) episodeCount = max;
      }

      const info: AllAnimeInfo = {
        edges,
        bestMatch: match,
        dubAvailable,
        episodeCount,
      };
      cache.set(title, info);
      return info;
    } catch {
      return { edges: [], bestMatch: null, dubAvailable: false, episodeCount: null };
    } finally {
      inFlight.delete(title);
    }
  })();

  inFlight.set(title, promise);
  return promise;
}

interface UseAllAnimeInfoResult {
  data: AllAnimeInfo | null;
  isLoading: boolean;
}

/**
 * Fetches AllAnime cross-reference info for a given anime title.
 * Deduped across all callers on the same page via module-level cache.
 */
export function useAllAnimeInfo(
  animeId: number,
  title: string,
  /** Skip the fetch entirely (e.g. when AniList already has episode count) */
  enabled: boolean = true,
): UseAllAnimeInfoResult {
  const [data, setData] = useState<AllAnimeInfo | null>(() =>
    enabled && title ? cache.get(title) ?? null : null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    Boolean(enabled && title && !cache.has(title)),
  );

  useEffect(() => {
    if (!enabled || !title.trim()) {
      setData(null);
      setIsLoading(false);
      return;
    }

    // Synchronous cache hit — no state churn
    const cached = cache.get(title);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    fetchAllAnimeInfo(title, animeId).then((info) => {
      if (cancelled) return;
      setData(info);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [animeId, title, enabled]);

  return { data, isLoading };
}
