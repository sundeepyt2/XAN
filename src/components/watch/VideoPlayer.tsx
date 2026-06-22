"use client";

// components/watch/VideoPlayer.tsx
// ✅ Tries THREE approaches in order:
//   1. Client-side fetch from AllAnime (browser uses its own cf_clearance cookie)
//   2. Server-side stream proxy (uses stored cookie — works only if IPs match)
//   3. Error with link to /settings

import { useState, useEffect, useCallback } from "react";
import { StreamPlayer } from "./StreamPlayer";
import { AlertCircle, Loader2, Settings, ExternalLink } from "lucide-react";
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

// Known AllAnime ID for testing — in production this would come from the
// AllAnime cross-reference on the detail page.
// For now we use the search-by-title approach via the server proxy.
const ALLANIME_EPISODES_URL = "https://api.allanime.day/episodes";

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
  const [usedClientFetch, setUsedClientFetch] = useState(false);

  const stableOnProgress = useCallback(
    (t: number, d: number) => onProgress?.(t, d),
    [onProgress],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStream(null);
    setUsedClientFetch(false);

    // ─── Step 1: Try server-side proxy first (uses stored cookie) ───
    const titleParam = animeTitle ? `&title=${encodeURIComponent(animeTitle)}` : "";
    fetch(`/api/stream/${animeId}/${episode}?${titleParam}`)
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
        // Check if we got a real stream (not the demo fallback)
        const isDemo = json?.fallbackReason;
        if (s && s.url && !isDemo) {
          setStream({
            url: s.url,
            type: s.type,
            quality: s.quality ?? null,
          });
          setLoading(false);
        } else if (s && s.url && isDemo) {
          // Server returned demo stream — try client-side fetch as a better option
          throw new Error("DEMO_FALLBACK");
        } else {
          throw new Error("Backend returned an invalid stream response");
        }
      })
      .catch(async (err) => {
        if (cancelled) return;
        // ─── Step 2: Try client-side fetch from AllAnime ───
        // The browser has the cf_clearance cookie for api.allanime.day,
        // so it can fetch directly. This bypasses the server's IP entirely.
        if (err.message === "DEMO_FALLBACK" || err.message.includes("fetch")) {
          try {
            const clientStream = await tryClientSideFetch(animeId, episode, animeTitle);
            if (cancelled) return;
            if (clientStream) {
              setUsedClientFetch(true);
              setStream(clientStream);
              setLoading(false);
              return;
            }
          } catch {
            // Client-side fetch also failed — fall through to demo
          }
        }
        // ─── Step 3: Use the demo stream as last resort ───
        // Re-fetch the server proxy which will return the demo stream
        try {
          const demoRes = await fetch(`/api/stream/${animeId}/${episode}?${titleParam}&allowDemo=true`);
          const demoJson = await demoRes.json();
          if (cancelled) return;
          if (demoJson?.stream?.url) {
            setStream({
              url: demoJson.stream.url,
              type: demoJson.stream.type,
              quality: demoJson.stream.quality ?? null,
            });
            setLoading(false);
          } else {
            setError("Could not load any stream. Visit /settings to verify AllAnime.");
            setLoading(false);
          }
        } catch {
          if (cancelled) return;
          setError("Failed to load stream");
          setLoading(false);
        }
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
            Verify AllAnime
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
      />
      {usedClientFetch && (
        <p className="text-xs text-emerald-500 flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          Stream loaded via your browser&apos;s AllAnime cookie
        </p>
      )}
    </div>
  );
}

// ─── Client-side AllAnime fetch ───
// The browser fetches /episodes directly from api.allanime.day.
// The browser's cf_clearance cookie is sent automatically (same-origin for the cookie domain).
// Note: This may fail with CORS — AllAnime may not allow cross-origin requests.
async function tryClientSideFetch(
  animeId: number,
  episode: number,
  animeTitle: string,
): Promise<StreamData | null> {
  try {
    // First, find the AllAnime show ID by searching GraphQL (server-side, no CF)
    const searchRes = await fetch(`/api/allanime?q=${encodeURIComponent(animeTitle)}&limit=1`);
    if (!searchRes.ok) return null;
    const searchJson = await searchRes.json();
    const show = searchJson?.edges?.[0];
    if (!show?._id) return null;

    // Now fetch /episodes directly from the browser
    const episodesUrl = `${ALLANIME_EPISODES_URL}?id=${encodeURIComponent(show._id)}&episode=${episode}&type=sub`;
    const res = await fetch(episodesUrl, {
      credentials: "include", // Send cf_clearance cookie
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`[client-fetch] AllAnime /episodes returned ${res.status}`);
      return null;
    }

    const json = await res.json();
    const source = json?.sources?.[0];
    if (!source?.url) {
      console.warn("[client-fetch] No sources in AllAnime response");
      return null;
    }

    return {
      url: source.url,
      type: source.url.includes(".m3u8") ? "hls" : "mp4",
      quality: source.quality ?? null,
    };
  } catch (err) {
    console.warn("[client-fetch] Failed:", err);
    return null;
  }
}
