"use client";

// hooks/useMediaQuery.ts
// ✅ SSR-safe: window is read only inside useEffect

import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler); // ✅ Bug #19: Cleanup
  }, [query]);

  return matches;
}
