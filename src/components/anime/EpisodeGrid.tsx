"use client";

// components/anime/EpisodeGrid.tsx
//
// ✅ Episode unreleased grayout: uses AniList's `nextAiringEpisode` to determine
//    which episodes haven't aired yet. Unreleased episodes are shown in grayscale,
//    non-clickable, with a small "Upcoming" badge and tooltip showing when they air.
//
// ✅ AllAnime fallback: when AniList's `episodeCount` is null (unknown), uses
//    the shared useAllAnimeInfo hook to get AllAnime's availableEpisodes count.
//    Deduped with the watch page's AllAnime lookup.
//
// ✅ Windowed pagination (replaces the old 200-episode cap). Renders a fixed
//    PAGE_SIZE slice at a time with Prev/Next + "Jump to episode" input.
//    Supports 1100+ episode shows (One Piece, Detective Conan, etc.).

import Link from "next/link";
import { useState, useMemo } from "react";
import { Search, Clock, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAllAnimeInfo } from "@/hooks/useAllAnimeInfo";
import type { NextAiringEpisode } from "@/types/anime";

interface EpisodeGridProps {
  animeId: number;
  animeTitle: string;
  episodeCount: number | null;
  /** AniList's nextAiringEpisode — used to determine which episodes haven't aired yet. */
  nextAiringEpisode?: NextAiringEpisode | null;
}

const PAGE_SIZE = 100;

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

export function EpisodeGrid({
  animeId,
  animeTitle,
  episodeCount,
  nextAiringEpisode,
}: EpisodeGridProps) {
  const [query, setQuery] = useState("");
  const [pageStart, setPageStart] = useState(1); // 1-indexed, inclusive
  const [jumpValue, setJumpValue] = useState("");

  // ✅ Only fetch from AllAnime when AniList's episode count is unknown.
  const needsAllAnime = episodeCount == null && animeTitle.trim().length > 0;
  const { data: allAnimeData, isLoading: fetchingAllAnime } = useAllAnimeInfo(
    animeId,
    animeTitle,
    needsAllAnime,
  );
  const allAnimeCount = allAnimeData?.episodeCount ?? null;

  const isUnknown = episodeCount == null && allAnimeCount == null;
  const effectiveCount = episodeCount ?? allAnimeCount ?? 12;
  const usingAllAnimeFallback = episodeCount == null && allAnimeCount != null;

  const total = effectiveCount;
  const latestAired = getLatestAiredEpisode(nextAiringEpisode);
  const hasUpcoming = nextAiringEpisode != null;

  // Search mode: when query is set, search across ALL episodes (not just current page)
  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim();
    const matches: number[] = [];
    for (let n = 1; n <= total; n++) {
      if (String(n).includes(q)) matches.push(n);
    }
    return matches;
  }, [query, total]);

  // Paged mode: slice [pageStart, pageStart + PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor((pageStart - 1) / PAGE_SIZE) + 1;
  const pageEnd = Math.min(pageStart + PAGE_SIZE - 1, total);
  const pagedEpisodes = useMemo(() => {
    if (searchResults) return [];
    const arr: number[] = [];
    for (let n = pageStart; n <= pageEnd; n++) arr.push(n);
    return arr;
  }, [pageStart, pageEnd, searchResults]);

  const displayEpisodes = searchResults ?? pagedEpisodes;

  const handleJump = () => {
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n) && n >= 1 && n <= total) {
      // Jump to the page containing episode n
      const targetPageStart = Math.floor((n - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
      setPageStart(targetPageStart);
      setQuery("");
      setJumpValue("");
    }
  };

  const goToPrevPage = () => {
    setPageStart((s) => Math.max(1, s - PAGE_SIZE));
  };
  const goToNextPage = () => {
    setPageStart((s) => Math.min(total - PAGE_SIZE + 1, s + PAGE_SIZE));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold font-display text-foreground">Episodes</h2>
        <div className="flex items-center gap-2">
          {/* Jump to episode */}
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
          Episode count unknown — showing first {PAGE_SIZE} by default.
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

      {/* Search results OR paged grid */}
      {searchResults ? (
        <p className="text-xs text-muted-foreground italic">
          {searchResults.length} match{searchResults.length !== 1 ? "es" : ""} for &ldquo;{query}&rdquo;
        </p>
      ) : total > PAGE_SIZE ? (
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Episodes <span className="text-foreground/70 font-medium">{pageStart}–{pageEnd}</span> of {total}
          </p>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage === 1}
              className="h-7 px-2 text-xs bg-xan-card border-xan-border disabled:opacity-40"
            >
              <ChevronLeft className="h-3 w-3 mr-0.5" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground px-1">
              {currentPage}/{totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="h-7 px-2 text-xs bg-xan-card border-xan-border disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
          {/* Jump to episode */}
          <div className="flex items-center gap-1 ml-2">
            <Input
              type="number"
              min={1}
              max={total}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJump()}
              placeholder="Jump to…"
              className="w-20 h-7 text-xs bg-xan-card border-xan-border"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleJump}
              disabled={!jumpValue}
              className="h-7 px-2 text-xs bg-xan-card border-xan-border disabled:opacity-40"
            >
              Go
            </Button>
          </div>
        </div>
      ) : null}

      {/* Episode grid (windowed) — compact numbered squares */}
      <div className="h-72 overflow-y-auto rounded-lg border border-xan-border bg-xan-card/50 xan-scroll">
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 p-3">
          {displayEpisodes.length > 0 ? (
            displayEpisodes.map((n) => {
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
                    className="flex items-center justify-center aspect-square rounded-lg bg-xan-card/30 border border-xan-border/50 cursor-not-allowed opacity-40 grayscale select-none text-sm font-mono text-muted-foreground"
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
                  href={`/watch/${animeId}?ep=${n}`}
                  className="relative flex items-center justify-center aspect-square rounded-lg bg-xan-card hover:bg-xan-crimson/15 border border-xan-border hover:border-xan-crimson/50 transition-all text-sm font-mono font-semibold text-foreground hover:text-xan-crimson"
                >
                  {n}
                </Link>
              );
            })
          ) : (
            <p className="col-span-full text-sm text-muted-foreground text-center py-6">
              {query ? `No episodes matching "${query}".` : "No episodes found."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
