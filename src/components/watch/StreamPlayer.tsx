"use client";

// components/watch/StreamPlayer.tsx
// ✅ Feature 5: Enhanced video player
//
// Capabilities:
//   - Real HLS playback (hls.js) + native MP4 with custom header proxy support
//   - Playback speed selector (0.25x – 2x)
//   - Picture-in-Picture toggle
//   - Keyboard shortcuts (Space/K/F/M/arrows/>/</J/L/P/N/?/Esc)
//   - Skip Intro button (visible 5s – skipIntroOffset+30s; clicking skips
//     skipIntroOffset seconds FROM CURRENT POSITION, not jump to fixed mark)
//   - Volume slider (replaces simple mute toggle)
//   - Resume from last position (autoResumeTime prop)
//   - Episode-end detection via onEpisodeEnd callback at 90% progress

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
  Volume1,
  PictureInPicture2,
  Keyboard,
  SkipForward,
  Gauge,
} from "lucide-react";
import { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay";

interface StreamPlayerProps {
  streamUrl: string;
  streamType: "hls" | "mp4" | "dash";
  title: string;
  posterUrl?: string;
  streamHeaders?: Record<string, string>;
  sourceName?: string;
  autoResumeTime?: number;
  skipIntroOffset?: number;
  onEpisodeEnd?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  /** Current sub/dub mode */
  mode?: "sub" | "dub";
  /** Called when user clicks the SUB/DUB toggle */
  onModeChange?: (mode: "sub" | "dub") => void;
  /** Whether dub is available for this anime */
  dubAvailable?: boolean;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function applyProxy(
  url: string,
  headers?: Record<string, string>,
): { url: string; proxied: boolean } {
  if (!headers || Object.keys(headers).length === 0) {
    return { url, proxied: false };
  }
  const params = new URLSearchParams({ url });
  for (const [k, v] of Object.entries(headers)) {
    params.set(`h_${k}`, v);
  }
  return { url: `/api/proxy_stream?${params.toString()}`, proxied: true };
}

export function StreamPlayer({
  streamUrl,
  streamType,
  title,
  posterUrl,
  streamHeaders,
  sourceName,
  autoResumeTime,
  skipIntroOffset = 85,
  onEpisodeEnd,
  onProgress,
  mode = "sub",
  onModeChange,
  dubAvailable = false,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const onEpisodeEndRef = useRef(onEpisodeEnd);
  const onProgressRef = useRef(onProgress);
  const autoResumeTimeRef = useRef(autoResumeTime);
  const endFiredRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  useEffect(() => {
    onEpisodeEndRef.current = onEpisodeEnd;
    onProgressRef.current = onProgress;
    autoResumeTimeRef.current = autoResumeTime;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setLoading(true);
    setError(null);
    endFiredRef.current = false;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const { url: effectiveUrl } = applyProxy(streamUrl, streamHeaders);

    let cancelled = false;

    const onLoaded = () => {
      if (!cancelled) {
        setLoading(false);
        setDuration(video.duration || 0);
        const resumeTime = autoResumeTimeRef.current;
        if (resumeTime && resumeTime > 0 && isFinite(resumeTime)) {
          if (video.currentTime < resumeTime - 2 && resumeTime < (video.duration || Infinity) - 5) {
            try {
              video.currentTime = resumeTime;
            } catch {}
          }
        }
      }
    };
    const onPlaying = () => {
      if (!cancelled) {
        setPlaying(true);
        setLoading(false);
      }
    };
    const onPause = () => {
      if (!cancelled) setPlaying(false);
    };
    const onTimeUpdate = () => {
      if (!cancelled) {
        setProgress(video.currentTime);
        setDuration(video.duration || 0);
        onProgressRef.current?.(video.currentTime, video.duration || 0);

        const d = video.duration || 0;
        if (d > 0 && !endFiredRef.current && video.currentTime >= d * 0.9) {
          endFiredRef.current = true;
          onEpisodeEndRef.current?.();
        }
      }
    };
    const onEnded = () => {
      if (!cancelled) {
        setPlaying(false);
        if (!endFiredRef.current) {
          endFiredRef.current = true;
          onEpisodeEndRef.current?.();
        }
      }
    };
    const onError = () => {
      if (!cancelled) {
        setError("Failed to load stream. The source may be unavailable.");
        setLoading(false);
      }
    };
    const onVolumeChange = () => {
      if (!cancelled) {
        setMuted(video.muted);
        setVolume(video.volume);
      }
    };
    const onRateChange = () => {
      if (!cancelled) setPlaybackRate(video.playbackRate);
    };
    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);

    if (streamType === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          xhrSetup: (xhr) => {
            if (streamHeaders) {
              Object.entries(streamHeaders).forEach(([k, v]) => {
                try {
                  xhr.setRequestHeader(k, v);
                } catch {}
              });
            }
          },
        });
        hlsRef.current = hls;
        hls.loadSource(effectiveUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            setError(`Playback error: ${data.details}`);
            setLoading(false);
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = effectiveUrl;
      } else {
        setError("HLS is not supported in this browser.");
        setLoading(false);
      }
    } else {
      video.src = effectiveUrl;
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, streamType, streamHeaders]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const changeVolume = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, v));
    if (v > 0 && video.muted) video.muted = false;
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    video.currentTime = newTime;
    setProgress(newTime);
  }, []);

  const seekTo = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    setProgress(t);
  }, []);

  const changeRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("[PiP] toggle failed:", err);
    }
  }, []);

  const skipIntro = useCallback(() => {
    // ✅ Skip 85 seconds FROM CURRENT POSITION (not jump to fixed 85s mark).
    // Caps at (duration - 5s) so we don't skip past the end of the video.
    const video = videoRef.current;
    if (!video) return;
    const currentTime = video.currentTime;
    const dur = video.duration || 0;
    const targetTime = Math.min(currentTime + skipIntroOffset, dur - 5);
    seekTo(targetTime);
  }, [seekTo, skipIntroOffset]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (showShortcuts && e.key !== "Escape" && e.key !== "?") return;

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
        case "M":
          e.preventDefault();
          toggleMute();
          break;
        case "ArrowLeft":
        case "j":
        case "J":
          e.preventDefault();
          seekBy(-10);
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          seekBy(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.1));
          break;
        case ">":
        case ".":
          e.preventDefault();
          {
            const idx = PLAYBACK_RATES.indexOf(playbackRate);
            const next = PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, idx + 1)];
            if (next) changeRate(next);
          }
          break;
        case "<":
        case ",":
          e.preventDefault();
          {
            const idx = PLAYBACK_RATES.indexOf(playbackRate);
            const prev = PLAYBACK_RATES[Math.max(0, idx - 1)];
            if (prev) changeRate(prev);
          }
          break;
        case "p":
        case "P":
          e.preventDefault();
          togglePip();
          break;
        case "?":
        case "/":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    showShortcuts,
    togglePlay,
    toggleFullscreen,
    toggleMute,
    seekBy,
    changeVolume,
    changeRate,
    togglePip,
    volume,
    playbackRate,
  ]);

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const showSkipIntro =
    !loading &&
    progress >= 5 &&
    progress < skipIntroOffset + 30 &&
    duration > skipIntroOffset + 10;

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
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-xan-border group"
    >
      <video
        ref={videoRef}
        poster={posterUrl}
        className="w-full h-full object-contain"
        playsInline
        onClick={togglePlay}
        title={title}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <Loader2 className="h-10 w-10 text-white animate-spin" />
        </div>
      )}

      {showSkipIntro && (
        <button
          onClick={skipIntro}
          className="absolute bottom-24 right-4 z-20 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-xan-crimson/90 hover:bg-xan-crimson text-white text-sm font-semibold shadow-lg transition-all hover:scale-105"
        >
          <SkipForward className="h-4 w-4" />
          Skip Intro
        </button>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-8 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={progress}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="w-full h-1 rounded-full appearance-none bg-white/20 cursor-pointer mb-2
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-xan-crimson"
          aria-label="Seek"
        />

        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="hover:text-xan-crimson transition-colors"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white" />}
            </button>

            <button
              onClick={toggleMute}
              className="hover:text-xan-crimson transition-colors"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              <VolumeIcon className="h-5 w-5" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="w-16 h-1 rounded-full appearance-none bg-white/20 cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              aria-label="Volume"
            />

            <span className="text-xs font-mono ml-1">
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2 relative">
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu((v) => !v)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Playback speed"
                title="Playback speed"
              >
                <Gauge className="h-3 w-3" />
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 py-1 rounded-md bg-xan-card border border-xan-border shadow-xl min-w-[88px]">
                  {PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changeRate(rate)}
                      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
                        rate === playbackRate
                          ? "text-xan-crimson font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {rate}x{rate === 1 ? " (normal)" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ✅ SUB/DUB toggle — only show if onModeChange is provided */}
            {onModeChange && (
              <div className="flex items-center rounded bg-white/10 overflow-hidden">
                <button
                  onClick={() => onModeChange("sub")}
                  className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${
                    mode === "sub"
                      ? "bg-xan-crimson text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Japanese audio with subtitles"
                >
                  SUB
                </button>
                <button
                  onClick={() => dubAvailable && onModeChange("dub")}
                  disabled={!dubAvailable}
                  className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${
                    mode === "dub"
                      ? "bg-xan-crimson text-white"
                      : "text-muted-foreground hover:text-foreground"
                  } ${!dubAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
                  title={dubAvailable ? "English dubbed audio" : "Dub not available for this anime"}
                >
                  DUB
                </button>
              </div>
            )}

            <span className="text-xs px-2 py-0.5 rounded bg-white/10 flex items-center gap-1">
              {sourceName ?? (streamType === "hls" ? "HLS" : streamType.toUpperCase())}
            </span>

            <button
              onClick={togglePip}
              className={`hover:text-xan-crimson transition-colors ${isPip ? "text-xan-crimson" : ""}`}
              aria-label="Picture-in-Picture"
              title="Picture-in-Picture (P)"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>

            <button
              onClick={() => setShowShortcuts(true)}
              className="hover:text-xan-crimson transition-colors"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-5 w-5" />
            </button>

            <button
              onClick={toggleFullscreen}
              className="hover:text-xan-crimson transition-colors"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {!playing && !loading && (
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

      {showShortcuts && (
        <KeyboardShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}
