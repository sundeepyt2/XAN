"use client";

// components/schedule/ScheduleCard.tsx
import Link from "next/link";
import Image from "next/image";
import { Calendar, Star, Tv } from "lucide-react";
import type { AiringSchedule } from "@/types/anime";
import { getTitle, formatScore } from "@/types/anime";
import { CountdownTimer } from "./CountdownTimer";

interface ScheduleCardProps {
  schedule: AiringSchedule;
  /** When true, renders without outer border/bg (used inside expanded group lists) */
  embedded?: boolean;
}

export function ScheduleCard({ schedule, embedded = false }: ScheduleCardProps) {
  const { media, airingAt, episode } = schedule;

  if (!media) return null;

  const title = getTitle(media.title);
  const cover = media.coverImage?.large ?? "/placeholder-card.png";
  const accentColor = media.coverImage?.color ?? "#e94560";

  const airingDate = new Date(airingAt * 1000);
  const timeStr = airingDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const uniqueGenres = Array.from(new Set(media.genres ?? []));

  return (
    <Link
      href={`/anime/${media.id}`}
      className={
        embedded
          ? "group flex gap-3 p-2.5 hover:bg-xan-card-hover transition-colors"
          : "group flex gap-3 p-3 rounded-lg border border-xan-border bg-xan-card/50 hover:bg-xan-card hover:border-xan-crimson/30 transition-all"
      }
    >
      <div
        className="relative flex-shrink-0 w-12 h-16 rounded overflow-hidden bg-zinc-900"
        style={{ borderLeft: `2px solid ${accentColor}` }}
      >
        <Image
          src={cover}
          alt={title}
          fill
          sizes="48px"
          className="object-cover"
        />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground truncate group-hover:text-xan-crimson transition-colors">
            {title}
          </h4>
          <CountdownTimer airingAt={airingAt} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Tv className="h-3 w-3" />
            Episode {episode}
            {media.episodes ? ` / ${media.episodes}` : ""}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {timeStr}
          </span>
          {media.averageScore != null && (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <Star className="h-3 w-3 fill-amber-400" />
              {formatScore(media.averageScore)}
            </span>
          )}
        </div>

        {uniqueGenres.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {uniqueGenres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-xan-border"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
