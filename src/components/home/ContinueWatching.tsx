"use client";

// components/home/ContinueWatching.tsx
// ✅ "use client" — reads localStorage via useWatchHistory

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { History, X, Play } from "lucide-react";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { useAnimeList } from "@/hooks/useAnimeList";
import { Button } from "@/components/ui/button";

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

export function ContinueWatching() {
  const { history, isLoaded, removeEntry } = useWatchHistory();
  const { list, isLoaded: listLoaded } = useAnimeList();

  // SSR placeholder — same shape as loaded empty state to avoid hydration mismatch
  if (!isLoaded) {
    return null;
  }

  // ✅ Filter out completed anime — they shouldn't appear in "Continue Watching"
  const completedIds = new Set(
    listLoaded ? list.filter((e) => e.status === "COMPLETED").map((e) => e.animeId) : [],
  );
  const filteredHistory = completedIds.size > 0
    ? history.filter((e) => !completedIds.has(e.animeId))
    : history;

  if (filteredHistory.length === 0) {
    return null;
  }

  const recent = filteredHistory.slice(0, 6);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-xan-card border border-xan-border flex items-center justify-center">
            <History className="h-4 w-4 text-xan-crimson" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-display text-foreground">
              Continue Watching
            </h2>
            <p className="text-xs text-muted-foreground">
              Pick up where you left off
            </p>
          </div>
        </div>
        <Link
          href="/history"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recent.map((entry, idx) => (
          <motion.div
            key={`${entry.animeId}-${entry.episodeId}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.05 }}
            className="group relative"
          >
            <Link
              href={`/watch/${entry.animeId}?ep=${entry.episodeNumber}`}
              className="block"
            >
              <div className="relative aspect-video rounded-xl overflow-hidden bg-xan-card border border-xan-border hover:border-xan-crimson/40 transition-colors">
                <Image
                  src={entry.coverImage || "/placeholder-card.png"}
                  alt={entry.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover opacity-60 group-hover:opacity-70 transition-opacity"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 rounded-full bg-xan-crimson/90 flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
                    <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-sm font-medium text-white line-clamp-1">
                    {entry.title}
                  </p>
                  <p className="text-xs text-white/60 mt-0.5">
                    Episode {entry.episodeNumber} • {formatTimeAgo(entry.updatedAt)}
                  </p>

                  {/* Progress bar */}
                  <div className="mt-2 h-1 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full bg-xan-crimson"
                      style={{
                        width: `${formatProgress(entry.timestamp, entry.duration)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeEntry(entry.animeId);
              }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 text-white border-0"
              aria-label="Remove from history"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
