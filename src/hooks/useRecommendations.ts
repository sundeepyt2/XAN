"use client";

// hooks/useRecommendations.ts
import { useEffect, useState, useMemo } from "react";
import { useWatchHistory } from "./useWatchHistory";
import { fetchSearch } from "@/lib/anilist";
import type { Anime } from "@/types/anime";

const CACHE_KEY_PREFIX = "xan-recs-v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface RecommendationsResult {
  recommendations: Anime[];
  topGenres: string[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

interface CachedRecs {
  ts: number;
  recommendations: Anime[];
  topGenres: string[];
  watchedSignature: string;
}

function buildWatchedSignature(watchedIds: number[], topGenres: string[]): string {
  return `${watchedIds.slice(0, 20).join(",")}|${topGenres.join(",")}`;
}

function readCache(key: string): CachedRecs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRecs;
    if (!parsed || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: CachedRecs): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useRecommendations(): RecommendationsResult {
  const { history, isLoaded } = useWatchHistory();
  const [recommendations, setRecommendations] = useState<Anime[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const { topGenres, watchedIds, watchedSignature } = useMemo(() => {
    const watchedIds = history.map((h) => h.animeId);
    const genreCounts = new Map<string, number>();
    for (const entry of history) {
      const ageDays = (Date.now() - entry.updatedAt) / 86_400_000;
      const recencyWeight = Math.max(0.1, 1 - ageDays / 30);
      const genres = entry.genres ?? [];
      for (const g of genres) {
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + recencyWeight);
      }
    }
    const sorted = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topGenres = sorted.slice(0, 3).map(([g]) => g);
    return {
      topGenres,
      watchedIds,
      watchedSignature: buildWatchedSignature(watchedIds, topGenres),
    };
  }, [history]);

  useEffect(() => {
    if (!isLoaded) return;
    if (history.length < 3 || topGenres.length === 0) {
      setRecommendations([]);
      setIsLoading(false);
      return;
    }

    const cacheKey = `${CACHE_KEY_PREFIX}:${watchedSignature}`;
    const cached = readCache(cacheKey);
    if (cached && refreshNonce === 0) {
      setRecommendations(cached.recommendations);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const queryGenres = topGenres.slice(0, 2);
    fetchSearch("", 1, 24, queryGenres, "SCORE_DESC")
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError("Failed to load recommendations");
          setRecommendations([]);
          setIsLoading(false);
          return;
        }
        const watchedSet = new Set(watchedIds);
        const seen = new Set<number>();
        const filtered = result.data.filter((a) => {
          if (watchedSet.has(a.id)) return false;
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
        const finalRecs = filtered.slice(0, 12);
        setRecommendations(finalRecs);
        writeCache(cacheKey, {
          ts: Date.now(),
          recommendations: finalRecs,
          topGenres,
          watchedSignature,
        });
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useRecommendations] fetch failed:", err);
        setError("Failed to load recommendations");
        setRecommendations([]);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, history.length, watchedSignature, refreshNonce]);

  const refresh = () => {
    setRefreshNonce((n) => n + 1);
  };

  return { recommendations, topGenres, isLoading, error, refresh };
}
