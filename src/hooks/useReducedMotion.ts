"use client";

// hooks/useReducedMotion.ts
// ✅ Combines the user's "reducedMotion" setting with the OS
//    prefers-reduced-motion preference.
//
// Resolution:
//   setting === "reduce"    → always true
//   setting === "no-reduce" → always false
//   setting === "auto"      → defer to OS prefers-reduced-motion

import { useEffect, useState } from "react";
import { useSettings } from "./useSettings";

function getOsPref(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion(): boolean {
  const { settings, isLoaded } = useSettings();
  const [osPref, setOsPref] = useState(false);

  useEffect(() => {
    setOsPref(getOsPref());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setOsPref(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isLoaded) return false; // safe default before hydration
  if (settings.reducedMotion === "reduce") return true;
  if (settings.reducedMotion === "no-reduce") return false;
  return osPref; // "auto"
}
