"use client";

// components/watch/SimilarAnime.tsx
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { Sparkles, AlertCircle } from "lucide-react";
import { fetchSearch } from "@/lib/anilist";
import { type Recommendation, type Anime } from "@/types/anime";

function getRecTitle(title: { romaji: string | null; english: string | null }): string {
  return title.english ?? title.romaji ?? "Untitled";
}

interface SimilarAnimeProps {
  recommendations: Recommendation[];
  currentAnimeId: number;
  fallbackGenres: string[];
}

interface SimItem {
  id: number;
  title: string;
  cover: string;
  score: number | null;
}

export function SimilarAnime({
  recommendations,
  currentAnimeId,
  fallbackGenres,
}: SimilarAnimeProps) {
  const [fallback, setFallback] = useState<Anime[]>([]);
  const [loadingFallback, setLoadingFallback] = useState(false);

  const recs: SimItem[] = recommendations
    .map((r) => r.mediaRecommendation)
    .filter((m): m is NonNullable<typeof m> => m !== null && m.id !== currentAnimeId)
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      title: getRecTitle(m.title),
      cover: m.coverImage.large,
      score: m.averageScore,
    }));

  useEffect(() => {
    if (recs.length > 0) return;
    if (fallbackGenres.length === 0) return;

    let cancelled = false;
    setLoadingFallback(true);

    const genre = fallbackGenres[0];
    fetchSearch("", 1, 12, [genre], "POPULARITY_DESC")
      .then((result) => {
        if (cancelled || !result) {
          if (!cancelled) setFallback([]);
          return;
        }
        const filtered = result.data.filter((a) => a.id !== currentAnimeId).slice(0, 8);
        setFallback(filtered);
      })
      .catch(() => {
        if (!cancelled) setFallback([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFallback(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentAnimeId, fallbackGenres.join(","), recs.length]);

  const hasContent = recs.length > 0 || fallback.length > 0;
  if (!hasContent && !loadingFallback) return null;

  const items: SimItem[] =
    recs.length > 0
      ? recs
      : fallback.map((a) => ({
          id: a.id,
          title: a.title.english ?? a.title.romaji ?? "Untitled",
          cover: a.coverImage?.large ?? "/placeholder-card.png",
          score: a.averageScore,
        }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border border-xan-border bg-xan-card/50 p-4"
    >
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-xan-violet" />
        You might also like
      </h2>

      {loadingFallback && items.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="aspect-[3/4] rounded-md bg-xan-card animate-pulse" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {items.map((item) => (
            <Link key={item.id} href={`/anime/${item.id}`} className="group space-y-1.5">
              <div className="relative aspect-[3/4] rounded-md overflow-hidden bg-zinc-900 border border-xan-border group-hover:border-xan-crimson/40 transition-colors">
                <Image
                  src={item.cover}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 50vw, 200px"
                  className="object-cover group-hover:scale-105 transition-transform"
                />
              </div>
              <p className="text-xs font-medium text-foreground truncate group-hover:text-xan-crimson transition-colors">
                {item.title}
              </p>
              {item.score != null && (
                <p className="text-[10px] text-muted-foreground">
                  ★ {(item.score / 10).toFixed(1)}/10
                </p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <AlertCircle className="h-4 w-4" />
          No similar anime found.
        </div>
      )}
    </motion.div>
  );
}
