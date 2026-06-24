"use client";

// components/schedule/CountdownTimer.tsx
// ✅ Live countdown for airing episodes — ticks every second.

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  airingAt: number; // Unix timestamp (seconds)
}

export function CountdownTimer({ airingAt }: CountdownTimerProps) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = airingAt - now;

  if (diff <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-xan-card px-2 py-0.5 rounded-full">
        Aired
      </span>
    );
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  // Crimson accent if airing within 1 hour
  const isSoon = diff < 3600;

  const formatPart = (val: number, label: string) =>
    val > 0 ? `${val}${label} ` : "";

  const countdown =
    days > 0
      ? `${formatPart(days, "d")}${formatPart(hours, "h")}`
      : hours > 0
        ? `${formatPart(hours, "h")}${formatPart(minutes, "m")}`
        : `${minutes}m ${seconds}s`;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        isSoon
          ? "bg-xan-crimson/20 text-xan-crimson"
          : "bg-emerald-500/15 text-emerald-400"
      }`}
    >
      {isSoon && (
        <span className="w-1.5 h-1.5 rounded-full bg-xan-crimson animate-pulse" />
      )}
      {countdown.trim()}
    </span>
  );
}
