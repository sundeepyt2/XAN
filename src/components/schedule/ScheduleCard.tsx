"use client";

// components/schedule/ScheduleCard.tsx
// Individual anime airing card.

import Image from "next/image";
import Link from "next/link";
import { Star, Clock } from "lucide-react";
import { CountdownTimer } from "./CountdownTimer";
import { getTitle, formatScore, type Anime } from "@/types/anime";

interface ScheduleCardProps {
  anime: Anime;
  episode: number;
  airingAt: number; // Unix seconds
}

export function ScheduleCard({ anime, episode, airingAt }: ScheduleCardProps) {
  const title = getTitle(anime.title);
  const cover = anime.coverImage?.large ?? "/placeholder-card.png";
  const score = formatScore(anime.averageScore);
  const color = anime.coverImage?.color ?? "#e94560";

  // Format airing time in user's locale
  const airingDate = new Date(airingAt * 1000);
  const timeStr = airingDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/anime/${anime.id}`}
      className="group flex gap-3 p-3 rounded-xl border border-xan-border bg-xan-card hover:bg-xan-card-hover hover:border-xan-crimson/30 transition-all"
    >
      {/* Cover */}
      <div className="relative w-16 h-24 rounded-lg overflow-hidden flex-shrink-0">
        <Image
          src={cover}
          alt={title}
          fill
          sizes="64px"
          className="object-cover"
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-xan-crimson transition-colors">
            {title}
          </h3>
          <CountdownTimer airingAt={airingAt} />
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeStr}
          </span>
          <span>Episode {episode}</span>
          {anime.averageScore != null && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
              {score}
            </span>
          )}
        </div>

        {/* Genre badges */}
        {anime.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {anime.genres.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-xan-card-hover text-muted-foreground"
              >
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Color accent */}
      <div
        className="w-0.5 self-stretch rounded-full opacity-50"
        style={{ background: color }}
      />
    </Link>
  );
}
