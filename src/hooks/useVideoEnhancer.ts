"use client";

// hooks/useVideoEnhancer.ts
// ✅ Persistent video-enhancer settings for XAN, stored in localStorage
//    under "xan-video-enhancer". SSR-safe (typeof window guards).
// ✅ Presets + per-key reset + master enabled toggle.
// ✅ Custom presets (up to 10) stored in a separate localStorage key.
// ✅ "Peek" mode — temporary bypass to compare before/after.
//
// The CSS filter string is built by buildEnhancerFilterCss() below and is
// applied directly to the <video> / <iframe> element's `style.filter` property.
// The SVG <filter> element (for gamma + sharpen) is rendered separately by
// <VideoEnhancerFilters /> and referenced via `url(#xan-enhancer)`.

import { useState, useEffect, useCallback, useMemo } from "react";

export interface EnhancerState {
  /** Master on/off — when false, no filter is applied (even if values are non-default). */
  enabled: boolean;

  // ─── CSS-filter controls (0–200, 100 = neutral) ───
  /** Brightness. 100 = neutral. Range 0–200. */
  brightness: number;
  /** Contrast. 100 = neutral. Range 0–200. */
  contrast: number;
  /** Saturation. 100 = neutral. Range 0–200. */
  saturation: number;

  // ─── CSS-filter controls (angle) ───
  /** Hue rotation in degrees. Range -180 to 180. 0 = neutral. */
  hue: number;

  // ─── CSS-filter controls (other) ───
  /** Gaussian blur in pixels. Range 0–10. 0 = neutral. */
  blur: number;
  /** Sepia amount, 0–100 (percent). 0 = neutral. */
  sepia: number;
  /** Grayscale amount, 0–100 (percent). 0 = neutral. */
  grayscale: number;

  // ─── SVG-filter controls (require url(#xan-enhancer)) ───
  /** Gamma exponent. 1.0 = neutral. <1 = brighter midtones, >1 = darker midtones. Range 0.2–3.0. */
  gamma: number;
  /** Sharpen amount, 0–100. 0 = neutral (identity kernel). 100 = max sharpen. */
  sharpen: number;
}

export const DEFAULT_ENHANCER: EnhancerState = {
  enabled: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  gamma: 1.0,
  sharpen: 0,
};

/**
 * Curated presets. Each preset is a partial EnhancerState — missing keys
 * fall back to DEFAULT_ENHANCER. `enabled` is always forced to true when a
 * preset is selected (the user is choosing to enhance).
 */
export const ENHANCER_PRESETS: Record<string, { label: string; emoji: string; values: Omit<EnhancerState, "enabled"> }> = {
  // ─── Neutral ───
  original: {
    label: "Original",
    emoji: "⚪",
    values: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 0 },
  },

  // ─── Vivid family (saturation-forward) ───
  vivid: {
    label: "Vivid",
    emoji: "🌈",
    values: { brightness: 105, contrast: 115, saturation: 140, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 20 },
  },
  vivid_plus: {
    label: "Vivid+",
    emoji: "💫",
    values: { brightness: 108, contrast: 120, saturation: 160, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 30 },
  },
  vivid_max: {
    label: "Vivid Max",
    emoji: "🔥",
    values: { brightness: 110, contrast: 125, saturation: 180, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.05, sharpen: 40 },
  },
  neon: {
    label: "Neon",
    emoji: "💜",
    values: { brightness: 108, contrast: 125, saturation: 170, hue: 15, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 35 },
  },
  pastel: {
    label: "Pastel",
    emoji: "🎨",
    values: { brightness: 110, contrast: 95, saturation: 120, hue: 0, blur: 0.5, sepia: 0, grayscale: 0, gamma: 0.95, sharpen: 0 },
  },

  // ─── Boost family (targeted enhancement) ───
  color_boost: {
    label: "Color Boost",
    emoji: "🎭",
    values: { brightness: 105, contrast: 110, saturation: 150, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 15 },
  },
  bright_boost: {
    label: "Bright Boost",
    emoji: "☀️",
    values: { brightness: 130, contrast: 105, saturation: 110, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.05, sharpen: 10 },
  },
  contrast_boost: {
    label: "Contrast Boost",
    emoji: "🌗",
    values: { brightness: 100, contrast: 140, saturation: 105, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 20 },
  },
  sharp_boost: {
    label: "Sharp Boost",
    emoji: "⚔️",
    values: { brightness: 100, contrast: 110, saturation: 110, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 75 },
  },
  anime_boost_plus: {
    label: "Anime Boost+",
    emoji: "🌟",
    values: { brightness: 108, contrast: 125, saturation: 175, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.05, sharpen: 45 },
  },
  hdr_boost: {
    label: "HDR Boost",
    emoji: "💎",
    values: { brightness: 108, contrast: 120, saturation: 130, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.1, sharpen: 25 },
  },

  // ─── Cinema & mood ───
  cinema: {
    label: "Cinema",
    emoji: "🎬",
    values: { brightness: 95, contrast: 110, saturation: 90, hue: 0, blur: 0, sepia: 8, grayscale: 0, gamma: 0.95, sharpen: 10 },
  },
  warm: {
    label: "Warm",
    emoji: "🌅",
    values: { brightness: 105, contrast: 105, saturation: 115, hue: 10, blur: 0, sepia: 25, grayscale: 0, gamma: 1.0, sharpen: 10 },
  },
  cool: {
    label: "Cool",
    emoji: "❄️",
    values: { brightness: 100, contrast: 110, saturation: 110, hue: -15, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 10 },
  },
  vintage: {
    label: "Vintage",
    emoji: "📷",
    values: { brightness: 105, contrast: 95, saturation: 80, hue: 0, blur: 0, sepia: 40, grayscale: 0, gamma: 0.95, sharpen: 5 },
  },

  // ─── Effects ───
  anime: {
    label: "Anime Boost",
    emoji: "✨",
    values: { brightness: 105, contrast: 120, saturation: 160, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.05, sharpen: 35 },
  },
  soft: {
    label: "Soft",
    emoji: "🌫️",
    values: { brightness: 105, contrast: 95, saturation: 95, hue: 0, blur: 1.0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 0 },
  },
  sharp: {
    label: "Sharp",
    emoji: "🔪",
    values: { brightness: 100, contrast: 110, saturation: 110, hue: 0, blur: 0, sepia: 0, grayscale: 0, gamma: 1.0, sharpen: 55 },
  },
  mono: {
    label: "Mono",
    emoji: "🖤",
    values: { brightness: 105, contrast: 115, saturation: 100, hue: 0, blur: 0, sepia: 0, grayscale: 100, gamma: 1.0, sharpen: 15 },
  },
};

const STORAGE_KEY = "xan-video-enhancer";
/** Separate localStorage key for user-saved custom presets (max 10). */
const CUSTOM_PRESETS_KEY = "xan-video-enhancer-presets";
/** Hard cap on the number of custom presets a user can save. */
export const MAX_CUSTOM_PRESETS = 10;

/**
 * A user-saved custom preset. The `values` field is the same shape as
 * EnhancerState minus `enabled` (we always force enabled=true on apply).
 */
export interface CustomPreset {
  id: string;
  name: string;
  values: Omit<EnhancerState, "enabled">;
  createdAt: number;
}

function readState(): EnhancerState {
  if (typeof window === "undefined") return DEFAULT_ENHANCER;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ENHANCER;
    const parsed = JSON.parse(raw) as Partial<EnhancerState>;
    // Merge with defaults so missing keys (from older versions) fall back gracefully
    return { ...DEFAULT_ENHANCER, ...parsed };
  } catch {
    return DEFAULT_ENHANCER;
  }
}

function writeState(s: EnhancerState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage not available — silently ignore
  }
}

/** Read all user-saved custom presets from localStorage. Returns [] on error. */
function readCustomPresets(): CustomPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate shape — drop any malformed entries
    return parsed
      .filter((p: unknown): p is CustomPreset =>
        typeof p === "object" && p !== null &&
        typeof (p as CustomPreset).id === "string" &&
        typeof (p as CustomPreset).name === "string" &&
        typeof (p as CustomPreset).values === "object" && (p as CustomPreset).values !== null
      )
      .slice(0, MAX_CUSTOM_PRESETS);
  } catch {
    return [];
  }
}

/** Write custom presets array to localStorage. Silently truncates to MAX. */
function writeCustomPresets(presets: CustomPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets.slice(0, MAX_CUSTOM_PRESETS)));
  } catch {
    // localStorage not available — silently ignore
  }
}

/** Generate a unique ID for a new custom preset (timestamp + random suffix). */
function generatePresetId(): string {
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Returns true if the enhancer is "active" (would actually change the picture).
 * Used to show an indicator dot on the gear icon and decide whether to apply
 * the filter at all.
 */
export function isEnhancerActive(s: EnhancerState): boolean {
  if (!s.enabled) return false;
  return (
    s.brightness !== 100 ||
    s.contrast !== 100 ||
    s.saturation !== 100 ||
    s.hue !== 0 ||
    s.blur !== 0 ||
    s.sepia !== 0 ||
    s.grayscale !== 0 ||
    // ✅ Bug fix: use epsilon comparison for gamma (float). Strict !== 1.0
    // fails for values like 1.005 that round to 1.00 on the slider but are
    // technically non-default, causing the enhancer to appear "active" with
    // no visible effect.
    Math.abs(s.gamma - 1.0) > 0.001 ||
    s.sharpen !== 0
  );
}

/**
 * Build the CSS `filter` string for the <video> element.
 * Returns "none" when the enhancer is inactive or all values are neutral.
 *
 * The SVG filter `url(#xan-enhancer)` is appended only when gamma or sharpen
 * is non-default — saving the browser from running an extra SVG filter pass
 * when the user only changed CSS-filter values.
 */
export function buildEnhancerFilterCss(s: EnhancerState): string {
  if (!isEnhancerActive(s)) return "none";

  const parts: string[] = [];
  if (s.brightness !== 100) parts.push(`brightness(${(s.brightness / 100).toFixed(3)})`);
  if (s.contrast !== 100) parts.push(`contrast(${(s.contrast / 100).toFixed(3)})`);
  if (s.saturation !== 100) parts.push(`saturate(${(s.saturation / 100).toFixed(3)})`);
  if (s.hue !== 0) parts.push(`hue-rotate(${s.hue}deg)`);
  if (s.blur !== 0) parts.push(`blur(${s.blur.toFixed(2)}px)`);
  if (s.sepia !== 0) parts.push(`sepia(${(s.sepia / 100).toFixed(3)})`);
  if (s.grayscale !== 0) parts.push(`grayscale(${(s.grayscale / 100).toFixed(3)})`);

  // ✅ Only chain the SVG filter when gamma or sharpen is non-default.
  // Identity SVG filter passes are wasteful (extra rasterization pass).
  if (s.gamma !== 1.0 || s.sharpen !== 0) {
    parts.push("url(#xan-enhancer)");
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}

export function useVideoEnhancer() {
  const [state, setState] = useState<EnhancerState>(DEFAULT_ENHANCER);
  const [isLoaded, setIsLoaded] = useState(false);

  // Hydrate from localStorage on mount (SSR-safe)
  useEffect(() => {
    setState(readState());
    setIsLoaded(true);
  }, []);

  const update = useCallback(<K extends keyof EnhancerState>(key: K, value: EnhancerState[K]) => {
    setState((prev) => {
      const next = { ...prev, [key]: value };
      writeState(next);
      return next;
    });
  }, []);

  const updateMany = useCallback((partial: Partial<EnhancerState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      writeState(next);
      return next;
    });
  }, []);

  const applyPreset = useCallback((presetId: keyof typeof ENHANCER_PRESETS) => {
    const preset = ENHANCER_PRESETS[presetId];
    if (!preset) return;
    const next: EnhancerState = { ...preset.values, enabled: true };
    setState(next);
    writeState(next);
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_ENHANCER);
    writeState(DEFAULT_ENHANCER);
  }, []);

  const toggleEnabled = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      writeState(next);
      return next;
    });
  }, []);

  // ✅ "Peek" mode — temporary bypass to compare before/after.
  // While peeking is true, the filter is suppressed (video shows the ORIGINAL
  // un-enhanced picture) so the user can compare. This is a UI-only state — it
  // does NOT persist to localStorage. Releasing the button restores the filter.
  const [peeking, setPeeking] = useState(false);

  const peekStart = useCallback(() => {
    setPeeking(true);
  }, []);

  const peekEnd = useCallback(() => {
    setPeeking(false);
  }, []);

  // ✅ Safety: if the enhancer gets turned off while peeking, clear peeking
  // so the next time it's turned on, we don't start in a peeking state.
  useEffect(() => {
    if (!isEnhancerActive(state)) {
      setPeeking(false);
    }
  }, [state]);

  // ✅ Derived: the active CSS filter string (memoized so <video> doesn't
  // re-render unless the value actually changes).
  const filterCss = useMemo(() => buildEnhancerFilterCss(state), [state]);
  const active = useMemo(() => isEnhancerActive(state), [state]);

  // ✅ effectiveFilterCss is what the <video>/<iframe> actually gets.
  // When peeking, we suppress the filter entirely (show original).
  // When not active (or not enabled), filterCss is already "none".
  const effectiveFilterCss = peeking && active ? "none" : filterCss;
  const effectiveActive = active && !peeking;

  // ──────────────────────────────────────────────────────────────
  // Custom presets (user-saved, max 10, stored in separate localStorage key)
  // ──────────────────────────────────────────────────────────────
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);

  // Hydrate custom presets from localStorage on mount (SSR-safe)
  useEffect(() => {
    setCustomPresets(readCustomPresets());
  }, []);

  /** Save the current enhancer state as a new custom preset. Returns the new
   *  preset's id on success, or null if the user has hit the 10-preset cap. */
  const saveCustomPreset = useCallback((name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const newPreset: CustomPreset = {
      id: generatePresetId(),
      name: trimmed.slice(0, 24), // cap name length for UI sanity
      values: {
        brightness: state.brightness,
        contrast: state.contrast,
        saturation: state.saturation,
        hue: state.hue,
        blur: state.blur,
        sepia: state.sepia,
        grayscale: state.grayscale,
        gamma: state.gamma,
        sharpen: state.sharpen,
      },
      createdAt: Date.now(),
    };

    let savedId: string | null = null;
    setCustomPresets((prev) => {
      if (prev.length >= MAX_CUSTOM_PRESETS) return prev; // cap hit
      const next = [...prev, newPreset];
      writeCustomPresets(next);
      savedId = newPreset.id;
      return next;
    });
    return savedId;
  }, [state]);

  /** Apply a custom preset by id. Sets all 9 control values + enables the enhancer. */
  const applyCustomPreset = useCallback((id: string) => {
    // Read from state (not the closure-captured list) so this is stable
    setCustomPresets((prevList) => {
      const found = prevList.find((p) => p.id === id);
      if (found) {
        setState((prev) => {
          const next: EnhancerState = { ...found.values, enabled: true };
          writeState(next);
          return next;
        });
      }
      return prevList; // no change to the list
    });
  }, []);

  /** Delete a custom preset by id. No-op if not found. */
  const deleteCustomPreset = useCallback((id: string) => {
    setCustomPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeCustomPresets(next);
      return next;
    });
  }, []);

  /** Rename a custom preset by id. No-op if not found or new name is empty. */
  const renameCustomPreset = useCallback((id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCustomPresets((prev) => {
      const next = prev.map((p) =>
        p.id === id ? { ...p, name: trimmed.slice(0, 24) } : p,
      );
      writeCustomPresets(next);
      return next;
    });
  }, []);

  return {
    state,
    isLoaded,
    update,
    updateMany,
    applyPreset,
    reset,
    toggleEnabled,
    filterCss: effectiveFilterCss,
    active: effectiveActive,
    // ✅ Expose the raw (non-peeked) state for the SVG defs — we still want
    // the SVG filter to stay mounted while peeking so releasing the button
    // instantly restores the filter (no SVG re-mount flicker).
    rawState: state,
    rawActive: active,
    peeking,
    peekStart,
    peekEnd,
    // ✅ Custom presets (user-saved)
    customPresets,
    saveCustomPreset,
    applyCustomPreset,
    deleteCustomPreset,
    renameCustomPreset,
    canSaveMoreCustom: customPresets.length < MAX_CUSTOM_PRESETS,
  };
}
