"use client";

// app/(app)/history/page.tsx
// ✅ "use client" — reads localStorage

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import {
  History as HistoryIcon,
  Trash2,
  Play,
  Clock,
} from "lucide-react";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function HistoryPage() {
  const { history, isLoaded, removeEntry, clearHistory } = useWatchHistory();

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <HistoryIcon className="h-6 w-6 text-xan-crimson" />
            Watch History
          </h1>
          <p className="text-sm text-muted-foreground">
            Your recently watched episodes. Stored locally in your browser.
          </p>
        </div>

        {history.length > 0 && (
          <Button
            variant="secondary"
            onClick={clearHistory}
            className="bg-xan-card border-xan-border hover:bg-xan-card-hover text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Clear All
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {!isLoaded ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full bg-xan-card rounded-xl" />
          ))}
        </div>
      ) : history.length === 0 ? (
        /* Empty state */
        <div className="rounded-xl border border-xan-border bg-xan-card/50 py-16 text-center">
          <HistoryIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-1">
            No history yet
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Start watching anime to build your history. Your progress will be
            saved here for quick access.
          </p>
          <Button asChild className="bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0">
            <Link href="/home">Browse Anime</Link>
          </Button>
        </div>
      ) : (
        /* History list */
        <div className="space-y-3">
          {history.map((entry, idx) => (
            <motion.div
              key={`${entry.animeId}-${entry.episodeId}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.3) }}
              className="group relative"
            >
              <Link
                href={`/watch/${entry.animeId}?ep=${entry.episodeNumber}`}
                className="block"
              >
                <div className="flex items-center gap-3 p-3 rounded-xl border border-xan-border bg-xan-card hover:bg-xan-card-hover hover:border-xan-crimson/30 transition-all">
                  {/* Thumbnail */}
                  <div className="relative w-32 sm:w-40 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-xan-card-hover">
                    <Image
                      src={entry.coverImage || "/placeholder-card.png"}
                      alt={entry.title}
                      fill
                      sizes="(max-width: 640px) 128px, 160px"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-9 h-9 rounded-full bg-xan-crimson/90 flex items-center justify-center">
                        <Play className="h-4 w-4 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                      <div
                        className="h-full bg-xan-crimson"
                        style={{
                          width: `${formatProgress(entry.timestamp, entry.duration)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm md:text-base font-medium text-foreground line-clamp-1">
                      {entry.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      Episode {entry.episodeNumber}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Watched {formatTimeAgo(entry.updatedAt)}
                    </p>
                  </div>

                  {/* Remove */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeEntry(entry.animeId);
                    }}
                    className="flex-shrink-0 text-muted-foreground hover:text-xan-crimson hover:bg-transparent"
                    aria-label="Remove from history"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
