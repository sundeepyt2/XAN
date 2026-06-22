"use client";

// components/cards/AnimeCard.tsx
// ✅ "use client" — motion hover animations

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { Star, Play, Clock } from "lucide-react";
import {
  getTitle,
  formatScore,
  formatEpisodes,
  type Anime,
} from "@/types/anime";

interface AnimeCardProps {
  anime: Anime;
  index?: number;
  priority?: boolean;
}

export function AnimeCard({ anime, index = 0, priority = false }: AnimeCardProps) {
  const title = getTitle(anime.title);
  const image =
    anime.coverImage?.large ?? "/placeholder-card.png";
  const score = formatScore(anime.averageScore);
  const episodes = formatEpisodes(anime.episodes);
  const color = anime.coverImage?.color ?? "#e94560";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.03, 0.3),
        ease: [0.25, 0.4, 0.25, 1],
      }}
      className="group relative"
    >
      <Link href={`/anime/${anime.id}`} className="block">
        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-xan-card border border-xan-border transition-all duration-300 group-hover:border-xan-crimson/40 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          {/* Cover image */}
          <Image
            src={image}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority={priority}
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

          {/* Top badges */}
          <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
            {anime.averageScore != null && (
              <div className="flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-semibold text-white">
                <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                {score}
              </div>
            )}
            {anime.format === "MOVIE" && (
              <div className="bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] font-medium text-white/80 uppercase tracking-wider">
                Movie
              </div>
            )}
          </div>

          {/* Hover play button */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-xan-crimson/90 backdrop-blur-sm flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
              <Play className="h-5 w-5 text-white fill-white ml-0.5" />
            </div>
          </div>

          {/* Bottom content */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <h3 className="font-medium text-sm text-white line-clamp-2 leading-snug">
              {title}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-white/60">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {episodes}
              </span>
              {anime.seasonYear && (
                <>
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <span>{anime.seasonYear}</span>
                </>
              )}
            </div>
          </div>

          {/* Color accent line */}
          <div
            className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: color }}
          />
        </div>
      </Link>
    </motion.div>
  );
}
