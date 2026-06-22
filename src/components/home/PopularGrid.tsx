// components/home/PopularGrid.tsx
// Server Component — static grid

import { AnimeCard } from "@/components/cards/AnimeCard";
import type { Anime, PageInfo } from "@/types/anime";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface PopularGridProps {
  anime: Anime[];
  pageInfo?: PageInfo;
}

export function PopularGrid({ anime }: PopularGridProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold font-display text-foreground">
            Popular Anime
          </h2>
          <p className="text-xs text-muted-foreground">
            All-time most-watched titles
          </p>
        </div>
        <Link
          href="/search"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {anime.map((item, idx) => (
          <AnimeCard key={item.id} anime={item} index={idx} />
        ))}
      </div>
    </section>
  );
}
