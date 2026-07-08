"use client";

// components/home/ContinueWatchingSmall.tsx
// ✅ "use client" — reads localStorage via useWatchHistory
// Compact horizontal scroller — one small portrait card per anime
// (groups all watched episodes of the same anime into one entry)

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { History, Play, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWatchHistory, type WatchHistoryEntry } from "@/hooks/useWatchHistory";
import { useAnimeList } from "@/hooks/useAnimeList";

interface GroupedHistoryEntry {
  animeId: number;
  title: string;
  coverImage: string;
  /** All episodes watched for this anime, sorted most-recent-first */
  episodes: WatchHistoryEntry[];
  /** Most-recent episode entry */
  latest: WatchHistoryEntry;
}

function groupByAnime(history: WatchHistoryEntry[]): GroupedHistoryEntry[] {
  const map = new Map<number, GroupedHistoryEntry>();
  for (const entry of history) {
    const existing = map.get(entry.animeId);
    if (existing) {
      existing.episodes.push(entry);
      if (entry.updatedAt > existing.latest.updatedAt) {
        existing.latest = entry;
      }
    } else {
      map.set(entry.animeId, {
        animeId: entry.animeId,
        title: entry.title,
        coverImage: entry.coverImage,
        episodes: [entry],
        latest: entry,
      });
    }
  }
  // Sort groups by latest updatedAt
  return Array.from(map.values()).sort(
    (a, b) => b.latest.updatedAt - a.latest.updatedAt,
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatProgress(timestamp: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (timestamp / duration) * 100));
}

export function ContinueWatchingSmall() {
  const { history, isLoaded } = useWatchHistory();
  const { list, isLoaded: listLoaded } = useAnimeList();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.8, 900);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (!isLoaded) return null;

  // ✅ Filter out completed anime — they shouldn't appear in "Continue Watching"
  // on the home page. The full history is still available on /history page.
  // Anime marked as COMPLETED in the user's list are excluded.
  const completedIds = new Set(
    listLoaded ? list.filter((e) => e.status === "COMPLETED").map((e) => e.animeId) : [],
  );
  const filteredHistory = completedIds.size > 0
    ? history.filter((e) => !completedIds.has(e.animeId))
    : history;

  const grouped = groupByAnime(filteredHistory);
  if (grouped.length === 0) return null;

  const recent = grouped.slice(0, 10);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-xan-card border border-xan-border flex items-center justify-center">
            <History className="h-4 w-4 text-xan-crimson" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold font-display text-foreground">
              Continue Watching
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Pick up where you left off
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("left")}
            aria-label="Scroll left"
            className="rounded-full glass border-xan-border hover:bg-white/10 h-8 w-8 md:h-9 md:w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("right")}
            aria-label="Scroll right"
            className="rounded-full glass border-xan-border hover:bg-white/10 h-8 w-8 md:h-9 md:w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2 mask-fade-r"
      >
        {recent.map((entry, idx) => {
          const progress = formatProgress(
            entry.latest.timestamp,
            entry.latest.duration,
          );
          const epCount = entry.episodes.length;
          return (
            <motion.div
              key={entry.animeId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
              className="flex-shrink-0 w-[140px] sm:w-[150px] snap-start"
            >
              <Link
                href={`/watch/${entry.animeId}?ep=${entry.latest.episodeNumber}`}
                className="group block relative aspect-[2/3] rounded-lg overflow-hidden bg-xan-card border border-xan-border hover:border-xan-crimson/40 transition-colors"
              >
                <Image
                  src={entry.coverImage || "/placeholder-card.png"}
                  alt={entry.title}
                  fill
                  sizes="(max-width: 640px) 140px, 150px"
                  className="object-cover opacity-70 group-hover:opacity-80 transition-opacity"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />

                {/* Episode count badge (top-right) */}
                {epCount > 1 && (
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-black/70 backdrop-blur-sm text-white">
                    {epCount} eps
                  </div>
                )}

                {/* Hover play button */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-9 h-9 rounded-full bg-xan-crimson/95 flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
                    <Play className="h-4 w-4 text-white fill-white ml-0.5" />
                  </div>
                </div>

                {/* Bottom content */}
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-[11px] font-medium text-white line-clamp-1 leading-tight">
                    {entry.title}
                  </p>
                  <p className="text-[9px] text-white/60 mt-0.5">
                    EP {entry.latest.episodeNumber} • {formatTimeAgo(entry.latest.updatedAt)}
                  </p>
                  {/* Mini progress bar */}
                  <div className="mt-1.5 h-0.5 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full bg-xan-crimson"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
