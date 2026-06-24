"use client";

// components/watch/AutoPlayOverlay.tsx
// ✅ Overlay that appears when an episode nears completion.
// Shows a countdown to the next episode with Play Now / Cancel buttons.

import { useState, useEffect } from "react";
import { Play, X, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AutoPlayOverlayProps {
  open: boolean;
  nextEpisode: number | null;
  animeTitle: string;
  onPlayNow: () => void;
  onCancel: () => void;
}

export function AutoPlayOverlay({
  open,
  nextEpisode,
  animeTitle,
  onPlayNow,
  onCancel,
}: AutoPlayOverlayProps) {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!open) {
      setCountdown(10);
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onPlayNow();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open, onPlayNow]);

  if (!open || nextEpisode === null) return null;

  // Circular progress
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = ((10 - countdown) / 10) * circumference;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50">
      <div className="text-center space-y-4 px-6">
        {/* Circular countdown */}
        <div className="relative w-20 h-20 mx-auto">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="3"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="#e94560"
              strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={progress}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{countdown}</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-white/80 text-sm">Next episode starting…</p>
          <p className="text-white font-semibold text-lg">
            Episode {nextEpisode}
          </p>
          <p className="text-white/50 text-xs line-clamp-1">{animeTitle}</p>
        </div>

        <div className="flex items-center gap-3 justify-center pt-2">
          <Button
            onClick={onCancel}
            variant="secondary"
            size="sm"
            className="bg-white/10 text-white hover:bg-white/20 border-white/20"
          >
            <X className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
          <Button
            onClick={onPlayNow}
            size="sm"
            className="bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0"
          >
            <SkipForward className="h-4 w-4 mr-1.5 fill-white" />
            Play Now
          </Button>
        </div>
      </div>
    </div>
  );
}
