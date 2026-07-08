"use client";

// components/watch/AutoPlayOverlay.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import { Play, X } from "lucide-react";

interface AutoPlayOverlayProps {
  nextEpisodeLabel: string;
  animeTitle: string;
  onPlayNext: () => void;
  onCancel: () => void;
}

const COUNTDOWN_SECONDS = 10;

export function AutoPlayOverlay({
  nextEpisodeLabel,
  animeTitle,
  onPlayNext,
  onCancel,
}: AutoPlayOverlayProps) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const firedRef = useRef(false);

  const handleCancel = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    setRemaining(COUNTDOWN_SECONDS);
    onCancel();
  }, [onCancel]);

  const handlePlayNow = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    setRemaining(COUNTDOWN_SECONDS);
    onPlayNext();
  }, [onPlayNext]);

  useEffect(() => {
    if (remaining <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onPlayNext();
      }
      return;
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, onPlayNext]);

  const fraction = remaining / COUNTDOWN_SECONDS;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative max-w-md w-full mx-4 rounded-xl border border-xan-border bg-xan-card/95 p-6 text-center shadow-2xl">
        <button
          onClick={handleCancel}
          aria-label="Cancel autoplay"
          className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex justify-center mb-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="#e94560"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-white font-mono">{remaining}</span>
            </div>
          </div>
        </div>

        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Up Next</p>
        <h3 className="text-base font-bold text-foreground truncate">{animeTitle}</h3>
        <p className="text-sm text-muted-foreground mb-5">{nextEpisodeLabel}</p>

        <div className="flex gap-2 justify-center">
          <button
            onClick={handlePlayNow}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-xan-crimson to-xan-violet text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-[0_0_20px_rgba(233,69,96,0.3)]"
          >
            <Play className="h-4 w-4 fill-white" />
            Play Now
          </button>
          <button
            onClick={handleCancel}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-xan-card text-muted-foreground text-sm font-medium hover:text-foreground hover:bg-xan-card-hover border border-xan-border transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
