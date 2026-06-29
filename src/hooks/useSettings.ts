"use client";

// hooks/useSettings.ts
// ✅ Persistent user settings for XAN, stored in localStorage under "xan-settings".
// ✅ SSR-safe: initializes with defaults, hydrates from localStorage in useEffect.
// ✅ Merges with defaults so missing keys (from older versions) fall back gracefully.

import { useState, useEffect, useCallback } from "react";

export interface Settings {
  // ─── Appearance ───
  theme: "dark" | "light" | "system";

  // ─── Playback ───
  /** Auto-play the next episode when the current one ends */
  autoplayNext: boolean;
  /** Continue watching from the last saved position on revisit */
  autoResume: boolean;
  /** Default playback speed (0.5, 0.75, 1, 1.25, 1.5, 2) */
  defaultPlaybackSpeed: number;
  /** Default volume 0–100 */
  defaultVolume: number;
  /** Auto-skip the intro/OP segment of episodes */
  skipIntro: boolean;
  /** Auto-skip the outro/ED segment of episodes */
  skipOutro: boolean;

  // ─── Audio & Subtitles ───
  /** Default audio mode: "sub" (Japanese + subtitles) or "dub" (English dubbed) */
  defaultAudioMode: "sub" | "dub";

  // ─── Bandwidth ───
  /**
   * How the player should load video streams. Controls the tier cascade:
   *   "auto"            — direct → manifest-proxy → cf-proxy → full-proxy (default)
   *   "direct-only"     — direct only; no proxy (fails for Referer-enforced streams)
   *   "cf-only"         — CF Worker only; 0 Vercel BW but requires NEXT_PUBLIC_CF_WORKER_URL
   *   "direct-cf-only"  — direct → cf-proxy; 0 Vercel BW, no full-proxy fallback
   *   "proxy-only"      — full-proxy only (Vercel); for users whose ISP blocks CDNs
   */
  bandwidthMode:
    | "auto"
    | "direct-only"
    | "cf-only"
    | "direct-cf-only"
    | "proxy-only";

  /** Show the Sources panel below the video player (manual source switching) */
  showSourceSwitcher: boolean;

  // ─── Content & Discovery ───
  /** Hide adult/Ecchi/Hentai content from browse & search */
  hideAdult: boolean;
  /** Blur spoiler text in anime descriptions until hovered */
  hideSpoilers: boolean;
  /** Default sort order for browse/trending pages */
  defaultSort: "trending" | "popular" | "score" | "newest" | "oldest";

  // ─── Data & Privacy ───
  /** Track watch history in localStorage */
  saveHistory: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  autoplayNext: true,
  autoResume: true,
  defaultPlaybackSpeed: 1,
  defaultVolume: 100,
  skipIntro: false,
  skipOutro: false,
  defaultAudioMode: "sub",
  bandwidthMode: "auto",
  showSourceSwitcher: true,
  hideAdult: true,
  hideSpoilers: false,
  defaultSort: "trending",
  saveHistory: true,
};

const STORAGE_KEY = "xan-settings";

function readSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge with defaults so missing keys fall back gracefully
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(s: Settings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage not available (privacy mode) — silently ignore
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSettings(readSettings());
    setIsLoaded(true);
  }, []);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      writeSettings(next);
      return next;
    });
  }, []);

  const updateMany = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      writeSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    writeSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, update, updateMany, reset, isLoaded };
}
