"use client";

// components/watch/EpisodePanel.tsx
// Sidebar list of episodes for the watch page
//
// ✅ Episode unreleased grayout: uses AniList's `nextAiringEpisode` to determine
//    which episodes haven't aired yet. Unreleased episodes are shown in grayscale,
//    non-clickable, with a clock icon + countdown tooltip.
//
// ✅ AllAnime fallback: when AniList's `episodeCount` is null (unknown), fetches
//    AllAnime's `availableEpisodes.sub` count via /api/allanime to get the real
//    episode count.

import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Play, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import type { NextAiringEpisode } from "@/types/anime";

interface EpisodePanelProps {
  animeId: number;
  animeTitle: string;
  episodeCount: number | null;
  currentEpisode: number;
  /** AniList's nextAiringEpisode — used to determine which episodes haven't aired yet. */
  nextAiringEpisode?: NextAiringEpisode | null;
}

const MAX_RENDERED = 200;

function getLatestAiredEpisode(next?: NextAiringEpisode | null): number {
  if (!next || typeof next.episode !== "number") return Infinity;
  return next.episode - 1;
}

function formatAiringTime(airingAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = airingAt - now;
  if (diff <= 0) return "Airing soon";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `Airs in ${days}d ${hours}h`;
  if (hours > 0) return `Airs in ${hours}h ${mins}m`;
  return `Airs in ${mins}m`;
}

export function EpisodePanel({
  animeId,
  animeTitle,
  episodeCount,
  currentEpisode,
  nextAiringEpisode,
}: EpisodePanelProps) {
  const [allAnimeCount, setAllAnimeCount] = useState<number | null>(null);
  const [fetchingAllAnime, setFetchingAllAnime] = useState(false);

  // ✅ When AniList's episode count is unknown, fetch AllAnime's availableEpisodes.sub
  useEffect(() => {
    if (episodeCount != null) return;
    if (!animeTitle.trim()) return;

    let cancelled = false;
    setFetchingAllAnime(true);

    fetch(`/api/allanime?q=${encodeURIComponent(animeTitle)}&limit=5`)
      .then(async (res) => {
        if (!res.ok) return null;
        return await res.json();
      })
      .then((json) => {
        if (cancelled || !json) return;
        const edges = json?.edges ?? [];
        const match = edges.find(
          (e: { aniListId?: string | null }) =>
            e.aniListId === String(animeId),
        );
        const show = match ?? edges[0];
        if (show?.availableEpisodes) {
          const sub = show.availableEpisodes.sub ?? 0;
          const dub = show.availableEpisodes.dub ?? 0;
          const raw = show.availableEpisodes.raw ?? 0;
          const count = Math.max(sub, dub, raw);
          if (count > 0) {
            setAllAnimeCount(count);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetchingAllAnime(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId, animeTitle, episodeCount]);

  const effectiveCount = episodeCount ?? allAnimeCount ?? 12;
  const usingAllAnimeFallback = episodeCount == null && allAnimeCount != null;

  const total = effectiveCount;
  const cappedTotal = Math.min(total, MAX_RENDERED);
  const episodes = Array.from({ length: cappedTotal }, (_, i) => i + 1);

  const latestAired = getLatestAiredEpisode(nextAiringEpisode);
  const hasUpcoming = nextAiringEpisode != null;

  const showCurrentEpisodeHint =
    currentEpisode > cappedTotal && currentEpisode <= total;

  return (
    <aside className="rounded-xl border border-xan-border bg-xan-card/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-xan-border">
        <h3 className="font-semibold text-sm text-foreground">Episodes</h3>
        <p className="text-xs text-muted-foreground">
          {total} total{total > MAX_RENDERED && ` (showing first ${MAX_RENDERED})`}
          {hasUpcoming && (
            <span className="ml-2 text-xan-crimson/80">
              · {total - latestAired} upcoming
            </span>
          )}
          {fetchingAllAnime && (
            <span className="ml-2 flex items-center gap-1 text-muted-foreground/70">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              checking AllAnime
            </span>
          )}
          {usingAllAnimeFallback && !fetchingAllAnime && (
            <span className="ml-2 text-emerald-500/70">· via AllAnime</span>
          )}
        </p>
      </div>
      <ScrollArea className="h-[60vh]">
        <div className="divide-y divide-xan-border">
          {showCurrentEpisodeHint && (
            <Link
              href={`/watch/${animeId}?ep=${currentEpisode}`}
              className="flex items-center gap-3 px-4 py-3 bg-xan-card-hover transition-colors"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border bg-xan-crimson border-xan-crimson text-white">
                <Play className="h-3.5 w-3.5 fill-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Episode {currentEpisode}
                </p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-xan-crimson flex-shrink-0" />
            </Link>
          )}
          {episodes.map((n) => {
            const isActive = n === currentEpisode;
            const isReleased = n <= latestAired;
            const isNext = hasUpcoming && n === nextAiringEpisode!.episode;
            const airingHint =
              isNext && nextAiringEpisode
                ? formatAiringTime(nextAiringEpisode.airingAt)
                : isReleased
                  ? undefined
                  : "Not yet aired";

            // Unreleased episode: grayscale, non-clickable, clock icon
            if (!isReleased) {
              return (
                <div
                  key={n}
                  title={airingHint}
                  className="flex items-center gap-3 px-4 py-3 opacity-50 grayscale cursor-not-allowed select-none"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border bg-xan-card border-xan-border text-muted-foreground">
                    <Clock className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40">
                      Episode {n}
                    </p>
                    {isNext && (
                      <p className="text-[10px] text-xan-crimson font-mono mt-0.5">
                        {airingHint}
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            // Released episode: clickable link
            return (
              <Link
                key={n}
                href={`/watch/${animeId}?ep=${n}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 hover:bg-xan-card-hover transition-colors",
                  isActive && "bg-xan-card-hover",
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border",
                    isActive
                      ? "bg-xan-crimson border-xan-crimson text-white"
                      : "bg-xan-card border-xan-border text-muted-foreground",
                  )}
                >
                  {isActive ? (
                    <Play className="h-3.5 w-3.5 fill-white" />
                  ) : (
                    <span className="text-xs font-medium">{n}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    Episode {n}
                  </p>
                </div>
                {isActive && (
                  <CheckCircle2 className="h-4 w-4 text-xan-crimson flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
