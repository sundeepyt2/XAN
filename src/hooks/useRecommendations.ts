"use client";

// hooks/useRecommendations.ts
// ✅ Client-side recommendation engine — analyzes watch history genres
// and fetches AniList recommendations based on top genres.

import { useState, useEffect, useCallback } from "react";
import { useWatchHistory } from "./useWatchHistory";
import type { Anime } from "@/types/anime";

interface UseRecommendationsResult {
  recommendations: Anime[];
  isLoading: boolean;
  topGenres: string[];
  refresh: () => void;
}

const CACHE_KEY = "xan-recommendations-cache";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface CachedRecommendations {
  timestamp: number;
  data: Anime[];
  topGenres: string[];
}

export function useRecommendations(): UseRecommendationsResult {
  const { history, isLoaded } = useWatchHistory();
  const [recommendations, setRecommendations] = useState<Anime[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [topGenres, setTopGenres] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    // Clear cache
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(CACHE_KEY);
    }
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    // Need at least 3 history items for meaningful recommendations
    if (history.length < 3) {
      setRecommendations([]);
      setTopGenres([]);
      return;
    }

    // Check cache first
    if (typeof window !== "undefined" && refreshKey === 0) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed: CachedRecommendations = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL) {
            setRecommendations(parsed.data);
            setTopGenres(parsed.topGenres);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    // Extract genre frequency from watch history
    const genreCounts: Record<string, number> = {};
    for (const entry of history) {
      if (entry.genres && Array.isArray(entry.genres)) {
        for (const genre of entry.genres) {
          genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
        }
      }
    }

    // Sort genres by frequency
    const sortedGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g);

    if (sortedGenres.length === 0) {
      setRecommendations([]);
      setTopGenres([]);
      return;
    }

    // Take top 2-3 genres
    const top2 = sortedGenres.slice(0, 2);
    setTopGenres(top2);

    // Already-watched anime IDs (to exclude from recommendations)
    const watchedIds = new Set(history.map((h) => h.animeId));

    setIsLoading(true);

    // Fetch recommendations by top genres
    const params = new URLSearchParams({
      page: "1",
      perPage: "20",
      sort: "SCORE_DESC",
      genres: top2.join(","),
    });

    fetch(`/api/search?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch recommendations");
        const json = await res.json();
        const allAnime: Anime[] = json?.data ?? [];

        // Deduplicate against already-watched
        const filtered = allAnime.filter((a) => !watchedIds.has(a.id));

        // Take top 12
        const result = filtered.slice(0, 12);

        setRecommendations(result);

        // Cache in sessionStorage
        if (typeof window !== "undefined") {
          const cache: CachedRecommendations = {
            timestamp: Date.now(),
            data: result,
            topGenres: top2,
          };
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
          } catch {
            // ignore
          }
        }
      })
      .catch((err) => {
        console.error("[useRecommendations] Failed:", err);
        setRecommendations([]);
      })
      .finally(() => setIsLoading(false));
  }, [history, isLoaded, refreshKey]);

  return { recommendations, isLoading, topGenres, refresh };
}
