"use client";

// components/watch/VideoPlayer.tsx
// ✅ Controlled mode — parent (watch page) owns the mode state via localStorage.
// ✅ Throttled progress reporting (max 1 write/5s) to avoid localStorage spam.
// ✅ Retry button on error.
// ✅ Uses the new YouTube-style custom player (YouTubeStylePlayer).
// ✅ Reads bandwidthMode from useSettings and threads it through to the player.
// ✅ Reads/writes bandwidth-tier analytics via useBandwidthStats.
// ✅ Multi-source fallback: if all tiers fail for source[0], automatically
//    try source[1], source[2], etc. Maximize chance of finding a source that
//    works through the CF Worker (some providers block CF IPs, others don't).
// ✅ Manual source switching: parent can call onSelectSource(idx) to switch
//    sources — preserves playback position across the switch.
// ✅ Failed-source tracking: a Set of failed source indices is exposed to the
//    parent so the SourceSwitcher panel can show ❌ indicators.
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { YouTubeStylePlayer } from "./YouTubeStylePlayer";
import { AlertCircle, Loader2, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useBandwidthStats } from "@/hooks/useBandwidthStats";
import { findRecommendedSourceIdx, scoreSource, type SourceItem } from "./SourceSwitcher";

interface VideoPlayerProps {
  animeId: number;
  /** MyAnimeList ID — needed for AnimePahe (nekostream) provider */
  malId?: number;
  episode: number;
  animeTitle: string;
  posterUrl?: string;
  autoResumeTime?: number;
  skipIntroOffset?: number;
  onEpisodeEnd?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  /** Current sub/dub mode (controlled by parent) */
  mode: "sub" | "dub";
  /** Called when dub falls back to sub for this episode */
  onFallbackToSub?: () => void;
  /** Called when the sources list is loaded — parent uses it to render SourceSwitcher.
   *  Also receives the recommended source index (most bandwidth-friendly). */
  onSourcesLoaded?: (sources: StreamData[], recommendedIdx: number) => void;
  /** Called when the active source index changes (manual or auto-fallback) */
  onSourceChange?: (idx: number, failedIdxs: Set<number>) => void;
  /** Parent can call this to manually switch sources (via ref) */
  selectSourceRef?: React.MutableRefObject<((idx: number) => void) | null>;
}

interface StreamData {
  url: string;
  type: "hls" | "mp4" | "dash" | "iframe";
  quality: string | null;
  headers?: Record<string, string>;
  sourceName?: string;
  provider?: string;
}

export function VideoPlayer({
  animeId,
  malId,
  episode,
  animeTitle,
  posterUrl,
  autoResumeTime,
  skipIntroOffset,
  onEpisodeEnd,
  onProgress,
  mode,
  onFallbackToSub,
  onSourcesLoaded,
  onSourceChange,
  selectSourceRef,
}: VideoPlayerProps) {
  // ✅ Read settings FIRST — needed by useMemo for disabledSources filtering
  const { settings, isLoaded: settingsLoaded } = useSettings();
  const { logTierResult } = useBandwidthStats();

  const [stream, setStream] = useState<StreamData | null>(null);
  // ✅ Full list of sources from the API — used for multi-source fallback
  // This is the UNFILTERED list (disabled sources are still here).
  // The filtered list is derived via useMemo below.
  const [allSourcesRaw, setAllSourcesRaw] = useState<StreamData[]>([]);
  // ✅ Derived filtered list — disabled sources removed.
  // Recomputes whenever the raw list or disabledSources changes.
  // ✅ Pin support: if settings.pinnedSource is set, ONLY that source is
  // used (overriding the disabled filter). Even if the pinned source is
  // disabled in the toggle, it still loads because the pin takes priority.
  // Even if the pinned source fails to stream, no fallback to other sources.
  const allSources = useMemo(() => {
    const pinned = settings.pinnedSource;
    if (pinned) {
      // ✅ Pin mode — filter to ONLY sources matching the pinned name.
      // This overrides disabledSources — the pinned source loads even if
      // it's toggled off. No fallback to other sources if it fails.
      return allSourcesRaw.filter((s) => s.sourceName === pinned);
    }
    const disabled = settings.disabledSources;
    if (disabled.length === 0) return allSourcesRaw;
    return allSourcesRaw.filter((s) => !disabled.includes(s.sourceName ?? ""));
  }, [allSourcesRaw, settings.disabledSources, settings.pinnedSource]);
  // ✅ Which source index we're currently trying (advances on tier failure)
  const [sourceIdx, setSourceIdx] = useState(0);
  // ✅ Set of source indices that have failed all tiers — shown as ❌ in UI
  const [failedSources, setFailedSources] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ✅ Retry nonce — incrementing forces the fetch effect to re-run
  const [retryNonce, setRetryNonce] = useState(0);
  // ✅ "Switching source" indicator (shown briefly while advancing to next source)
  const [switchingSource, setSwitchingSource] = useState(false);
  // ✅ Preserved playback position — used when manually switching sources
  // so the user doesn't lose their place in the episode.
  // Stored as STATE (not a ref) because we read it during render to compute
  // effectiveAutoResume, and reading refs during render is forbidden.
  const [preservedPosition, setPreservedPosition] = useState<number | null>(null);
  // ✅ Manual switch flag — when true, we'll seek to preservedPosition after
  // the new source loads. Stored as STATE for the same reason.
  const [pendingSeek, setPendingSeek] = useState(false);
  // ✅ Ref mirrors of the above (for use inside callbacks where state would be stale)
  const preservedPositionRef = useRef<number | null>(null);
  const pendingSeekRef = useRef(false);

  // ✅ Refs for stable callbacks (avoid re-running fetch effect on settings change)
  const logTierResultRef = useRef(logTierResult);
  useEffect(() => {
    logTierResultRef.current = logTierResult;
  });

  // ✅ Bug fix: use ref for onFallbackToSub to prevent unnecessary refetches.
  const onFallbackToSubRef = useRef(onFallbackToSub);
  useEffect(() => {
    onFallbackToSubRef.current = onFallbackToSub;
  });

  // ✅ Bug fix: ref for settings so the fetch handler always reads the LATEST
  // pinnedSource + disabledSources — even if settings hydrated from localStorage
  // AFTER the fetch effect was created. Without this, the fetch handler would
  // use stale DEFAULT_SETTINGS (pinnedSource: null) on the first render, picking
  // the wrong source (e.g., Ok.ru instead of pinned Koto).
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // ✅ Throttle progress reporting — max 1 write per 5 seconds.
  const lastProgressWriteRef = useRef(0);
  const stableOnProgress = useCallback(
    (t: number, d: number) => {
      // Always track current position in ref (for source switching preservation)
      preservedPositionRef.current = t;
      const now = Date.now();
      if (now - lastProgressWriteRef.current < 5000 && t < d * 0.95) return;
      lastProgressWriteRef.current = now;
      onProgress?.(t, d);
    },
    [onProgress],
  );

  const stableOnEpisodeEnd = useCallback(() => onEpisodeEnd?.(), [onEpisodeEnd]);

  // ✅ Notify parent when sources load or source index changes
  // Also compute and pass the recommended source index for the ⭐ badge
  useEffect(() => {
    const recIdx = findRecommendedSourceIdx(allSources as SourceItem[]);
    onSourcesLoaded?.(allSources, recIdx);
  }, [allSources, onSourcesLoaded]);

  useEffect(() => {
    onSourceChange?.(sourceIdx, failedSources);
  }, [sourceIdx, failedSources, onSourceChange]);

  // ✅ If the current source gets disabled (user toggled it off in Settings),
  // auto-switch to the first enabled source.
  useEffect(() => {
    if (allSources.length === 0) return;
    // If sourceIdx is out of bounds (e.g. after filtering), reset to 0
    if (sourceIdx >= allSources.length) {
      setSourceIdx(0);
      if (allSources[0]) setStream(allSources[0]);
    }
  }, [allSources, sourceIdx]);

  // ✅ Pin support: when pinnedSource changes (or allSources recomputes due to
  // pin change), re-select the stream to match the pin filter. Without this,
  // the player would keep playing the old source even after pinning a different
  // one — the user would have to reload the page to see the pin take effect.
  useEffect(() => {
    if (allSources.length === 0) return;
    const currentStream = allSources[sourceIdx];
    // If the current stream is NOT in the filtered list (e.g. pin changed and
    // the old source is no longer included), switch to the first available.
    if (!currentStream) {
      setSourceIdx(0);
      setStream(allSources[0]);
      setFailedSources(new Set());
    }
  }, [allSources, sourceIdx, settings.pinnedSource]);

  // ✅ Manual source selection — exposed to parent via selectSourceRef
  // idx is an index into the FILTERED allSources list (what SourceSwitcher renders)
  const handleSelectSource = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= allSources.length) return;
      if (idx === sourceIdx) return;
      // ✅ Preserve current playback position so we can seek to it after switch
      const video = document.querySelector("video");
      if (video) {
        const pos = video.currentTime;
        preservedPositionRef.current = pos;
        setPreservedPosition(pos);
        pendingSeekRef.current = true;
        setPendingSeek(true);
      }
      setSwitchingSource(true);
      setSourceIdx(idx);
      setStream(allSources[idx]);
      setTimeout(() => setSwitchingSource(false), 600);
    },
    [allSources, sourceIdx],
  );

  // ✅ Expose handleSelectSource to parent via ref
  useEffect(() => {
    if (selectSourceRef) {
      selectSourceRef.current = handleSelectSource;
    }
  }, [handleSelectSource, selectSourceRef]);

  // ✅ Ref mirror of failedSources — needed inside stableOnTierResolved to
  // check which sources have already failed (the state is stale in closures)
  const failedSourcesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    failedSourcesRef.current = failedSources;
  }, [failedSources]);

  // ✅ Stable analytics callback — fires when the player settles on a tier.
  // Also handles multi-source fallback: if all tiers fail for the current
  // source, find the next non-failed source (cycling through ALL indices).
  const stableOnTierResolved = useCallback(
    (tier: "direct" | "manifest-proxy" | "cf-proxy" | "full-proxy" | "failed") => {
      logTierResultRef.current?.({
        provider: stream?.provider ?? "unknown",
        sourceName: stream?.sourceName ?? "unknown",
        streamType: stream?.type ?? "unknown",
        tier,
      });

      // ✅ Multi-source fallback: if all tiers failed for this source, find
      // the next non-failed source. Cycles through ALL sources (not just
      // forward) so sources before the current index get tried too.
      // ✅ Pin mode: if settings.pinnedSource is set, do NOT fallback — the
      // user explicitly wants ONLY this source, even if it fails.
      if (tier === "failed" && !settings.pinnedSource) {
        // Mark this source as failed
        setFailedSources((prev) => {
          const next = new Set(prev);
          next.add(sourceIdx);
          failedSourcesRef.current = next; // update ref immediately
          return next;
        });

        // Find the next non-failed source (cycle through all indices)
        const failedSet = failedSourcesRef.current;
        let nextIdx = -1;
        for (let i = 1; i <= allSources.length; i++) {
          const candidateIdx = (sourceIdx + i) % allSources.length;
          if (!failedSet.has(candidateIdx)) {
            nextIdx = candidateIdx;
            break;
          }
        }

        if (nextIdx >= 0 && nextIdx !== sourceIdx) {
          console.warn(
            `[VideoPlayer] Source ${sourceIdx} (${allSources[sourceIdx]?.sourceName}) failed all tiers — trying source ${nextIdx} (${allSources[nextIdx]?.sourceName})`
          );
          setSwitchingSource(true);
          // Preserve position for auto-fallback
          const video = document.querySelector("video");
          if (video) {
            const pos = video.currentTime;
            preservedPositionRef.current = pos;
            setPreservedPosition(pos);
            pendingSeekRef.current = true;
            setPendingSeek(true);
          }
          setSourceIdx(nextIdx);
          setTimeout(() => {
            setStream(allSources[nextIdx]);
            setSwitchingSource(false);
          }, 600);
        }
      }
    },
    // ✅ Include settings.pinnedSource in deps — line 253 reads it inside the
    //    callback (gates whether multi-source fallback is allowed). The React
    //    Compiler requires inferred deps to match the manually specified array.
    [stream, allSources, sourceIdx, settings.pinnedSource],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStream(null);
    setAllSourcesRaw([]);
    setSourceIdx(0);
    setFailedSources(new Set());
    preservedPositionRef.current = null;
    setPreservedPosition(null);
    pendingSeekRef.current = false;
    setPendingSeek(false);
    lastProgressWriteRef.current = 0;

    const titleParam = animeTitle ? `&title=${encodeURIComponent(animeTitle)}` : "";
    const modeParam = `&type=${mode}`;
    const malIdParam = malId ? `&malId=${malId}` : "";

    fetch(`/api/stream/${animeId}/${episode}?${titleParam}${modeParam}${malIdParam}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Backend returned ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const s = json?.stream;
        if (json?.error && (!s || !s.url)) {
          setError(json.error);
          setLoading(false);
          return;
        }
        if (s && s.url) {
          const primaryStream: StreamData = {
            url: s.url,
            type: s.type,
            quality: s.quality ?? null,
            headers: s.headers,
            sourceName: s.sourceName,
            // ✅ Bug fix: use the primary stream's OWN provider field (s.provider),
            // NOT the top-level json.provider (which is the picked source's
            // provider — could be wrong for non-primary sources). Each source
            // in the API response has its own provider field.
            provider: s.provider ?? json?.provider,
          };
          // ✅ Build the full sources list from the API response.
          const sources: StreamData[] = [primaryStream];
          if (Array.isArray(json?.sources)) {
            for (const src of json.sources) {
              if (src?.url && src.url !== primaryStream.url) {
                sources.push({
                  url: src.url,
                  type: src.type,
                  quality: src.quality ?? null,
                  headers: src.headers,
                  sourceName: src.sourceName,
                  // ✅ Bug fix: use each source's OWN provider field, not the
                  // top-level json.provider. This ensures Koto sources have
                  // provider="koto", Zen sources have provider="zen", etc.
                  // so the provider priority sort works correctly.
                  provider: src.provider ?? json?.provider,
                });
              }
            }
          }
          // ✅ Sort ALL sources by provider priority (from settings) + bandwidth score.
          // Don't filter disabled sources here — the useMemo (allSources) handles that.
          // allSourcesRaw holds the full list so re-enabling a source works without re-fetch.
          // ✅ Bug fix: read from settingsRef.current (always latest) instead of the
          // stale `settings` captured when the effect was created.
          const currentSettings = settingsRef.current;
          const priority = currentSettings.providerPriority;
          const sortedSources = [...sources].sort((a, b) => {
            const aPriority = priority.indexOf(a.provider ?? "allanime");
            const bPriority = priority.indexOf(b.provider ?? "allanime");
            const aIdx = aPriority === -1 ? 999 : aPriority;
            const bIdx = bPriority === -1 ? 999 : bPriority;
            if (aIdx !== bIdx) return aIdx - bIdx;
            return scoreSource(b as SourceItem) - scoreSource(a as SourceItem);
          });

          setAllSourcesRaw(sortedSources);

          // ✅ The filtered list (allSources) is derived by useMemo. Auto-pick the first one.
          // We compute it inline here to avoid a race condition with useMemo.
          // ✅ Bug fix: respect pinnedSource — if set, ONLY the pinned source
          // is used (overrides disabledSources). Uses settingsRef.current for
          // the latest value (avoids stale DEFAULT_SETTINGS on first render).
          const pinned = currentSettings.pinnedSource;
          let enabled: StreamData[];
          if (pinned) {
            // Pin mode — only sources matching the pinned name
            enabled = sortedSources.filter((s) => s.sourceName === pinned);
          } else {
            const disabled = currentSettings.disabledSources;
            enabled = disabled.length > 0
              ? sortedSources.filter((s) => !disabled.includes(s.sourceName ?? ""))
              : sortedSources;
          }

          if (enabled.length === 0) {
            setError(
              pinned
                ? `Pinned source "${pinned}" is not available for this episode. Unpin it or try another source.`
                : "All sources are disabled. Enable some sources in Settings → Bandwidth → Source filters."
            );
            setLoading(false);
            return;
          }

          setSourceIdx(0);
          setStream(enabled[0] ?? primaryStream);
          setLoading(false);
          if (json?.fallbackMode) {
            onFallbackToSubRef.current?.();
          }
        } else {
          setError("Backend returned an invalid stream response");
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load stream");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId, malId, episode, animeTitle, mode, retryNonce, settingsLoaded]);

  if (error) {
    // ✅ If we have failed sources, show the "Tried: ..." message (xancld.xyz style)
    const failedNames = Array.from(failedSources)
      .map((i) => allSources[i]?.sourceName ?? `Source ${i + 1}`)
      .join(", ");
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center text-center p-6 border border-xan-border">
        <AlertCircle className="h-10 w-10 text-xan-crimson mb-3" />
        <p className="text-foreground font-medium">Stream Unavailable</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
        {failedNames && (
          <p className="text-xs text-muted-foreground/70 mt-2 max-w-md">
            Tried: {failedNames}
          </p>
        )}
        <Button
          onClick={() => setRetryNonce((n) => n + 1)}
          variant="secondary"
          size="sm"
          className="mt-4 bg-xan-card border-xan-border hover:bg-xan-card-hover"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (loading || !stream) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center border border-xan-border">
        <Loader2 className="h-10 w-10 text-xan-crimson animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">
          Loading episode {episode} ({mode.toUpperCase()})…
        </p>
      </div>
    );
  }

  // ✅ Compute autoResumeTime for this load:
  //   - If we have a preserved position from a source switch, use that
  //   - Else use the parent-provided autoResumeTime (from watch history)
  const effectiveAutoResume = pendingSeek
    ? preservedPosition ?? undefined
    : autoResumeTime;

  return (
    <div className="relative">
      <YouTubeStylePlayer
        key={`source-${sourceIdx}-${stream.url}`}
        streamUrl={stream.url}
        streamType={stream.type}
        title={`${animeTitle} — Episode ${episode}`}
        posterUrl={posterUrl}
        streamHeaders={stream.headers}
        sourceName={stream.sourceName}
        autoResumeTime={effectiveAutoResume}
        skipIntroOffset={skipIntroOffset}
        onEpisodeEnd={stableOnEpisodeEnd}
        onProgress={stableOnProgress}
        mode={mode}
        provider={stream.provider}
        bandwidthMode={settings.bandwidthMode}
        onTierResolved={stableOnTierResolved}
        onLoadedCallback={() => {
          // ✅ After the new source loads, clear the pending-seek flag
          if (pendingSeekRef.current) {
            pendingSeekRef.current = false;
            setPendingSeek(false);
          }
        }}
      />
      {/* ✅ "Switching source" overlay — shown briefly while advancing to next source */}
      {switchingSource && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-lg">
          <Shuffle className="h-8 w-8 text-xan-crimson mb-3 animate-pulse" />
          <p className="text-white font-medium text-sm">
            Trying alternative source…
          </p>
          <p className="text-white/60 text-xs mt-1">
            Source {sourceIdx + 1} of {allSources.length}
          </p>
        </div>
      )}
    </div>
  );
}
