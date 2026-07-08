// components/anime/AnimeHero.tsx
// Server Component

import Image from "next/image";
import Link from "next/link";
import { Play, Star, Clock, Calendar, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimeStatusButton } from "@/components/anime/AnimeStatusButton";
import { BookmarkButton } from "@/components/cards/BookmarkButton";
import {
  getTitle,
  sanitizeDescription,
  formatScore,
  formatEpisodes,
  formatSeason,
  formatStatus,
  type AnimeDetail,
} from "@/types/anime";

interface AnimeHeroProps {
  anime: AnimeDetail;
}

export function AnimeHero({ anime }: AnimeHeroProps) {
  const title = getTitle(anime.title);
  const description = sanitizeDescription(anime.description);
  const banner = anime.bannerImage || anime.coverImage?.large || "/placeholder-card.png";
  const cover = anime.coverImage?.large || "/placeholder-card.png";

  return (
    <section className="relative">
      {/* Banner */}
      <div className="relative h-[40vh] md:h-[50vh] w-full overflow-hidden">
        <Image
          src={banner}
          alt={title}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent" />
      </div>

      {/* Content overlay */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-24 md:-mt-32 lg:-mt-48 relative z-10">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Cover */}
          <div className="flex-shrink-0 mx-auto md:mx-0">
            <div className="relative w-36 h-52 sm:w-40 sm:h-60 md:w-44 md:h-64 lg:w-48 lg:h-72 rounded-xl overflow-hidden border-2 border-xan-border shadow-2xl">
              <Image
                src={cover}
                alt={title}
                fill
                sizes="(max-width: 768px) 160px, 192px"
                className="object-cover"
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 space-y-3 md:pt-12 lg:pt-32 text-center md:text-left">
            <h1 className="text-2xl md:text-4xl font-display font-extrabold text-foreground leading-tight">
              {title}
            </h1>

            {anime.title.english && anime.title.romaji && anime.title.english !== anime.title.romaji && (
              <p className="text-sm text-muted-foreground italic">
                {anime.title.romaji}
              </p>
            )}

            {/* Quick stats */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm">
              {anime.averageScore != null && (
                <div className="flex items-center gap-1.5 text-foreground">
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  <span className="font-semibold">{formatScore(anime.averageScore)}</span>
                </div>
              )}
              {anime.episodes != null && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{formatEpisodes(anime.episodes)}</span>
                </div>
              )}
              {(anime.season || anime.seasonYear) && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{formatSeason(anime.season, anime.seasonYear)}</span>
                </div>
              )}
              {anime.format && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Tv className="h-4 w-4" />
                  <span>{anime.format}</span>
                </div>
              )}
            </div>

            {/* Genres */}
            {anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                {anime.genres.map((genre) => (
                  <Badge
                    key={genre}
                    variant="secondary"
                    className="bg-xan-card text-muted-foreground border-xan-border text-xs"
                  >
                    {genre}
                  </Badge>
                ))}
              </div>
            )}

            {/* Description */}
            {description && (
              <p className="text-sm md:text-base text-muted-foreground line-clamp-4 max-w-3xl mx-auto md:mx-0">
                {description}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 justify-center md:justify-start pt-2 flex-wrap">
              <Button
                asChild
                className="bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0"
              >
                <Link href={`/watch/${anime.id}`}>
                  <Play className="h-4 w-4 fill-white mr-1.5" />
                  Watch Now
                </Link>
              </Button>
              <AnimeStatusButton
                animeId={anime.id}
                title={title}
                coverImage={cover}
                episodes={anime.episodes}
                airingStatus={anime.status}
              />
              <BookmarkButton
                animeId={anime.id}
                title={title}
                coverImage={cover}
              />
              <Badge variant="outline" className="border-xan-border text-muted-foreground">
                {formatStatus(anime.status)}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
