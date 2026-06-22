"use client";

// components/watch/EpisodePanel.tsx
// Sidebar list of episodes for the watch page

import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface EpisodePanelProps {
  animeId: number;
  episodeCount: number | null;
  currentEpisode: number;
}

export function EpisodePanel({
  animeId,
  episodeCount,
  currentEpisode,
}: EpisodePanelProps) {
  const total = episodeCount ?? 12;
  const episodes = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <aside className="rounded-xl border border-xan-border bg-xan-card/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-xan-border">
        <h3 className="font-semibold text-sm text-foreground">Episodes</h3>
        <p className="text-xs text-muted-foreground">{total} total</p>
      </div>
      <ScrollArea className="h-[60vh]">
        <div className="divide-y divide-xan-border">
          {episodes.map((n) => {
            const isActive = n === currentEpisode;
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
