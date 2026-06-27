"use client";

// components/watch/VideoPlayer.tsx
// ✅ Controlled mode — parent (watch page) owns the mode state via localStorage.
// ✅ Throttled progress reporting (max 1 write/5s) to avoid localStorage spam.
// ✅ Retry button on error.
// ✅ Uses the new YouTube-style custom player (YouTubeStylePlayer).
import { useState, useEffect, useCallback, useRef } from "react";
import { YouTubeStylePlayer } from "./YouTubeStylePlayer";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ✅ Retry nonce — incrementing forces the fetch effect to re-run
  const [retryNonce, setRetryNonce] = useState(0);

  // ✅ Bug fix: use ref for onFallbackToSub to prevent unnecessary refetches.
  // Previously, onFallbackToSub was in the useEffect deps — if its identity
  // changed (e.g., parent re-render), the stream would refetch.
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStream(null);
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
          setStream({
            url: s.url,
            type: s.type,
            quality: s.quality ?? null,
            headers: s.headers,
            sourceName: s.sourceName,
            provider: json?.provider,
          });
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
    <YouTubeStylePlayer
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
    />
  );
}
