"use client";

// components/anime/EpisodeGrid.tsx
// ✅ "use client" — selection state

import Link from "next/link";
import { useState } from "react";
import { Play, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface EpisodeGridProps {
  animeId: number;
  episodeCount: number | null;
}

export function EpisodeGrid({ animeId, episodeCount }: EpisodeGridProps) {
  const [query, setQuery] = useState("");

  const total = episodeCount ?? 12; // fallback if unknown
  const episodes = Array.from({ length: total }, (_, i) => i + 1);

  const filtered = query
    ? episodes.filter((n) => String(n).includes(query.trim()))
    : episodes;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold font-display text-foreground">
          Episodes
        </h2>
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

      {episodeCount == null && (
        <p className="text-xs text-muted-foreground italic">
          Episode count unknown — showing first 12 by default.
        </p>
      )}

      <ScrollArea className="h-72 rounded-lg border border-xan-border bg-xan-card/50">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-3">
          {filtered.length > 0 ? (
            filtered.map((n) => (
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
            ))
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
