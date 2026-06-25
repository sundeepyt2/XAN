"use client";

// app/(app)/watch/[id]/page.tsx
import { use, useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchAnimeDetail } from "@/lib/anilist";
import {
  getTitle,
  sanitizeDescription,
  formatEpisodes,
  formatScore,
  type AnimeDetail,
} from "@/types/anime";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { EpisodePanel } from "@/components/watch/EpisodePanel";
import { VerificationBadge } from "@/components/watch/VerificationBadge";
import { AutoPlayOverlay } from "@/components/watch/AutoPlayOverlay";
import { SimilarAnime } from "@/components/watch/SimilarAnime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { ArrowLeft, Star, Clock, Calendar, Tv, Info } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function WatchPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-4">
          <Skeleton className="w-full aspect-video rounded-lg bg-xan-card" />
          <Skeleton className="h-8 w-2/3 bg-xan-card" />
          <Skeleton className="h-4 w-1/2 bg-xan-card" />
        </div>
      }
    >
      <WatchPageInner params={params} />
    </Suspense>
  );
}

function WatchPageInner({ params }: PageProps) {
  const { id } = use(params);
  const animeId = parseInt(id, 10);
  const searchParams = useSearchParams();
  const router = useRouter();
  const episodeParam = searchParams.get("ep");
  const currentEpisode = episodeParam ? parseInt(episodeParam, 10) : 1;

  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAutoPlay, setShowAutoPlay] = useState(false);
  const { history, addEntry } = useWatchHistory();

  const savedEntry = useMemo(
    () =>
      history.find(
        (e) => e.animeId === animeId && e.episodeNumber === currentEpisode,
      ),
    [history, animeId, currentEpisode],
  );

  const autoResumeTime = savedEntry?.timestamp && savedEntry.timestamp > 5
    ? savedEntry.timestamp
    : undefined;

  useEffect(() => {
    if (isNaN(animeId)) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchAnimeDetail(animeId)
      .then((result) => {
        if (cancelled) return;
        if (result?.data) {
          setAnime(result.data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId]);

  const handleProgress = useCallback(
    (timestamp: number, duration: number) => {
      if (!anime) return;
      addEntry({
        animeId: anime.id,
        episodeId: String(currentEpisode),
        episodeNumber: currentEpisode,
        timestamp,
        duration: duration > 0 ? duration : 24 * 60,
        title: getTitle(anime.title),
        coverImage: anime.coverImage?.large ?? "/placeholder-card.png",
        genres: anime.genres ?? [],
        updatedAt: Date.now(),
      });
    },
    [anime, currentEpisode, addEntry],
  );

  const handleEpisodeEnd = useCallback(() => {
    setShowAutoPlay(true);
  }, []);

  const handlePlayNext = useCallback(() => {
    if (!anime) return;
    const total = anime.episodes ?? 12;
    const nextEp = currentEpisode < total ? currentEpisode + 1 : null;
    if (nextEp) {
      setShowAutoPlay(false);
      router.push(`/watch/${anime.id}?ep=${nextEp}`);
    } else {
      setShowAutoPlay(false);
    }
  }, [anime, currentEpisode, router]);

  useEffect(() => {
    if (!anime) return;
    addEntry({
      animeId: anime.id,
      episodeId: String(currentEpisode),
      episodeNumber: currentEpisode,
      timestamp: 0,
      duration: 24 * 60,
      title: getTitle(anime.title),
      coverImage: anime.coverImage?.large ?? "/placeholder-card.png",
      genres: anime.genres ?? [],
      updatedAt: Date.now(),
    });
  }, [anime, currentEpisode, addEntry]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-4">
        <Skeleton className="w-full aspect-video rounded-lg bg-xan-card" />
        <Skeleton className="h-8 w-2/3 bg-xan-card" />
        <Skeleton className="h-4 w-1/2 bg-xan-card" />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12 text-center">
        <Info className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-foreground font-medium">Anime not found</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/home">Back to home</Link>
        </Button>
      </div>
    );
  }

  const title = getTitle(anime.title);
  const description = sanitizeDescription(anime.description);
  const total = anime.episodes ?? 12;
  const prevEp = currentEpisode > 1 ? currentEpisode - 1 : null;
  const nextEp = currentEpisode < total ? currentEpisode + 1 : null;
  const posterUrl = anime.bannerImage || anime.coverImage?.large || undefined;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/anime/${anime.id}`}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to anime
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4 min-w-0">
          <div className="relative">
            <VideoPlayer
              animeId={anime.id}
              episode={currentEpisode}
              animeTitle={title}
              posterUrl={posterUrl}
              autoResumeTime={autoResumeTime}
              skipIntroOffset={85}
              onEpisodeEnd={handleEpisodeEnd}
              onProgress={handleProgress}
            />
            {showAutoPlay && nextEp && (
              <AutoPlayOverlay
                nextEpisodeLabel={`Episode ${nextEp}`}
                animeTitle={title}
                onPlayNext={handlePlayNext}
                onCancel={() => setShowAutoPlay(false)}
              />
            )}
          </div>

          <VerificationBadge />

          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
                  {title}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Episode {currentEpisode} of {total}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!prevEp}
                  asChild={!!prevEp}
                  className="bg-xan-card border-xan-border hover:bg-xan-card-hover disabled:opacity-40"
                >
                  {prevEp ? (
                    <Link href={`/watch/${anime.id}?ep=${prevEp}`}>Previous</Link>
                  ) : (
                    <span>Previous</span>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!nextEp}
                  asChild={!!nextEp}
                  className="bg-xan-card border-xan-border hover:bg-xan-card-hover disabled:opacity-40"
                >
                  {nextEp ? (
                    <Link href={`/watch/${anime.id}?ep=${nextEp}`}>Next</Link>
                  ) : (
                    <span>Next</span>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {anime.averageScore != null && (
                <div className="flex items-center gap-1.5 text-foreground">
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  <span className="font-semibold">{formatScore(anime.averageScore)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{formatEpisodes(anime.episodes)}</span>
              </div>
              {anime.format && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Tv className="h-4 w-4" />
                  <span>{anime.format}</span>
                </div>
              )}
              {anime.seasonYear && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{anime.seasonYear}</span>
                </div>
              )}
            </div>

            {anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {anime.genres.slice(0, 6).map((genre) => (
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

            {description && (
              <div className="rounded-lg border border-xan-border bg-xan-card/50 p-4">
                <h2 className="text-sm font-semibold text-foreground mb-2">
                  About this anime
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                  {description}
                </p>
              </div>
            )}

            <SimilarAnime
              recommendations={anime.recommendations?.nodes ?? []}
              currentAnimeId={anime.id}
              fallbackGenres={anime.genres}
            />
          </div>
        </div>

        <EpisodePanel
          animeId={anime.id}
          animeTitle={title}
          episodeCount={anime.episodes}
          currentEpisode={currentEpisode}
          nextAiringEpisode={anime.nextAiringEpisode}
        />
      </div>
    </div>
  );
}
