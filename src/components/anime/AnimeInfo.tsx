// components/anime/AnimeInfo.tsx
// Server Component — synopsis, details

import { sanitizeDescription, formatStatus, type AnimeDetail } from "@/types/anime";
import { Separator } from "@/components/ui/separator";

interface AnimeInfoProps {
  anime: AnimeDetail;
}

export function AnimeInfo({ anime }: AnimeInfoProps) {
  const description = sanitizeDescription(anime.description);

  const details: { label: string; value: string | null }[] = [
    { label: "Status", value: formatStatus(anime.status) },
    { label: "Episodes", value: anime.episodes != null ? String(anime.episodes) : null },
    { label: "Format", value: anime.format ?? null },
    { label: "Season", value: anime.season ?? null },
    { label: "Year", value: anime.seasonYear != null ? String(anime.seasonYear) : null },
    { label: "Average Score", value: anime.averageScore != null ? `${anime.averageScore}%` : null },
    { label: "Popularity", value: anime.popularity != null ? `#${anime.popularity}` : null },
    { label: "Trending", value: anime.trending != null ? `#${anime.trending}` : null },
  ].filter((d): d is { label: string; value: string } => d.value !== null);

  // Next airing info
  const nextAiring = anime.nextAiringEpisode;

  return (
    <section className="space-y-6">
      {/* Synopsis */}
      {description && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold font-display text-foreground">
            Synopsis
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {description}
          </p>
        </div>
      )}

      {/* Next airing */}
      {nextAiring && (
        <div className="rounded-lg border border-xan-border bg-xan-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Next Episode
          </h3>
          <p className="text-sm text-muted-foreground">
            Episode {nextAiring.episode} airs in{" "}
            <span className="text-xan-crimson font-medium">
              {Math.floor(nextAiring.timeUntilAiring / 86400)}d{" "}
              {Math.floor((nextAiring.timeUntilAiring % 86400) / 3600)}h
            </span>
          </p>
        </div>
      )}

      <Separator className="bg-xan-border" />

      {/* Details grid */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold font-display text-foreground">
          Information
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="flex items-center justify-between py-1.5 border-b border-xan-border/50"
            >
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className="text-foreground font-medium">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
