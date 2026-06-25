"use client";

// components/anime/EpisodeGrid.tsx
//
// ✅ Episode unreleased grayout: uses AniList's `nextAiringEpisode` to determine
//    which episodes haven't aired yet. Unreleased episodes are shown in grayscale,
//    non-clickable, with a small "Upcoming" badge and tooltip showing when they air.
//
// ✅ AllAnime fallback: when AniList's `episodeCount` is null (unknown), fetches
//    AllAnime's `availableEpisodes.sub` count via /api/allanime to get the real
//    episode count. This fixes the "Episode count unknown — showing first 12 by
//    default" issue.

import Link from "next/link";
import { useState, useEffect } from "react";
import { Play, Search, Clock, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { NextAiringEpisode } from "@/types/anime";

interface EpisodeGridProps {
  animeId: number;
  animeTitle: string;
  episodeCount: number | null;
  /** AniList's nextAiringEpisode — used to determine which episodes haven't aired yet. */
  nextAiringEpisode?: NextAiringEpisode | null;
}

const MAX_RENDERED = 200;

/**
 * Returns the highest episode number that has already aired.
 * - If `nextAiringEpisode` is null/undefined (no upcoming airing), all episodes
 *   have aired → return Infinity (no grayout).
 * - Otherwise, the next episode to air is `nextAiringEpisode.episode`, so the
 *   latest aired episode is `nextAiringEpisode.episode - 1`.
 */
function getLatestAiredEpisode(next?: NextAiringEpisode | null): number {
  if (!next || typeof next.episode !== "number") return Infinity;
  return next.episode - 1;
}

/**
 * Format the airing timestamp as a human-readable countdown/date.
 */
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

export function EpisodeGrid({
  animeId,
  animeTitle,
  episodeCount,
  nextAiringEpisode,
}: EpisodeGridProps) {
  const [query, setQuery] = useState("");
  // AllAnime fallback episode count — fetched when AniList's episodeCount is null
  const [allAnimeCount, setAllAnimeCount] = useState<number | null>(null);
  const [fetchingAllAnime, setFetchingAllAnime] = useState(false);

  // ✅ When AniList's episode count is unknown, fetch AllAnime's availableEpisodes.sub
  // to get the real count. This fixes the "Episode count unknown — showing first 12"
  // issue by using AllAnime's cross-reference data.
  useEffect(() => {
    if (episodeCount != null) return; // AniList has the count, no need to fetch
    if (!animeTitle.trim()) return;

    let cancelled = false;
    setFetchingAllAnime(true);

    fetch(`/api/allanime?q=${encodeURIComponent(animeTitle)}&limit=5`)
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json();
        return json;
      })
      .then((json) => {
        if (cancelled || !json) return;
        const edges = json?.edges ?? [];
        // Find the show matching this AniList ID
        const match = edges.find(
          (e: { aniListId?: string | null }) =>
            e.aniListId === String(animeId),
        );
        // If no exact match, use the first result (fuzzy match)
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
      .catch(() => {
        // silently ignore — we'll fall back to 12
      })
      .finally(() => {
        if (!cancelled) setFetchingAllAnime(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId, animeTitle, episodeCount]);

  // Effective episode count: AniList → AllAnime → 12 default
  const isUnknown = episodeCount == null && allAnimeCount == null;
  const effectiveCount = episodeCount ?? allAnimeCount ?? 12;
  const usingAllAnimeFallback = episodeCount == null && allAnimeCount != null;

  const total = effectiveCount;
  const cappedTotal = Math.min(total, MAX_RENDERED);
  const isCapped = total > MAX_RENDERED;
  const episodes = Array.from({ length: cappedTotal }, (_, i) => i + 1);

  const latestAired = getLatestAiredEpisode(nextAiringEpisode);
  const hasUpcoming = nextAiringEpisode != null;

  const filtered = query
    ? episodes.filter((n) => String(n).includes(query.trim()))
    : episodes;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold font-display text-foreground">Episodes</h2>
        <div className="relative w-32 sm:w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Find..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 text-sm bg-xan-card border-xan-border"
          />
        </div>
      </div>

      {/* Status messages */}
      {fetchingAllAnime && (
        <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking AllAnime for episode count…
        </p>
      )}
      {isUnknown && !fetchingAllAnime && (
        <p className="text-xs text-muted-foreground italic">
          Episode count unknown — showing first 12 by default.
        </p>
      )}
      {usingAllAnimeFallback && !fetchingAllAnime && (
        <p className="text-xs text-emerald-500/80 italic">
          Showing {total} episodes (via AllAnime cross-reference).
        </p>
      )}
      {!isUnknown && !usingAllAnimeFallback && episodeCount === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No episodes available for this anime yet.
        </p>
      )}
      {isCapped && (
        <p className="text-xs text-muted-foreground italic">
          Showing first {MAX_RENDERED} of {total} episodes. Use search to find specific episodes.
        </p>
      )}
      {hasUpcoming && (
        <p className="text-xs text-muted-foreground/80 italic flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          Episodes{" "}
          <span className="text-foreground/70 font-medium">
            {nextAiringEpisode!.episode}–{total}
          </span>{" "}
          haven&apos;t aired yet — shown in grayscale.
        </p>
      )}

      <ScrollArea className="h-72 rounded-lg border border-xan-border bg-xan-card/50">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-3">
          {filtered.length > 0 ? (
            filtered.map((n) => {
              const isReleased = n <= latestAired;
              const isNext = hasUpcoming && n === nextAiringEpisode!.episode;
              const airingHint =
                isNext && nextAiringEpisode
                  ? formatAiringTime(nextAiringEpisode.airingAt)
                  : isReleased
                    ? undefined
                    : "Not yet aired";

              if (!isReleased) {
                // Unreleased episode: grayscale, no link, show "Upcoming" badge
                return (
                  <div
                    key={n}
                    title={airingHint}
                    className="flex items-center justify-start h-auto py-2 px-3 bg-xan-card/30 border border-xan-border/50 text-left cursor-not-allowed opacity-50 grayscale select-none"
                  >
                    <Clock className="h-3 w-3 text-muted-foreground mr-2 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground line-through decoration-muted-foreground/40">
                      Episode {n}
                    </span>
                    {isNext && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-xan-crimson/15 text-xan-crimson border border-xan-crimson/30 font-mono">
                        SOON
                      </span>
                    )}
                  </div>
                );
              }

              // Released episode: clickable link with play button
              return (
                <Button
                  key={n}
                  variant="ghost"
                  asChild
                  className="justify-start h-auto py-2 px-3 bg-xan-card hover:bg-xan-card-hover border border-xan-border hover:border-xan-crimson/40 text-left"
                >
                  <Link href={`/watch/${animeId}?ep=${n}`}>
                    <Play className="h-3 w-3 text-xan-crimson mr-2 flex-shrink-0" />
                    <span className="text-sm text-foreground">Episode {n}</span>
                  </Link>
                </Button>
              );
            })
          ) : (
            <p className="col-span-full text-sm text-muted-foreground text-center py-6">
              No episodes found.
            </p>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
