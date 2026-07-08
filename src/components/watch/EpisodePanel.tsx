"use client";

// components/watch/EpisodePanel.tsx
// Sidebar list of episodes for the watch page
//
// ✅ Bug fix: replaced Radix ScrollArea with plain overflow-y-auto div.
//    ScrollArea's Viewport was intercepting click events on Link components,
//    making episode sidebar clicks not register.
// ✅ Preserves sub/dub mode (type param) in episode links.
// ✅ Accepts allAnimeEpisodeCount from parent (shared via useAllAnimeInfo hook)
//    so we don't fire a duplicate /api/allanime request per pageview.

import Link from "next/link";
import { CheckCircle2, Play, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NextAiringEpisode } from "@/types/anime";

interface EpisodePanelProps {
  animeId: number;
  animeTitle: string;
  episodeCount: number | null;
  /** Episode count from AllAnime (passed down from parent's shared lookup) */
  allAnimeEpisodeCount?: number | null;
  /** Whether the AllAnime lookup is still loading */
  allAnimeLoading?: boolean;
  currentEpisode: number;
  nextAiringEpisode?: NextAiringEpisode | null;
  /** Current sub/dub mode — used to preserve type param in episode links */
  mode?: "sub" | "dub";
  /** Optional className for the <aside> — e.g. 'self-start' to prevent stretching */
  className?: string;
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
  allAnimeEpisodeCount = null,
  allAnimeLoading = false,
  currentEpisode,
  nextAiringEpisode,
  mode = "sub",
  className,
}: EpisodePanelProps) {
  const fetchingAllAnime = allAnimeLoading && episodeCount == null && allAnimeEpisodeCount == null;

  const effectiveCount = episodeCount ?? allAnimeEpisodeCount ?? 12;
  const usingAllAnimeFallback = episodeCount == null && allAnimeEpisodeCount != null;

  const total = effectiveCount;
  const cappedTotal = Math.min(total, MAX_RENDERED);
  const episodes = Array.from({ length: cappedTotal }, (_, i) => i + 1);

  const latestAired = getLatestAiredEpisode(nextAiringEpisode);
  const hasUpcoming = nextAiringEpisode != null;

  const showCurrentEpisodeHint =
    currentEpisode > cappedTotal && currentEpisode <= total;

  // ✅ Preserve sub/dub mode in episode links
  const typeParam = mode === "dub" ? "&type=dub" : "";

  return (
    <aside className={cn("rounded-xl border border-xan-border bg-xan-card/50 overflow-hidden", className)}>
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
      {/* ✅ Bug fix: use plain overflow-y-auto div instead of Radix ScrollArea.
          ScrollArea's Viewport was intercepting click events on Link components. */}
      <div className="max-h-64 overflow-y-auto xan-scroll p-2">
        <div className="grid grid-cols-5 gap-1.5">
          {showCurrentEpisodeHint && (
            <Link
              href={`/watch/${animeId}?ep=${currentEpisode}${typeParam}`}
              className="relative flex items-center justify-center aspect-square rounded-lg bg-xan-crimson border border-xan-crimson text-white text-xs font-medium transition-all"
            >
              {currentEpisode}
              <CheckCircle2 className="absolute -top-1 -right-1 h-3.5 w-3.5 text-xan-crimson bg-xan-dark rounded-full" />
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

            if (!isReleased) {
              return (
                <div
                  key={n}
                  title={airingHint}
                  className="relative flex items-center justify-center aspect-square rounded-lg bg-xan-card/30 border border-xan-border/50 opacity-40 grayscale cursor-not-allowed select-none text-xs font-medium text-muted-foreground"
                >
                  {n}
                  {isNext && (
                    <span className="absolute -top-1 -right-1 text-[8px] px-1 py-0.5 rounded-full bg-xan-crimson/20 text-xan-crimson border border-xan-crimson/30 font-mono leading-none">
                      SOON
                    </span>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={n}
                href={`/watch/${animeId}?ep=${n}${typeParam}`}
                title={`Episode ${n}`}
                className={cn(
                  "relative flex items-center justify-center aspect-square rounded-lg border transition-all text-xs font-medium",
                  isActive
                    ? "bg-xan-crimson border-xan-crimson text-white"
                    : "bg-xan-card border-xan-border text-foreground hover:bg-xan-crimson/15 hover:border-xan-crimson/50 hover:text-xan-crimson",
                )}
              >
                {n}
                {isActive && (
                  <Play className="absolute top-1 right-1 h-2.5 w-2.5 fill-white text-white" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
