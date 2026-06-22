"use client";

// components/watch/VideoPlayer.tsx
// ✅ Backend mode is now MANDATORY.
// - Fetches stream URL from backend via /api/stream/[id]/[ep]
// - Uses StreamPlayer (native video + hls.js) for real HLS playback
// - Shows a clear "Backend Required" error if NEXT_PUBLIC_BACKEND_URL is missing
// - Shows loading skeleton while fetching

import { useState, useEffect, useCallback } from "react";
import { StreamPlayer } from "./StreamPlayer";
import { AlertCircle, Loader2, Server, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoPlayerProps {
  animeId: number;
  episode: number;
  animeTitle: string;
  posterUrl?: string;
  onProgress?: (currentTime: number, duration: number) => void;
}

interface StreamData {
  url: string;
  type: "hls" | "mp4" | "dash";
  quality: string | null;
}

export function VideoPlayer({
  animeId,
  episode,
  animeTitle,
  posterUrl,
  onProgress,
}: VideoPlayerProps) {
  const [stream, setStream] = useState<StreamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stableOnProgress = useCallback(
    (t: number, d: number) => onProgress?.(t, d),
    [onProgress],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStream(null);

    fetch(`/api/stream/${animeId}/${episode}`)
      .then(async (res) => {
        if (!res.ok) {
          // Backend returned an error — most likely missing NEXT_PUBLIC_BACKEND_URL
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Backend returned ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const s = json?.stream;
        if (!s || !s.url) {
          throw new Error("Backend returned an invalid stream response");
        }
        setStream({
          url: s.url,
          type: s.type,
          quality: s.quality ?? null,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load stream");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId, episode]);

  // ─── Backend not configured state ───
  if (error && error.toLowerCase().includes("backend")) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center text-center p-6 border border-xan-border">
        <div className="w-14 h-14 rounded-2xl bg-xan-crimson/15 flex items-center justify-center mb-4">
          <Server className="h-7 w-7 text-xan-crimson" />
        </div>
        <p className="text-foreground font-semibold text-lg">
          Backend Required
        </p>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Episode streaming requires a configured backend. Set{" "}
          <code className="px-1.5 py-0.5 bg-xan-card rounded text-xs font-mono">
            NEXT_PUBLIC_BACKEND_URL
          </code>{" "}
          in your environment to enable video playback.
        </p>
        <pre className="mt-4 text-xs bg-xan-card border border-xan-border rounded-lg p-3 font-mono text-muted-foreground">
{`# .env.local
NEXT_PUBLIC_BACKEND_URL="https://your-backend.com"`}
        </pre>
        <p className="text-xs text-muted-foreground/70 mt-3 flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          See lib/backend.ts for the API contract
        </p>
      </div>
    );
  }

  // ─── Error state ───
  if (error) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center text-center p-6 border border-xan-border">
        <AlertCircle className="h-10 w-10 text-xan-crimson mb-3" />
        <p className="text-foreground font-medium">Stream Unavailable</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  // ─── Loading state ───
  if (loading || !stream) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center border border-xan-border">
        <Loader2 className="h-10 w-10 text-xan-crimson animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">
          Loading episode {episode}…
        </p>
      </div>
    );
  }

  // ─── Play ───
  return (
    <StreamPlayer
      streamUrl={stream.url}
      streamType={stream.type}
      title={`${animeTitle} — Episode ${episode}`}
      posterUrl={posterUrl}
      onProgress={stableOnProgress}
    />
  );
}
