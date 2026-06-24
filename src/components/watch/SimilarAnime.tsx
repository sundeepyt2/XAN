"use client";

// components/watch/SimilarAnime.tsx
// ✅ "You might also like" section on the watch page.
// Uses AniList recommendations data from the anime detail schema.

import Link from "next/link";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import type { Recommendation } from "@/types/anime";

interface SimilarAnimeProps {
  recommendations: Recommendation[];
  currentTitle: string;
}

export function SimilarAnime({ recommendations, currentTitle }: SimilarAnimeProps) {
  // Filter out nulls and take top 8
  const valid = recommendations
    .map((r) => r.mediaRecommendation)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, 8);

  if (valid.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <h2 className="text-lg font-semibold font-display text-foreground">
          You might also like
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Based on viewers who watched {currentTitle}
      </p>

      <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 pb-2">
        {valid.map((rec) => {
          const title = rec.title.english ?? rec.title.romaji ?? "Untitled";
          const image = rec.coverImage.large || "/placeholder-card.png";
          return (
            <Link
              key={rec.id}
              href={`/anime/${rec.id}`}
              className="group space-y-2 flex-shrink-0 w-[140px] snap-start"
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-xan-border group-hover:border-xan-crimson/40 transition-colors">
                <Image
                  src={image}
                  alt={title}
                  fill
                  sizes="(max-width: 768px) 140px, 180px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <p className="text-xs font-medium text-foreground line-clamp-2 group-hover:text-xan-crimson transition-colors">
                {title}
              </p>
              {rec.averageScore != null && (
                <p className="text-[10px] text-muted-foreground">
                  Score: {rec.averageScore}%
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
