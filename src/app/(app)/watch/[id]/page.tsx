"use client";

// app/(app)/watch/[id]/page.tsx
import { use, useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
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
import { SourceSwitcher } from "@/components/watch/SourceSwitcher";
import { EpisodePanel } from "@/components/watch/EpisodePanel";
import { VerificationBadge } from "@/components/watch/VerificationBadge";
import { AutoPlayOverlay } from "@/components/watch/AutoPlayOverlay";
import { SimilarAnime } from "@/components/watch/SimilarAnime";
import { SubDubToggle, usePreferredMode } from "@/components/watch/SubDubToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { useSettings } from "@/hooks/useSettings";
import { useVideoEnhancer } from "@/hooks/useVideoEnhancer";
import { VideoEnhancerPanel } from "@/components/watch/VideoEnhancerPanel";
import { VideoEnhancerFilters } from "@/components/watch/VideoEnhancerFilters";
import { ArrowLeft, Star, Clock, Calendar, Tv, Info, MonitorPlay, Wand2 } from "lucide-react";

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
  const [dubAvailable, setDubAvailable] = useState(false);
  const [checkingDub, setCheckingDub] = useState(true);
  // ✅ Track whether dub was requested but fell back to sub for this episode
  const [fellBackToSub, setFellBackToSub] = useState(false);

  // ✅ Source switcher state — tracks the available sources, current index,
  // and which sources have failed. The SourceSwitcher panel renders below
  // the player and lets users manually switch sources.
  const [sources, setSources] = useState<
    Array<{
      url: string;
      type: "hls" | "mp4" | "dash" | "iframe";
      quality: string | null;
      headers?: Record<string, string>;
      sourceName?: string;
      provider?: string;
    }>
  >([]);
  const [currentSourceIdx, setCurrentSourceIdx] = useState(0);
  const [failedSourceIdxs, setFailedSourceIdxs] = useState<Set<number>>(new Set());
  // ✅ Index of the most bandwidth-friendly source (for the ⭐ Recommended badge)
  const [recommendedIdx, setRecommendedIdx] = useState(-1);
  // ✅ Ref to expose the manual source-switch function to the VideoPlayer
  const selectSourceRef = useRef<((idx: number) => void) | null>(null);

  // ✅ Read user settings — controls provider priority, source switcher, etc.
  const { settings } = useSettings();

  // ✅ Video Enhancer — state shared with the player (same localStorage key).
  // The wand button lives OUTSIDE the player, next to the Provider dropdown.
  const enhancer = useVideoEnhancer();
  const [showEnhancer, setShowEnhancer] = useState(false);

  // ✅ Compute available providers from the sources list (for the provider dropdown)
  const availableProviders = useMemo(() => {
    const providers = new Map<string, number>(); // providerId → first source index
    sources.forEach((s, idx) => {
      const pid = s.provider ?? "allanime";
      if (!providers.has(pid)) providers.set(pid, idx);
    });
    // Sort by user's provider priority
    const priority = settings.providerPriority;
    return Array.from(providers.entries())
      .map(([id, firstIdx]) => ({
        id,
        firstIdx,
        label: id === "allanime" ? "AllAnime"
          : id === "zen" ? "Zen"
          : id === "koto" ? "Koto"
          : id === "pahe" ? "AnimePahe"
          : id === "gogoanime" ? "Gogoanime"
          : id.charAt(0).toUpperCase() + id.slice(1),
        priority: priority.indexOf(id) === -1 ? 999 : priority.indexOf(id),
      }))
      .sort((a, b) => a.priority - b.priority);
  }, [sources, settings.providerPriority]);

  // ✅ Current provider (from the active source index)
  const currentProvider = useMemo(() => {
    if (currentSourceIdx >= 0 && sources[currentSourceIdx]) {
      return sources[currentSourceIdx].provider ?? "allanime";
    }
    return "";
  }, [currentSourceIdx, sources]);

  // ✅ Handler: switch to a provider's first available source
  const handleProviderSwitch = useCallback((providerId: string) => {
    const provider = availableProviders.find((p) => p.id === providerId);
    if (provider) {
      selectSourceRef.current?.(provider.firstIdx);
    }
  }, [availableProviders]);

  // ✅ Persistent sub/dub preference — stored in localStorage, survives across
  // episodes and sessions. Once you pick DUB, all future episodes use DUB.
  const [preferredMode, setPreferredMode] = usePreferredMode();

  // URL ?type= overrides localStorage (for shareable links)
  const urlMode = searchParams.get("type") === "dub" ? "dub" : null;
  const mode = urlMode ?? preferredMode;
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

  // ✅ Check AllAnime for dub availability when anime loads
  useEffect(() => {
    if (!anime) return;
    let cancelled = false;
    setCheckingDub(true);
    setDubAvailable(false);
    const title = getTitle(anime.title);
    if (!title.trim()) {
      setCheckingDub(false);
      return;
    }

    fetch(`/api/allanime?q=${encodeURIComponent(title)}&limit=5`)
      .then(async (res) => {
        if (!res.ok) return null;
        return await res.json();
      })
      .then((json) => {
        if (cancelled || !json) return;
        const edges = json?.edges ?? [];
        const match = edges.find(
          (e: { aniListId?: string | null }) =>
            e.aniListId === String(animeId),
        );
        const show = match ?? edges[0];
        if (show?.availableEpisodes?.dub && show.availableEpisodes.dub > 0) {
          setDubAvailable(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckingDub(false);
      });

    return () => {
      cancelled = true;
    };
  }, [anime, animeId]);

  // ✅ Reset fallback flag when episode changes OR when user manually changes mode
  useEffect(() => {
    setFellBackToSub(false);
  }, [currentEpisode, mode]);

  // ✅ Mode change handler — persists to localStorage + updates URL
  const handleModeChange = useCallback(
    (newMode: "sub" | "dub") => {
      setPreferredMode(newMode);
      // Also update URL for shareable links
      const params = new URLSearchParams(searchParams.toString());
      if (newMode === "dub") {
        params.set("type", "dub");
      } else {
        params.delete("type");
      }
      router.replace(`/watch/${animeId}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, animeId, setPreferredMode],
  );

  // ✅ Called by VideoPlayer when dub falls back to sub for a specific episode
  const handleFallbackToSub = useCallback(() => {
    setFellBackToSub(true);
  }, []);

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

  // ✅ Memoized callbacks for VideoPlayer — prevents unnecessary re-renders.
  // Previously these were inline arrow functions, which created a new function
  // reference on every render. This caused the VideoPlayer's useEffect that
  // depends on onSourcesLoaded to fire on EVERY render, potentially passing
  // stale data or causing infinite update loops.
  const handleSourcesLoaded = useCallback(
    (s: typeof sources, recIdx: number) => {
      setSources(s);
      setRecommendedIdx(recIdx);
    },
    [],
  );

  const handleSourceChange = useCallback(
    (idx: number, failed: Set<number>) => {
      setCurrentSourceIdx(idx);
      setFailedSourceIdxs(failed);
    },
    [],
  );

  const handlePlayNext = useCallback(() => {
    if (!anime) return;
    const total = anime.episodes ?? 12;
    const nextEp = currentEpisode < total ? currentEpisode + 1 : null;
    if (nextEp) {
      setShowAutoPlay(false);
      // ✅ Preserve mode (sub/dub) when auto-playing next episode
      const typeParam = mode === "dub" ? "&type=dub" : "";
      router.push(`/watch/${anime.id}?ep=${nextEp}${typeParam}`);
    } else {
      setShowAutoPlay(false);
    }
  }, [anime, currentEpisode, router, mode]);

  // ✅ Bug fix: Don't overwrite existing watch progress with timestamp=0.
  // Previously, this fired on every episode change and replaced the saved
  // progress (e.g., 10min) with 0. Now we only create a new entry if no
  // entry exists for this episode yet.
  useEffect(() => {
    if (!anime) return;
    const existing = history.find(
      (e) => e.animeId === anime.id && e.episodeNumber === currentEpisode,
    );
    if (existing) return; // Don't overwrite existing progress
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
  }, [anime, currentEpisode, addEntry, history]);

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
  // ✅ Preserve sub/dub mode in episode navigation links
  const typeParam = mode === "dub" ? "&type=dub" : "";

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
          {/* ✅ External SUB/DUB toggle + Provider switcher — lives above the player */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SubDubToggle
              mode={mode}
              onModeChange={handleModeChange}
              dubAvailable={dubAvailable}
              checkingDub={checkingDub}
              fellBackToSub={fellBackToSub}
            />

            {/* ✅ Provider switcher dropdown + Video Enhancer wand button —
                both live above the player, outside of it. The wand opens a
                standalone enhancer popover (no longer inside the player). */}
            <div className="flex items-center gap-2 flex-wrap">
              {availableProviders.length > 0 && (
                <div className="flex items-center gap-2">
                  <MonitorPlay className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground hidden sm:inline">Provider:</span>
                  <Select
                    value={currentProvider}
                    onValueChange={handleProviderSwitch}
                  >
                    <SelectTrigger className="w-36 bg-xan-card border-xan-border text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProviders.map((p, idx) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground font-mono">{idx + 1}</span>
                            {p.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* ✅ Video Enhancer wand button — opens a standalone popover.
                  Crimson dot shows when enhancer is active. */}
              <div className="relative">
                <button
                  onClick={() => setShowEnhancer((v) => !v)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                    enhancer.active
                      ? "bg-xan-crimson/15 border-xan-crimson/40 text-xan-crimson"
                      : showEnhancer
                        ? "bg-xan-card border-xan-border text-foreground"
                        : "bg-xan-card border-xan-border text-muted-foreground hover:text-foreground hover:bg-xan-card-hover"
                  }`}
                  aria-label="Video Enhancer"
                  title="Video Enhancer (E)"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Enhancer</span>
                  {enhancer.active && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-xan-crimson shadow-[0_0_4px_rgba(233,69,96,0.9)]"
                      aria-hidden="true"
                    />
                  )}
                </button>

                {/* ✅ Enhancer popover — anchored below the wand button.
                    Click outside to close (handled by the backdrop). */}
                {showEnhancer && (
                  <>
                    {/* Backdrop — closes popover on click */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowEnhancer(false)}
                    />
                    {/* Popover — responsive:
                        Mobile: fixed bottom sheet, full-width, max 85vh
                        Desktop: absolute, right-anchored below the button, 320px wide */}
                    <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] z-50 rounded-t-xl border-t border-xan-border bg-[#0f0f0f]/95 backdrop-blur shadow-2xl text-white overflow-y-auto overflow-x-hidden animate-in fade-in duration-200 sm:absolute sm:bottom-auto sm:top-full sm:right-0 sm:left-auto sm:mt-2 sm:w-80 sm:max-h-[80vh] sm:rounded-lg sm:border-t-0 sm:border sm:zoom-in-95">
                      <VideoEnhancerPanel
                        standalone
                        state={enhancer.state}
                        active={enhancer.active}
                        peeking={enhancer.peeking}
                        onBack={() => setShowEnhancer(false)}
                        onClose={() => setShowEnhancer(false)}
                        onUpdate={enhancer.update}
                        onApplyPreset={enhancer.applyPreset}
                        onReset={enhancer.reset}
                        onToggleEnabled={enhancer.toggleEnabled}
                        onPeekStart={enhancer.peekStart}
                        onPeekEnd={enhancer.peekEnd}
                        customPresets={enhancer.customPresets}
                        canSaveMoreCustom={enhancer.canSaveMoreCustom}
                        onSaveCustomPreset={enhancer.saveCustomPreset}
                        onApplyCustomPreset={enhancer.applyCustomPreset}
                        onDeleteCustomPreset={enhancer.deleteCustomPreset}
                        onRenameCustomPreset={enhancer.renameCustomPreset}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="relative">
            <VideoPlayer
              animeId={anime.id}
              malId={anime.idMal ?? undefined}
              episode={currentEpisode}
              animeTitle={title}
              posterUrl={posterUrl}
              autoResumeTime={autoResumeTime}
              skipIntroOffset={85}
              onEpisodeEnd={handleEpisodeEnd}
              onProgress={handleProgress}
              mode={mode}
              onFallbackToSub={handleFallbackToSub}
              onSourcesLoaded={handleSourcesLoaded}
              onSourceChange={handleSourceChange}
              selectSourceRef={selectSourceRef}
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

          {/* ✅ Source switcher panel — always visible below the player.
              Shows all available sources with type badges + bandwidth-tier
              preview. Click any source to switch (preserves playback position).
              Can be disabled in Settings → Bandwidth → Show Sources panel. */}
          {sources.length > 0 && settings.showSourceSwitcher && (
            <SourceSwitcher
              sources={sources}
              currentSourceIdx={currentSourceIdx}
              failedSourceIdxs={failedSourceIdxs}
              recommendedIdx={recommendedIdx}
              providerPriority={settings.providerPriority}
              onSelectSource={(idx) => selectSourceRef.current?.(idx)}
            />
          )}

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
                    <Link href={`/watch/${anime.id}?ep=${prevEp}${typeParam}`}>Previous</Link>
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
                    <Link href={`/watch/${anime.id}?ep=${nextEp}${typeParam}`}>Next</Link>
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
          mode={mode}
        />
      </div>
    </div>
  );
}
