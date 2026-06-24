"use client";

// components/watch/VideoPlayer.tsx
// ✅ Simplified stream loading — server proxy does all the heavy lifting.
// Flow: server proxy → demo fallback.
// The server proxy now uses persisted GraphQL queries (no CF cookie needed).

import { useState, useEffect, useCallback } from "react";
import { StreamPlayer } from "./StreamPlayer";
import { AlertCircle, Loader2, Settings } from "lucide-react";
import Link from "next/link";
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

interface StreamResponse {
  stream: StreamData;
  provider?: string;
  sourceName?: string;
  headers?: Record<string, string>;
  fallbackReason?: string | null;
}

export function VideoPlayer({
  animeId,
  episode,
  animeTitle,
  posterUrl,
  onProgress,
}: VideoPlayerProps) {
  const [stream, setStream] = useState<StreamData | null>(null);
  const [headers, setHeaders] = useState<Record<string, string> | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");

  const stableOnProgress = useCallback(
    (t: number, d: number) => onProgress?.(t, d),
    [onProgress],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStream(null);
    setHeaders(undefined);
    setProvider("");

    const titleParam = animeTitle ? `&title=${encodeURIComponent(animeTitle)}` : "";
    fetch(`/api/stream/${animeId}/${episode}?${titleParam}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Backend returned ${res.status}`);
        }
        return res.json() as Promise<StreamResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        const s = json?.stream;
        if (s && s.url) {
          setStream({
            url: s.url,
            type: s.type,
            quality: s.quality ?? null,
          });
          setHeaders(json.headers);
          setProvider(json.provider ?? json.sourceName ?? "");
          setLoading(false);
        } else {
          throw new Error("No stream URL in response");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load stream");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId, episode, animeTitle]);

  // ─── Error state ───
  if (error) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center text-center p-6 border border-xan-border">
        <AlertCircle className="h-10 w-10 text-xan-crimson mb-3" />
        <p className="text-foreground font-medium">Stream Unavailable</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
        <Button asChild variant="secondary" size="sm" className="mt-4">
          <Link href="/settings">
            <Settings className="h-4 w-4 mr-1.5" />
            Go to Settings
          </Link>
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
        <p className="text-xs text-muted-foreground/60 mt-1">
          Fetching stream sources from AllAnime…
        </p>
      </div>
    );
  }

  // ─── Play ───
  return (
    <div className="space-y-2">
      <StreamPlayer
        streamUrl={stream.url}
        streamType={stream.type}
        title={`${animeTitle} — Episode ${episode}`}
        posterUrl={posterUrl}
        onProgress={stableOnProgress}
        headers={headers}
        provider={provider}
      />
    </div>
  );
}
