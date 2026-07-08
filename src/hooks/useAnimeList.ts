"use client";

// hooks/useAnimeList.ts
// ✅ MAL-style anime status lists — Watching / Completed / Planning / Dropped / On Hold
// ✅ localStorage-based, SSR-safe (same pattern as useWatchHistory)
// ✅ Each entry stores: animeId, status, progress (episodes watched), score, updatedAt
// ✅ Auto-complete: when all episodes of a FINISHED anime are watched, auto-add to "Completed"

import { useState, useEffect, useCallback } from "react";
import type { WatchHistoryEntry } from "./useWatchHistory";

export type AnimeStatus = "WATCHING" | "COMPLETED" | "PLANNING" | "DROPPED" | "ON_HOLD";

export const STATUS_LABELS: Record<AnimeStatus, string> = {
  WATCHING: "Watching",
  COMPLETED: "Completed",
  PLANNING: "Plan to Watch",
  DROPPED: "Dropped",
  ON_HOLD: "On Hold",
};

export interface AnimeListEntry {
  animeId: number;
  title: string;
  coverImage: string;
  status: AnimeStatus;
  progress: number; // episodes watched (user-tracked, separate from watch history)
  score: number | null; // 1-10, null = unscored
  updatedAt: number;
  episodes?: number | null; // total episodes (stored for auto-complete checks)
  airingStatus?: string | null; // "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED"
}

const STORAGE_KEY = "xan-anime-list";
const MAX_ENTRIES = 500;

function readList(): AnimeListEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeList(entries: AnimeListEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore
  }
}

export function useAnimeList() {
  const [list, setList] = useState<AnimeListEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setList(readList());
    setIsLoaded(true);
  }, []);

  const setStatus = useCallback(
    (
      animeId: number,
      status: AnimeStatus,
      meta: {
        title: string;
        coverImage: string;
        episodes?: number | null;
        airingStatus?: string | null;
      },
    ) => {
      setList((prev) => {
        const existing = prev.find((e) => e.animeId === animeId);
        const filtered = prev.filter((e) => e.animeId !== animeId);
        const entry: AnimeListEntry = {
          animeId,
          title: meta.title,
          coverImage: meta.coverImage,
          status,
          progress:
            status === "COMPLETED"
              ? meta.episodes ?? existing?.progress ?? 0
              : existing?.progress ?? 0,
          score: existing?.score ?? null,
          updatedAt: Date.now(),
          episodes: meta.episodes ?? existing?.episodes ?? null,
          airingStatus: meta.airingStatus ?? existing?.airingStatus ?? null,
        };
        const updated = [entry, ...filtered];
        writeList(updated);
        return updated;
      });
    },
    [],
  );

  const removeEntry = useCallback((animeId: number) => {
    setList((prev) => {
      const filtered = prev.filter((e) => e.animeId !== animeId);
      writeList(filtered);
      return filtered;
    });
  }, []);

  const updateScore = useCallback((animeId: number, score: number | null) => {
    setList((prev) => {
      const updated = prev.map((e) =>
        e.animeId === animeId ? { ...e, score, updatedAt: Date.now() } : e,
      );
      writeList(updated);
      return updated;
    });
  }, []);

  const updateProgress = useCallback((animeId: number, progress: number) => {
    setList((prev) => {
      const updated = prev.map((e) =>
        e.animeId === animeId ? { ...e, progress, updatedAt: Date.now() } : e,
      );
      writeList(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setList([]);
    writeList([]);
  }, []);

  const getEntry = useCallback(
    (animeId: number): AnimeListEntry | undefined =>
      list.find((e) => e.animeId === animeId),
    [list],
  );

  // ✅ Auto-complete: check if the user has watched the LAST episode of a
  // FINISHED anime. If so, auto-add it to "Completed" — but only if:
  //   1. The anime is FINISHED (not RELEASING — ongoing anime are skipped)
  //   2. The user watched the last episode (episodeNumber >= total episodes)
  //   3. The anime isn't already in the list (don't override manual status)
  // Called from the watch page when an episode ends.
  const checkAndAutoComplete = useCallback(
    (
      animeId: number,
      watchedEpisode: number,
      meta: {
        title: string;
        coverImage: string;
        episodes: number | null;
        airingStatus?: string | null;
      },
    ) => {
      // Skip if already in the list (don't override user's manual status)
      const existing = list.find((e) => e.animeId === animeId);
      if (existing) return;

      // Skip ongoing/releasing anime — only auto-complete FINISHED anime
      const status = meta.airingStatus?.toUpperCase();
      if (status !== "FINISHED" && status !== "CANCELLED") return;

      // Skip if we don't know the total episode count
      const totalEps = meta.episodes;
      if (!totalEps || totalEps <= 0) return;

      // Check if the user watched the last episode
      if (watchedEpisode >= totalEps) {
        console.log(
          `[AnimeList] Auto-completing "${meta.title}" — watched ep ${watchedEpisode}/${totalEps}`,
        );
        setStatus(animeId, "COMPLETED", {
          title: meta.title,
          coverImage: meta.coverImage,
          episodes: totalEps,
          airingStatus: meta.airingStatus,
        });
      }
    },
    [list, setStatus],
  );

  return {
    list,
    isLoaded,
    setStatus,
    removeEntry,
    updateScore,
    updateProgress,
    clearAll,
    getEntry,
    checkAndAutoComplete,
  };
}
