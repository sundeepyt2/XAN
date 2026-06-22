"use client";

// components/home/TrendingCarousel.tsx
// ✅ "use client" — horizontal scroll state

import { useRef } from "react";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { AnimeCard } from "@/components/cards/AnimeCard";
import { Button } from "@/components/ui/button";
import type { Anime } from "@/types/anime";

interface TrendingCarouselProps {
  anime: Anime[];
}

export function TrendingCarousel({ anime }: TrendingCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.8, 800);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-xan-crimson to-xan-violet flex items-center justify-center">
            <Flame className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-display text-foreground">
              Trending Now
            </h2>
            <p className="text-xs text-muted-foreground">
              The hottest anime right now
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("left")}
            aria-label="Scroll left"
            className="rounded-full bg-xan-card hover:bg-xan-card-hover border-xan-border"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("right")}
            aria-label="Scroll right"
            className="rounded-full bg-xan-card hover:bg-xan-card-hover border-xan-border"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-2"
      >
        {anime.map((item, idx) => (
          <div
            key={item.id}
            className="flex-shrink-0 w-[150px] sm:w-[160px] md:w-[180px] snap-start"
          >
            <AnimeCard anime={item} index={idx} priority={idx < 5} />
          </div>
        ))}
      </div>
    </section>
  );
}
