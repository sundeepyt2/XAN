"use client";

// components/watch/StreamPlayer.tsx
// ✅ Real HLS player using native <video> + hls.js
// ✅ Replaces the broken Vidstack 0.6.x stub

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertCircle, Loader2, Settings, Maximize, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StreamPlayerProps {
  streamUrl: string;
  streamType: "hls" | "mp4" | "dash";
  title: string;
  posterUrl?: string;
  onProgress?: (currentTime: number, duration: number) => void;
}

export function StreamPlayer({
  streamUrl,
  streamType,
  title,
  posterUrl,
  onProgress,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setLoading(true);
    setError(null);

    // Cleanup any previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let cancelled = false;

    const onLoaded = () => {
      if (!cancelled) {
        setLoading(false);
        setDuration(video.duration || 0);
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
        onProgress?.(video.currentTime, video.duration || 0);
      }
    };
    const onError = () => {
      if (!cancelled) {
        setError("Failed to load stream. The source may be unavailable.");
        setLoading(false);
      }
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("error", onError);

    if (streamType === "hls") {
      if (Hls.isSupported()) {
        // Use hls.js for browsers that don't natively support HLS (Chrome, Firefox, Edge)
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            setError(`Playback error: ${data.details}`);
            setLoading(false);
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari supports HLS natively
        video.src = streamUrl;
      } else {
        setError("HLS is not supported in this browser.");
        setLoading(false);
      }
    } else {
      // Direct MP4 / DASH
      video.src = streamUrl;
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("error", onError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, streamType, onProgress]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen?.();
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const t = Number(e.target.value);
    video.currentTime = t;
    setProgress(t);
  };

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
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
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-xan-border group">
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

      {/* Custom controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
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
            <button
              onClick={togglePlay}
              className="hover:text-xan-crimson transition-colors"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 fill-white" />
              )}
            </button>
            <button
              onClick={toggleMute}
              className="hover:text-xan-crimson transition-colors"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <span className="text-xs font-mono ml-1">
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-white/10 flex items-center gap-1">
              <Settings className="h-3 w-3" />
              HLS
            </span>
            <button
              onClick={toggleFullscreen}
              className="hover:text-xan-crimson transition-colors"
              aria-label="Fullscreen"
            >
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Center play button when paused */}
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
    </div>
  );
}
