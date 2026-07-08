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
   *   "auto"            — direct → manifest-proxy → cf-proxy → full-proxy (DEFAULT)
   *                       full-proxy is the only tier that uses Vercel bandwidth,
   *                       and only fires when direct/manifest-proxy/cf-proxy all
   *                       fail. The proxy_stream route now edge-caches 2xx
   *                       responses (immutable), so repeated segment fetches hit
   *                       Vercel's edge cache instead of re-streaming.
   *   "auto-no-vercel"  — direct → manifest-proxy → cf-proxy (NO full-proxy; 0 Vercel BW)
   *   "direct-only"     — direct only; no proxy (fails for Referer-enforced streams)
   *   "cf-only"         — CF Worker only; 0 Vercel BW but requires NEXT_PUBLIC_CF_WORKER_URL
   *   "direct-cf-only"  — direct → cf-proxy; 0 Vercel BW, no manifest-proxy, no full-proxy
   *   "proxy-only"      — full-proxy only (Vercel); for users whose ISP blocks CDNs
   *
   * ✅ Default is "auto" (full cascade) so playback just works for everyone.
   *    Bandwidth bleed is bounded by:
   *      1. Edge-cached manifests (manifest-proxy route, 60s browser / 300s edge)
   *      2. Edge-cached segments (proxy_stream route, immutable, 7d edge)
   *      3. CF Worker tier between manifest-proxy and full-proxy (when
   *         NEXT_PUBLIC_CF_WORKER_URL is set, CF absorbs most fallbacks).
   *    If Vercel BW usage climbs again, switch to "auto-no-vercel" in Settings
   *    or deploy the CF Worker in ./cf-worker.
   */
  bandwidthMode:
    | "auto"
    | "auto-no-vercel"
    | "direct-only"
    | "cf-only"
    | "direct-cf-only"
    | "proxy-only";

  /** Show the Sources panel below the video player (manual source switching) */
  showSourceSwitcher: boolean;

  /**
   * Source names the user has disabled (toggled off).
   * Sources matching these names are filtered out before display and playback.
   * Uses sourceName field (e.g. "Yt-mp4", "Mp4", "Sw", "Ok", "Zen", "Koto", "Pahe-Kiwi-Stream", "Gogoanime")
   */
  disabledSources: string[];

  /**
   * Pinned source name — when set, ONLY this source is loaded in the watch
   * page, regardless of disabledSources or provider priority. Even if the
   * pinned source fails to stream, no fallback to other sources occurs.
   * Set to null to disable pinning (normal behavior).
   * Uses sourceName field (e.g. "S-mp4", "Uni", "Koto").
   */
  pinnedSource: string | null;

  /**
   * Provider priority order — which provider's sources to try first.
   * Array of provider IDs in priority order (highest first).
   * The player auto-picks the highest-priority provider's best source.
   */
  providerPriority: string[];

  // ─── Content & Discovery ───
  /** Hide adult/Ecchi/Hentai content from browse & search */
  hideAdult: boolean;
  /** Blur spoiler text in anime descriptions until hovered */
  hideSpoilers: boolean;
  /** Default sort order for browse/trending pages */
  defaultSort: "trending" | "popular" | "score" | "newest" | "oldest";

  // ─── Accessibility ───
  /**
   * Reduce motion across the app. When true (or when the user's OS has
   * prefers-reduced-motion set), disables Ken Burns zoom, ambient blob
   * animation, card entrance animations, etc. Three states:
   *   "auto"     — respect the OS prefers-reduced-motion setting (default)
   *   "reduce"   — always reduce motion
   *   "no-reduce"— always allow motion
   */
  reducedMotion: "auto" | "reduce" | "no-reduce";

  // ─── Performance ───
  /**
   * TV Mode — disables all GPU-expensive effects for low-powered devices
   * (smart TVs, older tablets, etc.). When ON:
   *   - Disables all backdrop-filter (glass) → solid backgrounds
   *   - Disables all blur() filters → sharp images
   *   - Disables Ken Burns, ambient blob, card-enter animations
   *   - Reduces shadows to simpler/cheaper ones
   *   - Disables hover scale transforms
   * Dramatically improves FPS on devices with weak GPUs.
   */
  tvMode: boolean;

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
  // ✅ Gogoanime and AnimePahe are disabled by default — they're iframe-based
  // and less reliable than AllAnime (mp4upload direct MP4 + iframe embeds).
  // Uses provider IDs ("gogoanime", "pahe") so ALL sources from these
  // providers are filtered out, regardless of their sourceName.
  // Users can re-enable them in Settings → Bandwidth → Source Toggles.
  disabledSources: ["gogoanime", "pahe"],
  pinnedSource: null,
  providerPriority: ["allanime", "zen", "koto", "pahe", "gogoanime"],
  // NOTE: "isekai2nd" was removed — all AllAnime sources (via CF Worker)
  // are now tagged as provider: "allanime" so they show under one label.
  hideAdult: true,
  hideSpoilers: false,
  defaultSort: "trending",
  reducedMotion: "auto",
  tvMode: false,
  saveHistory: true,
};

const STORAGE_KEY = "xan-settings";
// ✅ Bump whenever a setting default changes in a way that should overwrite
// the user's previously-stored value. The migration runs once per bump.
const SETTINGS_VERSION = 6;
const SETTINGS_VERSION_KEY = "xan-settings-version";

function readSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge with defaults so missing keys fall back gracefully
    let merged: Settings = { ...DEFAULT_SETTINGS, ...parsed };

    // ─── Migrations ────────────────────────────────────────────────────
    const storedVersion = Number(localStorage.getItem(SETTINGS_VERSION_KEY) ?? "0");
    if (storedVersion < 2) {
      // v2 (historical): default bandwidthMode switched "auto" → "auto-no-vercel".
      // No-op now — v3 reverts this.
    }
    if (storedVersion < 3) {
      // v3: default bandwidthMode reverted to "auto" (full cascade). The
      // proxy_stream route now edge-caches 2xx responses as immutable, and
      // the manifest-proxy route is also edge-cached, so the full-proxy
      // tier no longer re-bills Vercel bandwidth on repeat fetches. Users
      // previously migrated to "auto-no-vercel" by v2 are restored to "auto"
      // so they get the full fallback cascade again.
      if (merged.bandwidthMode === "auto-no-vercel") {
        merged.bandwidthMode = "auto";
      }
    }
    if (storedVersion < 4) {
      // v4: providerPriority updated to put "isekai2nd" first.
      // As of mid-2026, AllAnime's episode query requires a Turnstile captcha
      // (returns AA_CRYPTO_MISSING without one). The new "isekai2nd" provider
      // routes through the CF Worker (with solver) to handle the captcha.
      // Users who explicitly customized their priority list are respected —
      // we only migrate if they're still on the old default.
      const oldDefault = ["allanime", "zen", "koto", "pahe", "gogoanime"];
      const isOldDefault =
        Array.isArray(merged.providerPriority) &&
        merged.providerPriority.length === oldDefault.length &&
        merged.providerPriority.every((p, i) => p === oldDefault[i]);
      if (isOldDefault) {
        merged.providerPriority = ["isekai2nd", "allanime", "zen", "koto", "pahe", "gogoanime"];
      }
      // Also: if "isekai2nd" is missing entirely, prepend it (user customized
      // priority but should still get the new provider).
      if (Array.isArray(merged.providerPriority) && !merged.providerPriority.includes("isekai2nd")) {
        merged.providerPriority = ["isekai2nd", ...merged.providerPriority];
      }
    }
    if (storedVersion < 5) {
      // v5: "isekai2nd" provider renamed to "allanime" — all AllAnime sources
      // (via CF Worker) now show under the "AllAnime" label. Remove "isekai2nd"
      // from the priority list so it doesn't show as a separate section.
      if (Array.isArray(merged.providerPriority)) {
        merged.providerPriority = merged.providerPriority.filter((p) => p !== "isekai2nd");
        // Make sure "allanime" is in the list
        if (!merged.providerPriority.includes("allanime")) {
          merged.providerPriority = ["allanime", ...merged.providerPriority];
        }
      }
    }
    if (storedVersion < 6) {
      // v6: Source list updated to current sources (post-mkissa.to migration).
      // - Gogoanime and AnimePahe disabled by default
      // - Old source names (Yt-mp4, S-mp4, Default, Sak, Wixmp, Luf-Mp4, etc.)
      //   are removed from disabledSources — they no longer exist
      const OLD_SOURCE_NAMES = [
        "Yt-mp4", "S-mp4", "Sl-mp4", "S1-mp4", "S2-mp4", "S3-mp4", "Ss-Hls",
        "Ak", "Default", "Sak", "Wixmp", "Luf-Mp4", "Fm-hls", "Vn-hls",
        "Viz", "Mycloud", "allanime-clock", "Sw",
        "Pahe-Kiwi-Stream", "Pahe-kiwi-stream", "Gogoanime",
      ];
      if (!Array.isArray(merged.disabledSources) || merged.disabledSources.length === 0) {
        merged.disabledSources = ["gogoanime", "pahe"];
      } else {
        // Remove old source names that no longer exist
        merged.disabledSources = merged.disabledSources.filter(
          (n) => !OLD_SOURCE_NAMES.includes(n),
        );
        // Add the provider IDs if not already present
        for (const pid of ["gogoanime", "pahe"]) {
          if (!merged.disabledSources.includes(pid)) {
            merged.disabledSources.push(pid);
          }
        }
      }
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(s: Settings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    localStorage.setItem(SETTINGS_VERSION_KEY, String(SETTINGS_VERSION));
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
