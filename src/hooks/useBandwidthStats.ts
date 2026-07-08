"use client";

// hooks/useBandwidthStats.ts
// ✅ Client-side accumulator for stream-tier analytics.
// ✅ Stores per-provider breakdown in localStorage so the user can see which
//    providers are "bandwidth-friendly" (DIRECT) vs which force full-proxy.
// ✅ Optional server-side mirror: also POSTs each event to /api/analytics/stream-tier
//    so it shows up in Vercel logs for the site operator.

import { useState, useEffect, useCallback } from "react";

export type TierResult = "direct" | "manifest-proxy" | "cf-proxy" | "full-proxy" | "failed";

export interface TierStatKey {
  /** Provider name from the stream API (e.g. "allanime", "consumet/animepahe", "demo") */
  provider: string;
  /** Source name from the extractor (e.g. "Yt-mp4", "Mp4", "Fm-Hls", "Viz-Cloud") */
  sourceName: string;
  /** Stream type ("hls" | "mp4" | "dash") */
  streamType: string;
  /** Which tier the player settled on */
  tier: TierResult;
}

export interface TierStat extends TierStatKey {
  count: number;
  lastSeen: number; // epoch ms
}

interface BandwidthStatsShape {
  stats: TierStat[];
  /** Epoch ms of first event — used to compute "since" duration in UI */
  since: number;
}

const STORAGE_KEY = "xan-bandwidth-stats";
const MAX_STATS_ENTRIES = 200; // cap to prevent unbounded growth

function readStats(): BandwidthStatsShape {
  if (typeof window === "undefined") return { stats: [], since: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stats: [], since: 0 };
    const parsed = JSON.parse(raw) as Partial<BandwidthStatsShape>;
    return {
      stats: Array.isArray(parsed.stats) ? parsed.stats : [],
      since: typeof parsed.since === "number" ? parsed.since : 0,
    };
  } catch {
    return { stats: [], since: 0 };
  }
}

function writeStats(s: BandwidthStatsShape): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function statKey(k: TierStatKey): string {
  return `${k.provider}|${k.sourceName}|${k.streamType}|${k.tier}`;
}

/**
 * Fire-and-forget POST to the server-side analytics endpoint.
 * This shows up in Vercel function logs so the site operator can see
 * real-time tier distribution without a database.
 */
function postToServer(k: TierStatKey): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/analytics/stream-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(k),
      keepalive: true,
    });
  } catch {
    // network error — silently ignore; client-side stats still work
  }
}

export function useBandwidthStats() {
  const [stats, setStats] = useState<TierStat[]>([]);
  const [since, setSince] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const data = readStats();
    setStats(data.stats);
    setSince(data.since);
    setIsLoaded(true);
  }, []);

  /**
   * Log a tier result. Called by YouTubeStylePlayer when a tier succeeds
   * (manifest parsed / first segment loaded) or when all tiers fail.
   */
  const logTierResult = useCallback((k: TierStatKey) => {
    const key = statKey(k);
    const now = Date.now();
    setStats((prev) => {
      const existing = prev.find((s) => statKey(s) === key);
      let next: TierStat[];
      if (existing) {
        next = prev.map((s) =>
          statKey(s) === key
            ? { ...s, count: s.count + 1, lastSeen: now }
            : s,
        );
      } else {
        next = [
          ...prev,
          { ...k, count: 1, lastSeen: now },
        ];
      }
      // Cap growth — drop oldest entries by lastSeen when over the limit
      if (next.length > MAX_STATS_ENTRIES) {
        next = next
          .slice()
          .sort((a, b) => b.lastSeen - a.lastSeen)
          .slice(0, MAX_STATS_ENTRIES);
      }
      const data: BandwidthStatsShape = {
        stats: next,
        since: since || now,
      };
      writeStats(data);
      return next;
    });
    setSince((prev) => prev || now);

    // Mirror to server-side (fire-and-forget)
    postToServer(k);
  }, [since]);

  const clearStats = useCallback(() => {
    const empty: BandwidthStatsShape = { stats: [], since: 0 };
    writeStats(empty);
    setStats([]);
    setSince(0);
  }, []);

  return { stats, since, isLoaded, logTierResult, clearStats };
}
