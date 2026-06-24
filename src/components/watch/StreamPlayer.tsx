"use client";

// components/watch/StreamPlayer.tsx
// ✅ Enhanced HLS/MP4 player with:
//   - Playback speed selector (0.25x – 2x)
//   - Picture-in-Picture support
//   - Keyboard shortcuts (Space, F, M, arrows, etc.)
//   - Skip intro button (5s–85s)
//   - Auto-play next episode overlay
//   - Resume from last position
//   - Volume slider
//   - Custom headers via proxy

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  AlertCircle,
  Loader2,
  Maximize,
  Minimize,
  Play,
  Pause,
  Volume2,
  VolumeX,
  PictureInPicture2,
  SkipForward,
  Keyboard,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay";
import { AutoPlayOverlay } from "./AutoPlayOverlay";

interface StreamPlayerProps {
  streamUrl: string;
  streamType: "hls" | "mp4" | "dash";
  title: string;
  posterUrl?: string;
  onProgress?: (currentTime: number, duration: number) => void;
  headers?: Record<string, string>;
  provider?: string;
  skipIntroOffset?: number; // default 85s
  autoResumeTime?: number; // seconds to seek to on load
  nextEpisode?: number | null;
  onPlayNext?: () => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function StreamPlayer({
  streamUrl,
  streamType,
  title,
  posterUrl,
  onProgress,
  headers,
  provider,
  skipIntroOffset = 85,
  autoResumeTime,
  nextEpisode = null,
  onPlayNext,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  // Bug 11+12 fix: use refs for callbacks + autoResumeTime to avoid
  // tearing down the video element on every progress tick / re-render
  const onProgressRef = useRef(onProgress);
  const autoResumeTimeRef = useRef(autoResumeTime);
  useEffect(() => {
    onProgressRef.current = onProgress;
    autoResumeTimeRef.current = autoResumeTime;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showAutoPlay, setShowAutoPlay] = useState(false);
  const autoPlayFiredRef = useRef(false);

  const needsProxy = headers && Object.keys(headers).length > 0;
  const videoUrl = needsProxy ? buildProxyUrl(streamUrl, headers) : streamUrl;

  // ─── Video event handlers ───
  const onLoaded = useCallback(() => {
    setLoading(false);
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    // Resume from saved position — Bug 12 fix: use ref, not prop
    const resumeTime = autoResumeTimeRef.current;
    if (resumeTime && resumeTime > 5 && resumeTime < video.duration - 10) {
      video.currentTime = resumeTime;
    }
  }, []);

  const onPlaying = useCallback(() => {
    setPlaying(true);
    setLoading(false);
  }, []);

  const onPause = useCallback(() => setPlaying(false), []);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setProgress(video.currentTime);
    setDuration(video.duration || 0);
    // Bug 11 fix: use ref, not prop — avoids re-creating callback on every tick
    onProgressRef.current?.(video.currentTime, video.duration || 0);

    // Skip intro button visibility (5s to skipIntroOffset)
    const t = video.currentTime;
    setShowSkipIntro(t > 5 && t < skipIntroOffset);

    // Auto-play next at 90% completion
    if (
      !autoPlayFiredRef.current &&
      video.duration > 0 &&
      video.currentTime / video.duration >= 0.9 &&
      nextEpisode !== null &&
      onPlayNext
    ) {
      autoPlayFiredRef.current = true;
      setShowAutoPlay(true);
    }
  }, [skipIntroOffset, nextEpisode, onPlayNext]);

  const onEnded = useCallback(() => {
    setPlaying(false);
    if (nextEpisode !== null && onPlayNext) {
      setShowAutoPlay(true);
    }
  }, [nextEpisode, onPlayNext]);

  const onError = useCallback(() => {
    setError("Failed to load stream. The source may be unavailable.");
    setLoading(false);
  }, []);

  // ─── Initialize video + HLS ───
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setLoading(true);
    setError(null);
    autoPlayFiredRef.current = false;
    setShowAutoPlay(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    if (streamType === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            setError(`Playback error: ${data.details}`);
            setLoading(false);
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoUrl;
      } else {
        setError("HLS is not supported in this browser.");
        setLoading(false);
      }
    } else {
      video.src = videoUrl;
    }

    return () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoUrl, streamType, onLoaded, onPlaying, onPause, onTimeUpdate, onEnded, onError]);

  // ─── Fullscreen tracking ───
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ─── PiP tracking ───
  useEffect(() => {
    const handler = () => setIsPip(!!document.pictureInPictureElement);
    document.addEventListener("enterpictureinpicture", handler);
    document.addEventListener("leavepictureinpicture", handler);
    return () => {
      document.removeEventListener("enterpictureinpicture", handler);
      document.removeEventListener("leavepictureinpicture", handler);
    };
  }, []);

  // ─── Control functions ───
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const changeVolume = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen?.();
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("PiP failed:", err);
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    setProgress(video.currentTime);
  }, []);

  const changeSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }, []);

  const skipIntro = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = skipIntroOffset;
    setShowSkipIntro(false);
  }, [skipIntroOffset]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const t = Number(e.target.value);
    video.currentTime = t;
    setProgress(t);
  };

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't trigger when typing in inputs
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      )
        return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "arrowleft":
        case "j":
          e.preventDefault();
          seekBy(-10);
          break;
        case "arrowright":
        case "l":
          e.preventDefault();
          seekBy(10);
          break;
        case "arrowup":
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.1));
          break;
        case "arrowdown":
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.1));
          break;
        case ">":
        case ".":
          e.preventDefault();
          {
            const idx = SPEEDS.indexOf(playbackRate);
            if (idx < SPEEDS.length - 1) changeSpeed(SPEEDS[idx + 1]);
          }
          break;
        case "<":
        case ",":
          e.preventDefault();
          {
            const idx = SPEEDS.indexOf(playbackRate);
            if (idx > 0) changeSpeed(SPEEDS[idx - 1]);
          }
          break;
        case "p":
          e.preventDefault();
          togglePip();
          break;
        case "?":
        case "/":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        case "escape":
          setShowShortcuts(false);
          break;
      }
    };

    container.addEventListener("keydown", handler);
    return () => container.removeEventListener("keydown", handler);
  }, [togglePlay, toggleFullscreen, toggleMute, togglePip, seekBy, changeVolume, changeSpeed, volume, playbackRate]);

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="w-full aspect-video bg-zinc-900 rounded-lg flex flex-col items-center justify-center text-center p-6 border border-xan-border">
        <AlertCircle className="h-10 w-10 text-xan-crimson mb-3" />
        <p className="text-foreground font-medium">Playback Error</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div
          ref={containerRef}
          className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-xan-border group"
          tabIndex={0}
        >
          <video
            ref={videoRef}
            poster={posterUrl}
            className="w-full h-full object-contain"
            playsInline
            onClick={togglePlay}
            title={title}
          />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
              <Loader2 className="h-10 w-10 text-white animate-spin" />
            </div>
          )}

          {/* Skip Intro button */}
          {showSkipIntro && (
            <button
              onClick={skipIntro}
              className="absolute bottom-24 right-4 bg-xan-crimson hover:bg-xan-crimson/90 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2 transition-all animate-in fade-in slide-in-from-bottom-2"
            >
              Skip Intro
              <SkipForward className="h-4 w-4" />
            </button>
          )}

          {/* Auto-play overlay */}
          <AutoPlayOverlay
            open={showAutoPlay}
            nextEpisode={nextEpisode}
            animeTitle={title}
            onPlayNow={() => {
              setShowAutoPlay(false);
              onPlayNext?.();
            }}
            onCancel={() => setShowAutoPlay(false)}
          />

          {/* Custom controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
            {/* Progress bar */}
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={progress}
              onChange={seek}
              className="w-full h-1 rounded-full appearance-none bg-white/20 cursor-pointer mb-2
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-xan-crimson"
              aria-label="Seek"
            />

            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <button onClick={togglePlay} className="hover:text-xan-crimson transition-colors" aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white" />}
                </button>
                <button onClick={toggleMute} className="hover:text-xan-crimson transition-colors" aria-label={muted ? "Unmute" : "Mute"}>
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                {/* Volume slider */}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  className="w-16 h-1 rounded-full appearance-none bg-white/20 cursor-pointer hidden sm:block
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  aria-label="Volume"
                />
                <span className="text-xs font-mono ml-1">
                  {formatTime(progress)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Speed selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowSpeedMenu((v) => !v)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                    aria-label="Playback speed"
                  >
                    <Gauge className="h-3.5 w-3.5" />
                    {playbackRate}x
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-xan-border rounded-lg py-1 min-w-[80px] shadow-xl">
                      {SPEEDS.map((speed) => (
                        <button
                          key={speed}
                          onClick={() => changeSpeed(speed)}
                          className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                            speed === playbackRate ? "text-xan-crimson font-semibold" : "text-white"
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* PiP */}
                <button onClick={togglePip} className={`hover:text-xan-crimson transition-colors ${isPip ? "text-xan-crimson" : ""}`} aria-label="Picture in Picture">
                  <PictureInPicture2 className="h-4 w-4" />
                </button>

                {/* Keyboard shortcuts */}
                <button onClick={() => setShowShortcuts(true)} className="hover:text-xan-crimson transition-colors" aria-label="Keyboard shortcuts">
                  <Keyboard className="h-4 w-4" />
                </button>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen} className="hover:text-xan-crimson transition-colors" aria-label="Fullscreen">
                  {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Center play button when paused */}
          {!playing && !loading && !showAutoPlay && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center"
              aria-label="Play"
            >
              <div className="w-16 h-16 rounded-full bg-xan-crimson/90 hover:bg-xan-crimson flex items-center justify-center shadow-xl scale-95 hover:scale-100 transition-all">
                <Play className="h-7 w-7 text-white fill-white ml-1" />
              </div>
            </button>
          )}
        </div>

        {/* Provider badge */}
        {provider && provider !== "demo" && (
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
              {provider}
            </span>
            <span className="text-xs text-muted-foreground">
              Real anime stream · Press <kbd className="px-1 py-0.5 bg-xan-card border border-xan-border rounded text-[10px]">?</kbd> for shortcuts
            </span>
          </div>
        )}
      </div>

      <KeyboardShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </>
  );
}

// ─── Helper: build proxy URL ───
function buildProxyUrl(streamUrl: string, headers?: Record<string, string>): string {
  const params = new URLSearchParams({ url: streamUrl });
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      params.set(key, value);
    }
  }
  return `/api/proxy_stream?${params.toString()}`;
}
