"use client";

// components/home/RecommendationsRow.tsx
// ✅ Horizontal scroller with side scroll buttons (matches other home sections).

import { useRef } from "react";
import { motion } from "motion/react";
import { Sparkles, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useRecommendations } from "@/hooks/useRecommendations";
import { AnimeCard } from "@/components/cards/AnimeCard";
import { AnimeCardSkeleton } from "@/components/cards/AnimeCardSkeleton";
import { Button } from "@/components/ui/button";

export function RecommendationsRow() {
  const { recommendations, topGenres, isLoading, refresh } = useRecommendations();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.8, 900);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (topGenres.length === 0) return null;

  const subtitle =
    topGenres.length > 0
      ? `Because you like ${topGenres.slice(0, 2).join(" & ")}`
      : "Based on your watch history";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-bold font-display text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-xan-violet flex-shrink-0" />
            Recommended For You
          </h2>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("left")}
            aria-label="Scroll left"
            disabled={isLoading || recommendations.length === 0}
            className="rounded-full glass border-xan-border hover:bg-white/10 h-8 w-8 md:h-9 md:w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("right")}
            aria-label="Scroll right"
            disabled={isLoading || recommendations.length === 0}
            className="rounded-full glass border-xan-border hover:bg-white/10 h-8 w-8 md:h-9 md:w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px]">
              <AnimeCardSkeleton />
            </div>
          ))}
        </div>
      ) : recommendations.length > 0 ? (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-4 mask-fade-r"
        >
          {recommendations.map((item, idx) => (
            <div
              key={item.id}
              className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] snap-start"
            >
              <AnimeCard anime={item} index={idx} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-xan-border bg-xan-card/50 py-10 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Watch more anime to get better recommendations.
          </p>
        </div>
      )}
    </motion.section>
  );
}
