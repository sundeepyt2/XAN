"use client";

// hooks/useWatchHistory.ts
// ✅ Bug #16: Never access localStorage at module scope or during SSR

import { useState, useEffect, useCallback } from "react";

export interface WatchHistoryEntry {
  animeId: number;
  episodeId: string;
  episodeNumber: number;
  timestamp: number; // seconds into the episode
  duration: number; // total episode duration
  title: string;
  coverImage: string;
  updatedAt: number; // Date.now()
  genres?: string[]; // stored for recommendation engine
}

const STORAGE_KEY = "xan-watch-history";
const MAX_HISTORY = 50;

function readHistory(): WatchHistoryEntry[] {
  if (typeof window === "undefined") return []; // SSR guard
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    console.error("[WatchHistory] Failed to read localStorage");
    return [];
  }
}

function writeHistory(entries: WatchHistoryEntry[]): void {
  if (typeof window === "undefined") return; // SSR guard
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_HISTORY)),
    );
  } catch {
    console.error("[WatchHistory] Failed to write localStorage");
  }
}

export function useWatchHistory() {
  // ✅ Initialize with empty array — populate in useEffect to avoid hydration mismatch
  const [history, setHistory] = useState<WatchHistoryEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // ✅ Only read from localStorage after mount (client-side)
  useEffect(() => {
    setHistory(readHistory());
    setIsLoaded(true);
  }, []);

  const addEntry = useCallback((entry: WatchHistoryEntry) => {
    setHistory((prev) => {
      const filtered = prev.filter(
        (e) =>
          e.animeId !== entry.animeId || e.episodeId !== entry.episodeId,
      );
      const updated = [{ ...entry, updatedAt: Date.now() }, ...filtered];
      writeHistory(updated);
      return updated;
    });
  }, []);

  const removeEntry = useCallback((animeId: number) => {
    setHistory((prev) => {
      const filtered = prev.filter((e) => e.animeId !== animeId);
      writeHistory(filtered);
      return filtered;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    writeHistory([]);
  }, []);

  return { history, isLoaded, addEntry, removeEntry, clearHistory };
}
