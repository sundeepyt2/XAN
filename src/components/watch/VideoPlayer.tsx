"use client";

// components/watch/VideoPlayer.tsx
// ✅ Controlled mode — parent (watch page) owns the mode state via localStorage.
// ✅ Throttled progress reporting (max 1 write/5s) to avoid localStorage spam.
// ✅ Retry button on error.
// ✅ Uses the new YouTube-style custom player (YouTubeStylePlayer).
// ✅ Reads bandwidthMode from useSettings and threads it through to the player.
// ✅ Reads/writes bandwidth-tier analytics via useBandwidthStats.
// ✅ Multi-source fallback: if all tiers fail for source[0], automatically
//    try source[1], source[2], etc. Maximize chance of finding a source that
//    works through the CF Worker (some providers block CF IPs, others don't).
import { useState, useEffect, useCallback, useRef } from "react";
import { YouTubeStylePlayer } from "./YouTubeStylePlayer";
import { AlertCircle, Loader2, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useBandwidthStats } from "@/hooks/useBandwidthStats";

interface VideoPlayerProps {
  animeId: number;
  episode: number;
  animeTitle: string;
  posterUrl?: string;
  autoResumeTime?: number;
  skipIntroOffset?: number;
  onEpisodeEnd?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  /** Current sub/dub mode (controlled by parent) */
  mode: "sub" | "dub";
  /** Called when dub falls back to sub for this episode */
  onFallbackToSub?: () => void;
}

interface StreamData {
  url: string;
  type: "hls" | "mp4" | "dash";
  quality: string | null;
  headers?: Record<string, string>;
  sourceName?: string;
  provider?: string;
}

export function VideoPlayer({
  animeId,
  episode,
  animeTitle,
  posterUrl,
  autoResumeTime,
  skipIntroOffset,
  onEpisodeEnd,
  onProgress,
  mode,
  onFallbackToSub,
}: VideoPlayerProps) {
  const [stream, setStream] = useState<StreamData | null>(null);
  // ✅ Full list of sources from the API — used for multi-source fallback
  const [allSources, setAllSources] = useState<StreamData[]>([]);
  // ✅ Which source index we're currently trying (advances on tier failure)
  const [sourceIdx, setSourceIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ✅ Retry nonce — incrementing forces the fetch effect to re-run
  const [retryNonce, setRetryNonce] = useState(0);
  // ✅ "Switching source" indicator (shown briefly while advancing to next source)
  const [switchingSource, setSwitchingSource] = useState(false);

  // ✅ Read bandwidthMode from settings + analytics hook
  const { settings } = useSettings();
  const { logTierResult } = useBandwidthStats();
  // Ref so the callback identity is stable (doesn't trigger stream refetch)
  const logTierResultRef = useRef(logTierResult);
  useEffect(() => {
    logTierResultRef.current = logTierResult;
  });

  // ✅ Bug fix: use ref for onFallbackToSub to prevent unnecessary refetches.
  const onFallbackToSubRef = useRef(onFallbackToSub);
  useEffect(() => {
    onFallbackToSubRef.current = onFallbackToSub;
  });

  // ✅ Throttle progress reporting — max 1 write per 5 seconds.
  const lastProgressWriteRef = useRef(0);
  const stableOnProgress = useCallback(
    (t: number, d: number) => {
      const now = Date.now();
      if (now - lastProgressWriteRef.current < 5000 && t < d * 0.95) return;
      lastProgressWriteRef.current = now;
      onProgress?.(t, d);
    },
    [onProgress],
  );

  const stableOnEpisodeEnd = useCallback(() => onEpisodeEnd?.(), [onEpisodeEnd]);

  // ✅ Stable analytics callback — fires when the player settles on a tier.
  // Also handles multi-source fallback: if all tiers fail for the current
  // source AND there are more sources available, advance to the next source.
  const stableOnTierResolved = useCallback(
    (tier: "direct" | "manifest-proxy" | "cf-proxy" | "full-proxy" | "failed") => {
      logTierResultRef.current?.({
        provider: stream?.provider ?? "unknown",
        sourceName: stream?.sourceName ?? "unknown",
        streamType: stream?.type ?? "unknown",
        tier,
      });

      // ✅ Multi-source fallback: if all tiers failed for this source, try the next one
      if (tier === "failed") {
        setSourceIdx((currentIdx) => {
          const nextIdx = currentIdx + 1;
          if (nextIdx < allSources.length) {
            console.warn(
              `[VideoPlayer] Source ${currentIdx} (${allSources[currentIdx]?.sourceName}) failed all tiers — trying source ${nextIdx} (${allSources[nextIdx]?.sourceName})`
            );
            setSwitchingSource(true);
            // Small delay so the user sees the "switching" indicator
            setTimeout(() => {
              setStream(allSources[nextIdx]);
              setSwitchingSource(false);
            }, 600);
            return nextIdx;
          }
          return currentIdx;
        });
      }
    },
    [stream, allSources],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStream(null);
    setAllSources([]);
    setSourceIdx(0);
    lastProgressWriteRef.current = 0;

    const titleParam = animeTitle ? `&title=${encodeURIComponent(animeTitle)}` : "";
    const modeParam = `&type=${mode}`;

    fetch(`/api/stream/${animeId}/${episode}?${titleParam}${modeParam}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Backend returned ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const s = json?.stream;
        if (json?.error && (!s || !s.url)) {
          setError(json.error);
          setLoading(false);
          return;
        }
        if (s && s.url) {
          const primaryStream: StreamData = {
            url: s.url,
            type: s.type,
            quality: s.quality ?? null,
            headers: s.headers,
            sourceName: s.sourceName,
            provider: json?.provider,
          };
          // ✅ Build the full sources list from the API response.
          // The API returns {stream: ..., sources: [...]} — we use both.
          const sources: StreamData[] = [primaryStream];
          if (Array.isArray(json?.sources)) {
            for (const src of json.sources) {
              if (src?.url && src.url !== primaryStream.url) {
                sources.push({
                  url: src.url,
                  type: src.type,
                  quality: src.quality ?? null,
                  headers: src.headers,
                  sourceName: src.sourceName,
                  provider: json?.provider,
                });
              }
            }
          }
          setAllSources(sources);
          setStream(primaryStream);
          setLoading(false);
          if (json?.fallbackMode) {
            onFallbackToSubRef.current?.();
          }
        } else {
          setError("Backend returned an invalid stream response");
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load stream");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId, episode, animeTitle, mode, retryNonce]);

  if (error) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center text-center p-6 border border-xan-border">
        <AlertCircle className="h-10 w-10 text-xan-crimson mb-3" />
        <p className="text-foreground font-medium">Stream Unavailable</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
        <Button
          onClick={() => setRetryNonce((n) => n + 1)}
          variant="secondary"
          size="sm"
          className="mt-4 bg-xan-card border-xan-border hover:bg-xan-card-hover"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (loading || !stream) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center border border-xan-border">
        <Loader2 className="h-10 w-10 text-xan-crimson animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">
          Loading episode {episode} ({mode.toUpperCase()})…
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <YouTubeStylePlayer
        key={`source-${sourceIdx}-${stream.url}`}
        streamUrl={stream.url}
        streamType={stream.type}
        title={`${animeTitle} — Episode ${episode}`}
        posterUrl={posterUrl}
        streamHeaders={stream.headers}
        sourceName={stream.sourceName}
        autoResumeTime={autoResumeTime}
        skipIntroOffset={skipIntroOffset}
        onEpisodeEnd={stableOnEpisodeEnd}
        onProgress={stableOnProgress}
        mode={mode}
        provider={stream.provider}
        bandwidthMode={settings.bandwidthMode}
        onTierResolved={stableOnTierResolved}
      />
      {/* ✅ "Switching source" overlay — shown briefly while advancing to next source */}
      {switchingSource && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-lg">
          <Shuffle className="h-8 w-8 text-xan-crimson mb-3 animate-pulse" />
          <p className="text-white font-medium text-sm">
            Trying alternative source…
          </p>
          <p className="text-white/60 text-xs mt-1">
            Source {sourceIdx + 1} of {allSources.length}
          </p>
        </div>
      )}
      {/* ✅ Source indicator (bottom-left, subtle) — shows which source is active */}
      {allSources.length > 1 && !switchingSource && (
        <div className="absolute bottom-2 left-2 text-[10px] text-white/40 font-mono pointer-events-none z-10">
          source {sourceIdx + 1}/{allSources.length}
        </div>
      )}
    </div>
  );
}
