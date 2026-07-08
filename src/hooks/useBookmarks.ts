"use client";

// hooks/useBookmarks.ts
// ✅ Lightweight "save for later" bookmarks — distinct from the MAL-style
//    status list. One click to bookmark, one click to remove. No status field.
// ✅ localStorage-based, SSR-safe (same pattern as useWatchHistory).

import { useState, useEffect, useCallback } from "react";

export interface BookmarkEntry {
  animeId: number;
  title: string;
  coverImage: string;
  addedAt: number;
}

const STORAGE_KEY = "xan-bookmarks";
const MAX_BOOKMARKS = 200;

function readBookmarks(): BookmarkEntry[] {
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

function writeBookmarks(entries: BookmarkEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_BOOKMARKS)));
  } catch {
    // ignore
  }
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setBookmarks(readBookmarks());
    setIsLoaded(true);
  }, []);

  const addBookmark = useCallback((entry: Omit<BookmarkEntry, "addedAt">) => {
    setBookmarks((prev) => {
      if (prev.some((e) => e.animeId === entry.animeId)) return prev; // already bookmarked
      const updated = [{ ...entry, addedAt: Date.now() }, ...prev];
      writeBookmarks(updated);
      return updated;
    });
  }, []);

  const removeBookmark = useCallback((animeId: number) => {
    setBookmarks((prev) => {
      const updated = prev.filter((e) => e.animeId !== animeId);
      writeBookmarks(updated);
      return updated;
    });
  }, []);

  const toggleBookmark = useCallback((entry: Omit<BookmarkEntry, "addedAt">) => {
    setBookmarks((prev) => {
      if (prev.some((e) => e.animeId === entry.animeId)) {
        const updated = prev.filter((e) => e.animeId !== entry.animeId);
        writeBookmarks(updated);
        return updated;
      }
      const updated = [{ ...entry, addedAt: Date.now() }, ...prev];
      writeBookmarks(updated);
      return updated;
    });
  }, []);

  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
    writeBookmarks([]);
  }, []);

  const isBookmarked = useCallback(
    (animeId: number) => bookmarks.some((e) => e.animeId === animeId),
    [bookmarks],
  );

  return {
    bookmarks,
    isLoaded,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    clearBookmarks,
    isBookmarked,
  };
}
