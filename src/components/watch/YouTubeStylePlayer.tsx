"use client";

// components/watch/YouTubeStylePlayer.tsx
// ✅ YouTube-style custom video player for XAN
// ✅ 3-tier smart bandwidth loader — minimizes Vercel egress:
//       Tier 1 (Direct):         browser loads raw URL → 0 Vercel bytes
//       Tier 2 (Manifest-proxy): server proxies ONLY the .m3u8 (~5KB),
//                                segments load direct from CDN → ~0 Vercel bytes
//       Tier 3 (Full-proxy):     server proxies everything (fallback for
//                                Referer-enforced segments / MP4 with headers)
//    Auto-fallback: tries Tier 1 → on error, Tier 2 → on error, Tier 3.
//
// Features (mirrors the YouTube web player UX):
//   - Auto-hiding controls (3s idle when playing; reappear on mousemove/tap)
//   - Custom seekbar with:
//       • Buffered range indicator (translucent bar ahead of progress)
//       • Hover tooltip with timestamp (mouse-tracked)
//       • Skip-intro marker (white notch at skipIntroOffset)
//       • Larger thumb on hover (with red glow)
//   - Settings panel menu (gear → multi-level: Speed / Quality)
//   - HLS quality selector (Auto + every level from hls.levels)
//   - Volume slider that expands on hover (YouTube-style)
//   - Time display toggle (click to switch current/duration ↔ current/-remaining)
//   - Top gradient overlay with title
//   - Loading spinner (red pulsing)
//   - Big center play button (pop-in animation)
//   - Skip Intro button (visible during intro window)
//   - Keyboard shortcuts with visible seek ripple feedback (J/L/arrows → ±10s overlay)
//   - 0–9 keys seek to N×10% (YouTube behavior)
//   - Mobile: double-tap left/right half to seek ±10s with ripple
//   - Desktop: single click toggles play/pause, double-click toggles fullscreen
//   - Resume from last position (autoResumeTime prop)
//   - Episode-end detection at 90% (onEpisodeEnd)
//   - Picture-in-Picture, fullscreen, mute, volume
//   - SUB/DUB mode badge + source badge + bandwidth-mode badge (read-only)

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Hls from "hls.js";
import {
  AlertCircle,
  Loader2,
  Maximize,
  Minimize,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  PictureInPicture2,
  Keyboard,
  Settings,
  Check,
  ChevronRight,
  ChevronLeft,
  RotateCw,
  RotateCcw,
  Zap,
  Shield,
  Cloud,
} from "lucide-react";
import { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay";

interface YouTubeStylePlayerProps {
  streamUrl: string;
  streamType: "hls" | "mp4" | "dash" | "iframe";
  title: string;
  posterUrl?: string;
  streamHeaders?: Record<string, string>;
  sourceName?: string;
  autoResumeTime?: number;
  skipIntroOffset?: number;
  onEpisodeEnd?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  /** Current sub/dub mode (read-only badge — toggle is external) */
  mode?: "sub" | "dub";
  /**
   * Provider name from the stream API (e.g. "allanime", "consumet/animepahe", "demo").
   * Forwarded to the analytics callback so you can break down tier stats by provider.
   */
  provider?: string;
  /**
   * Bandwidth loading mode — controls the tier cascade:
   *   "auto"            — direct → manifest-proxy → cf-proxy → full-proxy (default)
   *   "auto-no-vercel"  — direct → manifest-proxy → cf-proxy (NO full-proxy; 0 Vercel BW)
   *   "direct-only"     — direct only; no proxy
   *   "cf-only"         — CF Worker only; 0 Vercel BW (requires NEXT_PUBLIC_CF_WORKER_URL)
   *   "direct-cf-only"  — direct → cf-proxy; 0 Vercel BW, no manifest-proxy, no full-proxy
   *   "proxy-only"      — full-proxy only (Vercel); for ISP-blocked CDNs
   */
  bandwidthMode?:
    | "auto"
    | "auto-no-vercel"
    | "direct-only"
    | "cf-only"
    | "direct-cf-only"
    | "proxy-only";
  /**
   * Called when the player settles on a tier (success or all-failed).
   * Used by the analytics hook to track which providers land on which tier.
   */
  onTierResolved?: (tier: "direct" | "manifest-proxy" | "cf-proxy" | "full-proxy" | "failed") => void;
  /** Called after the stream loads (loadeddata event) — used by parent to clear pending-seek flags */
  onLoadedCallback?: () => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface HlsLevelInfo {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

/**
 * Bandwidth loading tier.
 *   "direct"          — browser loads the raw stream URL; 0 Vercel bytes
 *   "manifest-proxy"  — server proxies ONLY the .m3u8 manifest (~5KB);
 *                       segments load direct from CDN; ~0 Vercel bytes
 *   "cf-proxy"        — Cloudflare Worker proxies everything WITH Referer
 *                       headers; 0 Vercel bytes (CF free tier handles BW)
 *   "full-proxy"      — Vercel proxies everything (last-resort fallback);
 *                       uses Vercel BW
 *
 * The player tries tiers in order and auto-advances on load errors.
 * For HLS:  direct → manifest-proxy → cf-proxy → full-proxy
 * For MP4:  direct → cf-proxy → full-proxy  (MP4 has no manifest to split)
 *
 * cf-proxy is only inserted when NEXT_PUBLIC_CF_WORKER_URL is set. If the
 * env var is missing, the cascade skips it (backward compatible).
 */
type LoadMode = "direct" | "manifest-proxy" | "cf-proxy" | "full-proxy";

// ✅ Cloudflare Worker URL — set via Vercel env var NEXT_PUBLIC_CF_WORKER_URL.
// Read once at module load. If empty, the cf-proxy tier is skipped.
const CF_WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL ?? "";

/**
 * Compute the ordered list of (mode, effectiveUrl) candidates to try.
 * The first one that loads successfully wins; the rest are fallbacks.
 *
 * @param bandwidthMode controls the cascade:
 *   "auto"            — direct → manifest-proxy → cf-proxy → full-proxy
 *   "auto-no-vercel"  — direct → manifest-proxy → cf-proxy (NO full-proxy; 0 Vercel BW)
 *   "direct-only"     — direct only
 *   "cf-only"         — cf-proxy only (requires NEXT_PUBLIC_CF_WORKER_URL)
 *   "direct-cf-only"  — direct → cf-proxy (0 Vercel BW, no manifest-proxy, no full-proxy)
 *   "proxy-only"      — full-proxy only (Vercel)
 */
function buildLoadCandidates(
  streamUrl: string,
  streamType: "hls" | "mp4" | "dash" | "iframe",
  headers?: Record<string, string>,
  bandwidthMode:
    | "auto"
    | "auto-no-vercel"
    | "direct-only"
    | "cf-only"
    | "direct-cf-only"
    | "proxy-only" = "auto",
): Array<{ mode: LoadMode; url: string }> {
  // ✅ iframe sources: always direct — no headers needed, no proxy
  // These are embed URLs (Ok.ru, Uni) that work without Referer
  if (streamType === "iframe") {
    return [{ mode: "direct", url: streamUrl }];
  }

  const hasHeaders = headers && Object.keys(headers).length > 0;

  // No headers → browser can load directly, no proxy needed at all.
  // (bandwidthMode doesn't matter here — direct always works.)
  if (!hasHeaders) {
    return [{ mode: "direct", url: streamUrl }];
  }

  // Build the query-string-encoded header params once
  const headerParams = new URLSearchParams();
  for (const [k, v] of Object.entries(headers!)) {
    headerParams.set(`h_${k}`, v);
  }
  const headerParamStr = headerParams.toString();
  const encodedStreamUrl = encodeURIComponent(streamUrl);

  // ✅ Pre-build all possible candidates
  const directCandidate = { mode: "direct" as const, url: streamUrl };
  const manifestProxyCandidate = {
    mode: "manifest-proxy" as const,
    url: `/api/manifest-proxy?url=${encodedStreamUrl}&${headerParamStr}`,
  };
  const cfProxyCandidate = CF_WORKER_URL
    ? {
        mode: "cf-proxy" as const,
        url: `${CF_WORKER_URL}/?url=${encodedStreamUrl}&${headerParamStr}`,
      }
    : null;
  const fullProxyCandidate = {
    mode: "full-proxy" as const,
    url: `/api/proxy_stream?url=${encodedStreamUrl}&${headerParamStr}`,
  };

  // ─── Mode: "proxy-only" — full-proxy only (Vercel) ───
  // Use case: user's ISP blocks the CDN AND the CF Worker.
  if (bandwidthMode === "proxy-only") {
    return [fullProxyCandidate];
  }

  // ─── Mode: "cf-only" — CF Worker only; 0 Vercel BW ───
  // Use case: user wants 0 Vercel BW and only trusts the CF Worker.
  // If CF_WORKER_URL is not set, returns empty → player will fail
  // (intentional — user explicitly chose cf-only).
  if (bandwidthMode === "cf-only") {
    return cfProxyCandidate ? [cfProxyCandidate] : [];
  }

  // ─── Mode: "direct-cf-only" — direct → cf-proxy; 0 Vercel BW ───
  // Use case: user wants 0 Vercel BW but allows direct as a first attempt
  // (for streams with signed URLs that don't need Referer). No full-proxy
  // fallback — if both fail, playback fails (intentional).
  if (bandwidthMode === "direct-cf-only") {
    const candidates: Array<{ mode: LoadMode; url: string }> = [directCandidate];
    if (cfProxyCandidate) candidates.push(cfProxyCandidate);
    return candidates;
  }

  // ─── Mode: "direct-only" — direct only; no proxy ───
  // Use case: user wants 0 Vercel BW and doesn't want to rely on CF Worker.
  // Fails for Referer-enforced streams (most MP4 sources).
  if (bandwidthMode === "direct-only") {
    return [directCandidate];
  }

  // ─── Mode: "auto-no-vercel" — direct → manifest-proxy → cf-proxy (NO full-proxy) ───
  // Use case: user wants 0 Vercel BW but wants manifest-proxy for HLS (which
  // "direct-cf-only" skips). This fixes HLS streams that need Referer for the
  // .m3u8 manifest but have signed segment URLs (segments load direct from CDN).
  // If all 0-Vercel-BW tiers fail, playback fails (no full-proxy fallback).
  if (bandwidthMode === "auto-no-vercel") {
    if (streamType === "hls") {
      // HLS: direct → manifest-proxy → cf-proxy
      const candidates: Array<{ mode: LoadMode; url: string }> = [
        directCandidate,
        manifestProxyCandidate,
      ];
      if (cfProxyCandidate) candidates.push(cfProxyCandidate);
      return candidates;
    }
    // MP4: direct → cf-proxy (no manifest-proxy for MP4)
    const candidates: Array<{ mode: LoadMode; url: string }> = [directCandidate];
    if (cfProxyCandidate) candidates.push(cfProxyCandidate);
    return candidates;
  }

  // ─── Mode: "auto" (default) — full cascade ───
  if (streamType === "hls") {
    // HLS: direct → manifest-proxy → cf-proxy → full-proxy
    const candidates: Array<{ mode: LoadMode; url: string }> = [
      directCandidate,
      manifestProxyCandidate,
    ];
    if (cfProxyCandidate) candidates.push(cfProxyCandidate);
    candidates.push(fullProxyCandidate);
    return candidates;
  }

  // MP4 / DASH: cf-proxy → full-proxy (skip wasted direct attempt when CF is set)
  // Falls back to direct → full-proxy when CF_WORKER_URL is not set.
  const candidates: Array<{ mode: LoadMode; url: string }> = [];
  if (cfProxyCandidate) {
    candidates.push(cfProxyCandidate);
  } else {
    candidates.push(directCandidate);
  }
  candidates.push(fullProxyCandidate);
  return candidates;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatRemaining(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  return `-${formatTime(s)}`;
}

type SettingsTab = "main" | "speed" | "quality";
type TimeMode = "duration" | "remaining";
type SeekFeedback = { id: number; delta: number };
type TapRipple = { id: number; side: "left" | "right" };

export function YouTubeStylePlayer({
  streamUrl,
  streamType,
  title,
  posterUrl,
  streamHeaders,
  sourceName,
  autoResumeTime,
  skipIntroOffset = 85,
  onEpisodeEnd,
  onProgress,
  mode = "sub",
  provider,
  bandwidthMode = "auto",
  onTierResolved,
  onLoadedCallback,
}: YouTubeStylePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const onEpisodeEndRef = useRef(onEpisodeEnd);
  const onProgressRef = useRef(onProgress);
  const autoResumeTimeRef = useRef(autoResumeTime);
  const onTierResolvedRef = useRef(onTierResolved);
  const onLoadedCallbackRef = useRef(onLoadedCallback);
  const endFiredRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; side: "left" | "right" }>({ time: 0, side: "left" });
  // ✅ Track which tier we've already logged for this stream — prevents
  // duplicate analytics events when the player retries within the same load.
  const tierLoggedRef = useRef<string | null>(null);
  // ✅ Ref to fireTierResolved — kept in sync by the stream-loading effect,
  // so the iframe render branch (which is outside the effect) can call it.
  const fireTierResolvedRef = useRef<(tier: "direct" | "manifest-proxy" | "cf-proxy" | "full-proxy" | "failed") => void>(() => {});

  // Playback state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);

  // UI state
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("main");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [timeMode, setTimeMode] = useState<TimeMode>("duration");
  const [seekHover, setSeekHover] = useState<{ x: number; t: number } | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<SeekFeedback | null>(null);
  const [tapRipple, setTapRipple] = useState<TapRipple | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hlsLevels, setHlsLevels] = useState<HlsLevelInfo[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = Auto (ABR)

  // ✅ Bandwidth load mode — tracks which tier is currently active.
  // Visible in the UI as a "Direct" (green) or "Proxied" (amber) badge.
  const [loadMode, setLoadMode] = useState<LoadMode>("direct");
  // Tier index for the current load attempt (advances on failure)
  const tierIdxRef = useRef(0);

  // Keep ref callbacks in sync without re-running the stream-loading effect
  useEffect(() => {
    onEpisodeEndRef.current = onEpisodeEnd;
    onProgressRef.current = onProgress;
    autoResumeTimeRef.current = autoResumeTime;
    onTierResolvedRef.current = onTierResolved;
    onLoadedCallbackRef.current = onLoadedCallback;
  });

  // ──────────────────────────────────────────────────────────────
  // Stream loader — 3-tier smart loader (direct → manifest-proxy → full-proxy)
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // ✅ iframe sources render an <iframe> (not a <video>) — skip the cascade
    // entirely. The iframe's onLoad handler fires the tier-resolved event.
    if (streamType === "iframe") {
      setLoading(true);
      setError(null);
      tierLoggedRef.current = null;
      setLoadMode("direct");
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // Build the candidate list for this stream (captured in closure)
    const candidates = buildLoadCandidates(streamUrl, streamType, streamHeaders, bandwidthMode);
    tierIdxRef.current = 0;
    // Reset the "already logged" guard for this load cycle
    tierLoggedRef.current = null;

    setLoading(true);
    setError(null);
    endFiredRef.current = false;
    setHlsLevels([]);
    setCurrentLevel(-1);
    setLoadMode(candidates[0]?.mode ?? "direct");

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let cancelled = false;

    // ✅ Helper: fire onTierResolved exactly once per load cycle.
    // Called when a tier succeeds (manifest parsed / canplay) or when all fail.
    const fireTierResolved = (tier: "direct" | "manifest-proxy" | "cf-proxy" | "full-proxy" | "failed") => {
      if (cancelled) return;
      if (tierLoggedRef.current === tier) return; // dedupe
      tierLoggedRef.current = tier;
      onTierResolvedRef.current?.(tier);
    };
    // ✅ Keep the ref in sync so the iframe render branch can call it
    fireTierResolvedRef.current = fireTierResolved;

    // ── Helper: try to load a specific tier's URL ──
    const tryLoadTier = (tierIdx: number) => {
      if (cancelled) return;
      const candidate = candidates[tierIdx];
      if (!candidate) {
        // Exhausted all tiers — show error
        setError("Failed to load stream after trying all bandwidth tiers. The source may be unavailable.");
        setLoading(false);
        // ✅ Analytics: all tiers failed
        fireTierResolved("failed");
        return;
      }

      setLoadMode(candidate.mode);
      const effectiveUrl = candidate.url;

      // Clean up any previous HLS instance before trying a new URL
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (streamType === "hls") {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            // ✅ Only set non-forbidden headers via xhrSetup.
            // Referer/Origin are forbidden in browser XHR and will be silently
            // stripped — they only work via the server-side proxy tiers.
            xhrSetup: (xhr) => {
              if (streamHeaders && candidate.mode === "direct") {
                Object.entries(streamHeaders).forEach(([k, v]) => {
                  try {
                    xhr.setRequestHeader(k, v);
                  } catch {
                    /* forbidden header — silently ignored */
                  }
                });
              }
            },
          });
          hlsRef.current = hls;
          hls.loadSource(effectiveUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
            if (cancelled) return;
            const levels: HlsLevelInfo[] = (data.levels || [])
              .map((lvl, i) => ({
                index: i,
                height: lvl.height || 0,
                bitrate: lvl.bitrate || 0,
                label: lvl.height ? `${lvl.height}p` : lvl.name || `Level ${i + 1}`,
              }))
              .filter((lvl, i, arr) =>
                arr.findIndex((x) => x.height === lvl.height) === i
              )
              .sort((a, b) => b.height - a.height);
            setHlsLevels(levels);
            // ✅ Manifest loaded successfully — current tier works.
            // Reset tier index so a future error starts from this tier.
            tierIdxRef.current = tierIdx;
            // ✅ Analytics: this tier succeeded
            fireTierResolved(candidate.mode);
            // ✅ Notify parent that the stream has loaded (HLS path)
            onLoadedCallbackRef.current?.();
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
            if (!cancelled) setCurrentLevel(data.level);
          });

          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (cancelled) return;
            // ✅ Bug fix: Recover from non-fatal errors automatically
            if (!data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.warn(`[player] HLS network error: ${data.details} — recovering`);
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.warn(`[player] HLS media error: ${data.details} — recovering`);
                  hls.recoverMediaError();
                  break;
              }
              return;
            }
            // ✅ On fatal error, advance to the next tier before giving up.
            // This is what makes the smart loader "auto-fallback":
            //   - Direct fails (CORS/Referer) → try manifest-proxy
            //   - Manifest-proxy fails (segments need Referer) → try full-proxy
            //   - Full-proxy fails → real error, show to user
            if (data.fatal) {
              const nextIdx = tierIdx + 1;
              if (nextIdx < candidates.length) {
                console.warn(
                  `[player] HLS tier ${tierIdx} (${candidate.mode}) failed: ${data.details} — falling back to tier ${nextIdx} (${candidates[nextIdx]?.mode})`
                );
                tryLoadTier(nextIdx);
              } else {
                setError(`Playback error: ${data.details}`);
                setLoading(false);
                // ✅ Analytics: all tiers failed
                fireTierResolved("failed");
              }
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari native HLS
          video.src = effectiveUrl;
          // ✅ Analytics: assuming native HLS succeeds (Safari handles CORS internally)
          fireTierResolved(candidate.mode);
        } else {
          setError("HLS is not supported in this browser.");
          setLoading(false);
          fireTierResolved("failed");
        }
      } else {
        // MP4 / DASH — direct <video src>
        video.src = effectiveUrl;
        // ✅ Analytics for MP4 is fired in onLoaded (loadeddata event) to
        // confirm the URL actually started playing. If it errors, onError
        // advances to the next tier or fires "failed".
      }
    };

    // ── Video element event handlers ──
    const onLoaded = () => {
      if (cancelled) return;
      setLoading(false);
      setDuration(video.duration || 0);
      const resumeTime = autoResumeTimeRef.current;
      if (resumeTime && resumeTime > 0 && isFinite(resumeTime)) {
        if (video.currentTime < resumeTime - 2 && resumeTime < (video.duration || Infinity) - 5) {
          try {
            video.currentTime = resumeTime;
          } catch {
            /* ignore */
          }
        }
      }
      // ✅ Analytics: for MP4/DASH, loadeddata means the current tier actually
      // works (not just that the URL was set). Fire success here.
      if (streamType !== "hls") {
        const currentTier = candidates[tierIdxRef.current]?.mode;
        if (currentTier) fireTierResolved(currentTier);
      }
      // ✅ Notify parent that the stream has loaded — used to clear pending-seek
      // flags after a manual source switch
      onLoadedCallbackRef.current?.();
    };
    const onPlaying = () => {
      if (!cancelled) {
        setPlaying(true);
        setLoading(false);
      }
    };
    const onPause = () => {
      if (!cancelled) setPlaying(false);
    };
    const onTimeUpdate = () => {
      if (cancelled) return;
      setProgress(video.currentTime);
      setDuration(video.duration || 0);
      onProgressRef.current?.(video.currentTime, video.duration || 0);

      const d = video.duration || 0;
      if (d > 0 && !endFiredRef.current && video.currentTime >= d * 0.9) {
        endFiredRef.current = true;
        onEpisodeEndRef.current?.();
      }
    };
    const onProgressEvt = () => {
      if (cancelled) return;
      const d = video.duration || 0;
      if (d > 0 && video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onEnded = () => {
      if (cancelled) return;
      setPlaying(false);
      if (!endFiredRef.current) {
        endFiredRef.current = true;
        onEpisodeEndRef.current?.();
      }
    };
    const onError = () => {
      if (cancelled) return;
      // ✅ MP4/DASH error — advance to next tier if available
      const currentIdx = tierIdxRef.current;
      const nextIdx = currentIdx + 1;
      if (nextIdx < candidates.length) {
        console.warn(
          `[player] video tier ${currentIdx} (${candidates[currentIdx]?.mode}) failed — falling back to tier ${nextIdx} (${candidates[nextIdx]?.mode})`
        );
        tierIdxRef.current = nextIdx;
        tryLoadTier(nextIdx);
      } else {
        setError("Failed to load stream. The source may be unavailable.");
        setLoading(false);
        // ✅ Analytics: all tiers failed
        fireTierResolved("failed");
      }
    };
    const onVolumeChange = () => {
      if (!cancelled) {
        setMuted(video.muted);
        setVolume(video.volume);
      }
    };
    const onRateChange = () => {
      if (!cancelled) setPlaybackRate(video.playbackRate);
    };
    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);
    // ✅ Bug fix: Only show loading spinner when actually stalled (playing but buffering)
    const onWaiting = () => {
      if (cancelled) return;
      if (video.paused) return;
      setLoading(true);
    };
    const onCanPlay = () => !cancelled && setLoading(false);

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("progress", onProgressEvt);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);

    // ✅ Kick off the first tier
    tryLoadTier(0);

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("progress", onProgressEvt);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, streamType, streamHeaders, bandwidthMode]);

  // ──────────────────────────────────────────────────────────────
  // Fullscreen listener
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ──────────────────────────────────────────────────────────────
  // Action callbacks
  // ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const changeVolume = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, v));
    if (v > 0 && video.muted) video.muted = false;
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    video.currentTime = newTime;
    setProgress(newTime);
  }, []);

  const seekTo = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    setProgress(t);
  }, []);

  const seekByFraction = useCallback((frac: number) => {
    const video = videoRef.current;
    if (!video) return;
    const d = video.duration || 0;
    if (d <= 0) return;
    video.currentTime = Math.max(0, Math.min(d, d * frac));
    setProgress(video.currentTime);
  }, []);

  const changeRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    // ✅ Clamp to 0.25–4 range (matches the slider bounds)
    const clampedRate = Math.max(0.25, Math.min(4, rate));
    video.playbackRate = clampedRate;
    setPlaybackRate(clampedRate);
  }, []);

  const changeQuality = useCallback((levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    // -1 means Auto (ABR)
    hls.currentLevel = levelIndex;
    setCurrentLevel(levelIndex);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("[PiP] toggle failed:", err);
    }
  }, []);

  const skipIntro = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const currentTime = video.currentTime;
    const dur = video.duration || 0;
    const targetTime = Math.min(currentTime + skipIntroOffset, dur - 5);
    seekTo(targetTime);
  }, [seekTo, skipIntroOffset]);

  // ──────────────────────────────────────────────────────────────
  // Seek feedback (the "+10s"/"-10s" overlay when seeking via keyboard)
  // ──────────────────────────────────────────────────────────────
  const triggerSeekFeedback = useCallback((delta: number) => {
    setSeekFeedback({ id: Date.now() + Math.random(), delta });
  }, []);

  const seekByWithFeedback = useCallback((delta: number) => {
    seekBy(delta);
    triggerSeekFeedback(delta);
  }, [seekBy, triggerSeekFeedback]);

  // ──────────────────────────────────────────────────────────────
  // Auto-hide controls (3s idle when playing)
  // ──────────────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      // Only auto-hide when actually playing AND no menu is open
      setControlsVisible((visible) => {
        if (!playing || showSettings || showShortcuts) return visible;
        return false;
      });
    }, 3000);
  }, [playing, showSettings, showShortcuts]);

  const onContainerMouseMove = useCallback(() => {
    showControls();
    scheduleHide();
  }, [showControls, scheduleHide]);

  const onContainerMouseLeave = useCallback(() => {
    if (playing && !showSettings && !showShortcuts) {
      setControlsVisible(false);
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, [playing, showSettings, showShortcuts]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // When playing state changes, schedule hide / show controls
  useEffect(() => {
    if (playing) {
      scheduleHide();
    } else {
      showControls();
    }
  }, [playing, scheduleHide, showControls]);

  // ✅ Bug fix: Close settings panel when clicking outside it
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click was inside the settings panel OR the settings gear button
      if (!target.closest("[data-settings-panel]") && !target.closest("[data-settings-button]")) {
        setShowSettings(false);
        setSettingsTab("main");
      }
    };
    // Use mousedown instead of click — fires before the click event processes,
    // and doesn't interfere with the gear button's onClick
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [showSettings]);

  // ──────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (showShortcuts && e.key !== "Escape" && e.key !== "?") return;

      // 0-9 = seek to N×10% (YouTube behavior)
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        seekByFraction(parseInt(e.key, 10) / 10);
        showControls();
        scheduleHide();
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          showControls();
          scheduleHide();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
        case "M":
          e.preventDefault();
          toggleMute();
          showControls();
          scheduleHide();
          break;
        case "ArrowLeft":
        case "j":
        case "J":
          e.preventDefault();
          seekByWithFeedback(-10);
          showControls();
          scheduleHide();
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          seekByWithFeedback(10);
          showControls();
          scheduleHide();
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.1));
          showControls();
          scheduleHide();
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.1));
          showControls();
          scheduleHide();
          break;
        case ">":
        case ".":
          e.preventDefault();
          {
            const idx = PLAYBACK_RATES.indexOf(playbackRate);
            const next = PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, idx + 1)];
            if (next) changeRate(next);
          }
          break;
        case "<":
        case ",":
          e.preventDefault();
          {
            const idx = PLAYBACK_RATES.indexOf(playbackRate);
            const prev = PLAYBACK_RATES[Math.max(0, idx - 1)];
            if (prev) changeRate(prev);
          }
          break;
        case "p":
        case "P":
          e.preventDefault();
          togglePip();
          break;
        case "t":
        case "T":
          e.preventDefault();
          setTimeMode((m) => (m === "duration" ? "remaining" : "duration"));
          showControls();
          scheduleHide();
          break;
        case "?":
        case "/":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        case "Escape":
          if (showSettings) {
            setShowSettings(false);
            setSettingsTab("main");
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    showShortcuts,
    showSettings,
    togglePlay,
    toggleFullscreen,
    toggleMute,
    seekByWithFeedback,
    seekByFraction,
    changeVolume,
    changeRate,
    togglePip,
    volume,
    playbackRate,
    showControls,
    scheduleHide,
  ]);

  // ──────────────────────────────────────────────────────────────
  // Seekbar interaction (hover preview + click-to-seek + drag scrub)
  // ──────────────────────────────────────────────────────────────
  const seekbarRef = useRef<HTMLDivElement>(null);

  const computeSeek = useCallback((clientX: number): number => {
    const bar = seekbarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * (duration || 0);
  }, [duration]);

  const onSeekbarMouseMove = useCallback((e: React.MouseEvent) => {
    const t = computeSeek(e.clientX);
    const bar = seekbarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setSeekHover({ x: xPct, t });
  }, [computeSeek]);

  const onSeekbarMouseLeave = useCallback(() => {
    setSeekHover(null);
  }, []);

  const onSeekbarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const t = computeSeek(e.clientX);
    setScrubTime(t);
    setIsScrubbing(true);

    const onMove = (ev: MouseEvent) => {
      const bar = seekbarRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const xPct = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
      const tt = Math.max(0, Math.min(duration || 0, (xPct / 100) * (duration || 0)));
      setScrubTime(tt);
      setSeekHover({ x: xPct, t: tt });
    };
    const onUp = (ev: MouseEvent) => {
      const tt = computeSeek(ev.clientX);
      seekTo(tt);
      setScrubTime(null);
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [computeSeek, duration, seekTo]);

  // ──────────────────────────────────────────────────────────────
  // Mobile double-tap to seek ±10s (left/right half)
  // ──────────────────────────────────────────────────────────────
  const onVideoTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const side: "left" | "right" = x < rect.width / 2 ? "left" : "right";
    const now = Date.now();

    if (
      now - lastTapRef.current.time < 300 &&
      lastTapRef.current.side === side
    ) {
      // Double-tap on the same side → seek
      e.preventDefault();
      const delta = side === "left" ? -10 : 10;
      seekBy(delta);
      triggerSeekFeedback(delta);
      setTapRipple({ id: Date.now(), side });
      lastTapRef.current = { time: 0, side };
    } else {
      lastTapRef.current = { time: now, side };
    }
  }, [seekBy, triggerSeekFeedback]);

  // ──────────────────────────────────────────────────────────────
  // Click handler (toggle play, but ignore if it's part of dblclick → fullscreen)
  // ──────────────────────────────────────────────────────────────
  const onVideoClick = useCallback(() => {
    togglePlay();
    showControls();
    scheduleHide();
  }, [togglePlay, showControls, scheduleHide]);

  const onVideoDoubleClick = useCallback(() => {
    toggleFullscreen();
  }, [toggleFullscreen]);

  // ──────────────────────────────────────────────────────────────
  // Derived display values
  // ──────────────────────────────────────────────────────────────
  const displayProgress = isScrubbing && scrubTime !== null ? scrubTime : progress;
  const progressPct = duration > 0 ? (displayProgress / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const introPct =
    skipIntroOffset > 0 && duration > skipIntroOffset + 10
      ? (skipIntroOffset / duration) * 100
      : null;

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const timeDisplay = useMemo(() => {
    if (timeMode === "remaining") {
      const remaining = Math.max(0, (duration || 0) - displayProgress);
      return `${formatTime(displayProgress)} / ${formatRemaining(remaining)}`;
    }
    return `${formatTime(displayProgress)} / ${formatTime(duration)}`;
  }, [timeMode, displayProgress, duration]);

  const qualityLabel = currentLevel === -1
    ? "Auto"
    : hlsLevels.find((l) => l.index === currentLevel)?.label ?? "Auto";

  const showSkipIntro =
    !loading &&
    progress >= 5 &&
    progress < skipIntroOffset + 30 &&
    duration > skipIntroOffset + 10;

  const controlsClass = `xan-controls ${controlsVisible ? "" : "xan-controls--hidden"}`;

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center text-center p-6 border border-xan-border">
        <AlertCircle className="h-10 w-10 text-xan-crimson mb-3" />
        <p className="text-foreground font-medium">Playback Error</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
      </div>
    );
  }

  // ✅ iframe-type sources (Ok.ru, Uni, etc.) — render an <iframe> instead of
  // a <video> element. These sources return HTML embed pages (not direct video
  // URLs), so they need the provider's own JS player to render.
  //
  // The iframe loads the provider's embed page directly. The provider's JS
  // handles all playback, controls, ads, etc. inside the iframe.
  //
  // Trade-off: we lose our custom YouTube-style player UI for these sources,
  // but they work reliably (no Referer/Origin issues, no proxy needed).
  // Bandwidth: 0 Vercel bytes — the iframe loads directly from the provider.
  //
  // ⚠️ NO sandbox attribute — Uni's player detects sandboxed iframes and shows
  // "Opss! Sandboxed our player is not allowed". The sandbox attribute's mere
  // presence triggers the detection (even with allow-same-origin). Removing it
  // is safe because we only embed known provider URLs (Ok.ru, Uni) via the
  // host allowlist in the stream API.
  if (streamType === "iframe") {
    return (
      <div
        ref={containerRef}
        className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-xan-border select-none"
      >
        <iframe
          src={streamUrl}
          className="w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; web-share"
          allowFullScreen
          referrerPolicy="origin"
          title={title}
          onLoad={() => {
            setLoading(false);
            // ✅ Fire tier resolved as "direct" — iframe loads directly, 0 Vercel BW
            fireTierResolvedRef.current?.("direct");
            onLoadedCallbackRef.current?.();
          }}
        />
        {/* Loading spinner while iframe loads */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black pointer-events-none">
            <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-xan-crimson animate-xan-spinner" />
          </div>
        )}
        {/* Top gradient with title + source badge — minimal UI for iframe mode */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pt-3 pb-8 pointer-events-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm md:text-base truncate drop-shadow">
                {title}
              </p>
              {mode && (
                <span className="inline-block mt-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/15 text-white">
                  {mode === "dub" ? "DUB" : "SUB"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 text-white font-medium">
                {sourceName ?? "IFRAME"}
              </span>
              {/* Bandwidth badge for iframe — always DIRECT (0 Vercel BW) */}
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-400/30"
                title="Iframe embed — 0 Vercel bandwidth. Provider's own player handles playback."
              >
                <Zap className="h-2.5 w-2.5" />
                DIRECT
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-xan-border group select-none"
      onMouseMove={onContainerMouseMove}
      onMouseLeave={onContainerMouseLeave}
    >
      <video
        ref={videoRef}
        poster={posterUrl}
        className="w-full h-full object-contain"
        playsInline
        onClick={onVideoClick}
        onDoubleClick={onVideoDoubleClick}
        onTouchStart={onVideoTouchStart}
        title={title}
      />

      {/* Loading spinner (red, pulsing) */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-xan-crimson animate-xan-spinner" />
        </div>
      )}

      {/* Seek feedback overlay (when pressing J/L/arrows) */}
      {seekFeedback && (
        <div
          key={seekFeedback.id}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
        >
          <div className="px-6 py-3 rounded-full bg-black/70 backdrop-blur-sm text-white font-bold text-2xl flex items-center gap-2 animate-seek-ripple">
            {seekFeedback.delta < 0 ? (
              <RotateCcw className="h-6 w-6" />
            ) : (
              <RotateCw className="h-6 w-6" />
            )}
            {seekFeedback.delta > 0 ? "+" : ""}
            {seekFeedback.delta}s
          </div>
        </div>
      )}

      {/* Mobile double-tap ripple */}
      {tapRipple && (
        <div
          key={tapRipple.id}
          className={`absolute top-0 bottom-0 w-1/2 flex items-center justify-center pointer-events-none z-20 ${tapRipple.side === "left" ? "left-0" : "right-0"}`}
        >
          <div className="w-24 h-24 rounded-full bg-white/20 animate-tap-ripple" />
        </div>
      )}

      {/* ── Top gradient with title ── */}
      <div
        className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pt-3 pb-8 xan-controls ${controlsVisible ? "" : "xan-controls--hidden"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm md:text-base truncate drop-shadow">
              {title}
            </p>
            {mode && (
              <span className="inline-block mt-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/15 text-white">
                {mode === "dub" ? "DUB" : "SUB"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 text-white font-medium">
              {sourceName ?? (streamType === "hls" ? "HLS" : streamType.toUpperCase())}
            </span>
            {/* ✅ Bandwidth-mode badge — Direct (green) / CF (cyan) / Proxied (amber) */}
            {loadMode === "direct" ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-400/30"
                title="Direct client-side fetch — 0 Vercel bandwidth. Video streams straight from the provider CDN to your browser."
              >
                <Zap className="h-2.5 w-2.5" />
                DIRECT
              </span>
            ) : loadMode === "manifest-proxy" ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300/90 border border-emerald-400/20"
                title="Manifest-only proxy — ~5KB through Vercel (the .m3u8 file). Segments stream direct from CDN to your browser."
              >
                <Zap className="h-2.5 w-2.5" />
                DIRECT+
              </span>
            ) : loadMode === "cf-proxy" ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
                title="Cloudflare Worker proxy — 0 Vercel bandwidth. Video streams through a free Cloudflare Worker that adds the Referer header the provider requires. Free tier: 100k req/day."
              >
                <Cloud className="h-2.5 w-2.5" />
                CF
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30"
                title="Full proxy fallback — video flows through Vercel. Used only when the CF Worker is unavailable or rate-limited. Eats Vercel bandwidth quota."
              >
                <Shield className="h-2.5 w-2.5" />
                PROXIED
              </span>
            )}
            <button
              onClick={() => setShowShortcuts(true)}
              className="p-1.5 rounded-md text-white hover:bg-white/15 transition-colors"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Big center play button (when paused) ── */}
      {/* ✅ Bug fix: pointer-events-none on overlay, pointer-events-auto on button */}
      {!playing && !loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <button
            onClick={togglePlay}
            className="pointer-events-auto"
            aria-label="Play"
          >
            <div className="w-20 h-20 rounded-full bg-xan-crimson/90 hover:bg-xan-crimson flex items-center justify-center shadow-xl transition-transform hover:scale-105 animate-play-pop">
              <Play className="h-9 w-9 text-white fill-white ml-1" />
            </div>
          </button>
        </div>
      )}

      {/* ── Bottom controls bar ── */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 pb-2 pt-10 ${controlsClass}`}
      >
        {/* Seekbar */}
        <div
          ref={seekbarRef}
          className="relative h-3 flex items-center cursor-pointer group/seek mb-1"
          onMouseMove={onSeekbarMouseMove}
          onMouseLeave={onSeekbarMouseLeave}
          onMouseDown={onSeekbarMouseDown}
        >
          {/* Track background */}
          <div className="absolute left-0 right-0 h-1 rounded-full bg-white/25 group-hover/seek:h-1.5 transition-all" />
          {/* Buffered range */}
          <div
            className="absolute left-0 h-1 rounded-full bg-white/40 group-hover/seek:h-1.5 transition-all"
            style={{ width: `${bufferedPct}%` }}
          />
          {/* Played (red) */}
          <div
            className="absolute left-0 h-1 rounded-full bg-xan-crimson group-hover/seek:h-1.5 transition-all"
            style={{ width: `${progressPct}%` }}
          />
          {/* Skip intro marker (white notch) */}
          {introPct !== null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-white/70 rounded-full pointer-events-none"
              style={{ left: `${introPct}%` }}
              title="Intro"
            />
          )}
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-xan-crimson shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${progressPct}%` }}
          />
          {/* Hover preview tooltip */}
          {seekHover && (
            <div
              className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 text-white text-[11px] font-mono pointer-events-none whitespace-nowrap shadow-lg"
              style={{ left: `${seekHover.x}%` }}
            >
              {formatTime(seekHover.t)}
            </div>
          )}
        </div>

        {/* Buttons row */}
        <div className="flex items-center justify-between text-white">
          {/* Left cluster */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded hover:bg-white/15 transition-colors"
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause (k)" : "Play (k)"}
            >
              {playing ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 fill-white" />
              )}
            </button>

            <button
              onClick={() => seekByWithFeedback(-10)}
              className="p-1.5 rounded hover:bg-white/15 transition-colors hidden sm:block"
              aria-label="Back 10 seconds"
              title="Back 10s (J / ←)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => seekByWithFeedback(10)}
              className="p-1.5 rounded hover:bg-white/15 transition-colors hidden sm:block"
              aria-label="Forward 10 seconds"
              title="Forward 10s (L / →)"
            >
              <RotateCw className="h-4 w-4" />
            </button>

            {/* ✅ Volume — redesigned with visible track + fill (like the seekbar) */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={toggleMute}
                className="p-1.5 rounded hover:bg-white/15 transition-colors"
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Unmute (M)" : "Mute (M)"}
              >
                <VolumeIcon className="h-5 w-5" />
              </button>
              {/* Custom volume slider with visible track + fill + thumb */}
              <div className="relative w-14 h-3 flex items-center group/vol-slider">
                <div className="absolute left-0 right-0 h-1 rounded-full bg-white/25" />
                <div
                  className="absolute left-0 h-1 rounded-full bg-white transition-all"
                  style={{ width: `${(muted ? 0 : volume) * 100}%` }}
                />
                <div
                  className="absolute w-2.5 h-2.5 rounded-full bg-white shadow-sm opacity-0 group-hover/vol-slider:opacity-100 transition-opacity pointer-events-none"
                  style={{ left: `calc(${(muted ? 0 : volume) * 100}% - 5px)` }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  aria-label="Volume"
                  style={{ WebkitAppearance: "none", appearance: "none", background: "transparent" }}
                />
              </div>
            </div>

            {/* Time display (click to toggle duration ↔ remaining) */}
            <button
              onClick={() => setTimeMode((m) => (m === "duration" ? "remaining" : "duration"))}
              className="text-xs font-mono px-1.5 py-0.5 rounded hover:bg-white/15 transition-colors whitespace-nowrap"
              title="Click to toggle remaining time (T)"
            >
              {timeDisplay}
            </button>
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1.5">
            {/* ✅ Skip button — >> style (double chevron), permanent, white */}
            <button
              onClick={skipIntro}
              className="p-1.5 rounded hover:bg-white/15 transition-colors text-white flex items-center"
              aria-label="Skip forward"
              title={`Skip forward (${skipIntroOffset}s)`}
            >
              <ChevronRight className="h-5 w-5" />
              <ChevronRight className="h-5 w-5 -ml-3" />
            </button>

            {/* Settings (gear) → multi-level panel */}
            <div className="relative">
              <button
                data-settings-button
                onClick={() => {
                  setShowSettings((v) => !v);
                  setSettingsTab("main");
                }}
                className={`p-1.5 rounded hover:bg-white/15 transition-colors ${showSettings ? "bg-white/15" : ""}`}
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>

              {showSettings && (
                <div
                  data-settings-panel
                  className="absolute bottom-full right-0 mb-2 w-60 rounded-lg bg-[#0f0f0f]/95 backdrop-blur border border-white/10 shadow-2xl text-white text-sm overflow-hidden animate-panel-up"
                  onClick={(e) => e.stopPropagation()}
                >
                  {settingsTab === "main" && (
                    <>
                      <button
                        onClick={() => setSettingsTab("speed")}
                        className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-white/10 transition-colors"
                      >
                        <span>Playback speed</span>
                        <span className="flex items-center gap-1.5 text-white/70">
                          {playbackRate}x
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </button>
                      {hlsLevels.length > 0 && (
                        <button
                          onClick={() => setSettingsTab("quality")}
                          className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-white/10 transition-colors border-t border-white/5"
                        >
                          <span>Quality</span>
                          <span className="flex items-center gap-1.5 text-white/70">
                            {qualityLabel}
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        </button>
                      )}
                    </>
                  )}

                  {settingsTab === "speed" && (
                    <div>
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
                        <button
                          onClick={() => setSettingsTab("main")}
                          className="p-0.5 rounded hover:bg-white/10"
                          aria-label="Back"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="font-medium">Playback speed</span>
                      </div>
                      {/* ✅ Fine-grained speed slider (0.25x – 4x) */}
                      <div className="px-4 py-3 border-b border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-white/60">Speed</span>
                          <span className="text-xs font-mono font-bold text-xan-crimson">{playbackRate.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min={0.25}
                          max={4}
                          step={0.05}
                          value={playbackRate}
                          onChange={(e) => changeRate(Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          className="xan-vol w-full"
                          aria-label="Playback speed slider"
                        />
                        <div className="flex justify-between text-[9px] text-white/30 mt-1">
                          <span>0.25x</span>
                          <span>1x</span>
                          <span>2x</span>
                          <span>4x</span>
                        </div>
                      </div>
                      {/* Preset buttons */}
                      {PLAYBACK_RATES.map((rate) => (
                        <button
                          key={rate}
                          onClick={() => {
                            changeRate(rate);
                            setSettingsTab("main");
                          }}
                          className="flex items-center justify-between w-full px-4 py-2 hover:bg-white/10 transition-colors"
                        >
                          <span>{rate}x{rate === 1 ? " (Normal)" : ""}</span>
                          {rate === playbackRate && <Check className="h-4 w-4 text-xan-crimson" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {settingsTab === "quality" && (
                    <div>
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
                        <button
                          onClick={() => setSettingsTab("main")}
                          className="p-0.5 rounded hover:bg-white/10"
                          aria-label="Back"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="font-medium">Quality</span>
                      </div>
                      <button
                        onClick={() => {
                          changeQuality(-1);
                          setSettingsTab("main");
                        }}
                        className="flex items-center justify-between w-full px-4 py-2 hover:bg-white/10 transition-colors"
                      >
                        <span>Auto{currentLevel === -1 ? " (current)" : ""}</span>
                        {currentLevel === -1 && <Check className="h-4 w-4 text-xan-crimson" />}
                      </button>
                      {hlsLevels.map((lvl) => (
                        <button
                          key={lvl.index}
                          onClick={() => {
                            changeQuality(lvl.index);
                            setSettingsTab("main");
                          }}
                          className="flex items-center justify-between w-full px-4 py-2 hover:bg-white/10 transition-colors"
                        >
                          <span>{lvl.label}</span>
                          {currentLevel === lvl.index && <Check className="h-4 w-4 text-xan-crimson" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* PiP */}
            <button
              onClick={togglePip}
              className={`p-1.5 rounded hover:bg-white/15 transition-colors ${isPip ? "text-xan-crimson" : "text-white"}`}
              aria-label="Picture-in-Picture"
              title="Picture-in-Picture (P)"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded hover:bg-white/15 transition-colors"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {showShortcuts && (
        <KeyboardShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}
