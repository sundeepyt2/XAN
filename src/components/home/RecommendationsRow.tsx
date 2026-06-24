"use client";

// components/home/RecommendationsRow.tsx
// ✅ "Recommended For You" section — analyzes watch history genres.

import { Sparkles, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { AnimeCard } from "@/components/cards/AnimeCard";
import { AnimeCardSkeleton } from "@/components/cards/AnimeCardSkeleton";
import { useRecommendations } from "@/hooks/useRecommendations";
import { Button } from "@/components/ui/button";

export function RecommendationsRow() {
  const { recommendations, isLoading, topGenres, refresh } = useRecommendations();

  // Don't render if user has less than 3 history items (not enough data)
  if (recommendations.length === 0 && !isLoading) {
    return null;
  }

  const genreLabel = topGenres.length > 0 ? topGenres.join(" & ") : "your history";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-display text-foreground">
              Recommended For You
            </h2>
            <p className="text-xs text-muted-foreground">
              Because you like <span className="text-foreground">{genreLabel}</span>
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Refresh recommendations"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }, (_, i) => (
            <AnimeCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-2">
          {recommendations.map((item, idx) => (
            <div
              key={item.id}
              className="flex-shrink-0 w-[150px] sm:w-[160px] md:w-[180px] snap-start"
            >
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 0.4,
                  delay: Math.min(idx * 0.03, 0.3),
                  ease: [0.25, 0.4, 0.25, 1],
                }}
              >
                <AnimeCard anime={item} index={idx} />
              </motion.div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
