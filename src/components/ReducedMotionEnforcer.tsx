"use client";

// components/ReducedMotionEnforcer.tsx
// ✅ Applies CSS classes to <html> based on user settings:
//    - `xan-reduce-motion` — disables animations (reduced motion preference)
//    - `xan-tv-mode` — disables all GPU-expensive effects (blur, backdrop-filter,
//      heavy shadows, hover transforms) for low-powered devices like smart TVs.

import { useEffect } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSettings } from "@/hooks/useSettings";

export function ReducedMotionEnforcer() {
  const reduce = useReducedMotion();
  const { settings, isLoaded } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    if (reduce) {
      root.classList.add("xan-reduce-motion");
    } else {
      root.classList.remove("xan-reduce-motion");
    }
  }, [reduce]);

  useEffect(() => {
    const root = document.documentElement;
    if (isLoaded && settings.tvMode) {
      root.classList.add("xan-tv-mode");
    } else {
      root.classList.remove("xan-tv-mode");
    }
  }, [settings.tvMode, isLoaded]);

  return null;
}
