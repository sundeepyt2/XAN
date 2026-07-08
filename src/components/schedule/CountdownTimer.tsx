"use client";

// components/schedule/CountdownTimer.tsx
// ✅ Uses useCountdownTick — a single shared setInterval across ALL instances.
//    50 schedule cards = 1 interval (was 50).

import { useCountdownTick } from "@/hooks/useCountdownTick";

interface CountdownTimerProps {
  airingAt: number;
}

interface Remaining {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isAired: boolean;
  isImminent: boolean;
}

function computeRemaining(airingAt: number): Remaining {
  const now = Math.floor(Date.now() / 1000);
  const total = airingAt - now;
  if (total <= 0) {
    return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isAired: true, isImminent: false };
  }
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { total, days, hours, minutes, seconds, isAired: false, isImminent: total <= 3600 };
}

export function CountdownTimer({ airingAt }: CountdownTimerProps) {
  // ✅ Shared tick — one setInterval for the whole page, not one per card.
  // The hook returns the current timestamp; we don't use the value directly,
  // but subscribing causes this component to re-render once per second.
  useCountdownTick();

  // Recompute on every render (once per second via the shared tick)
  const remaining = computeRemaining(airingAt);

  if (remaining.isAired) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
        AIRED
      </span>
    );
  }

  if (remaining.isImminent) {
    const text = `${remaining.minutes}m ${remaining.seconds.toString().padStart(2, "0")}s`;
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-xan-crimson/15 text-xan-crimson border border-xan-crimson/40 font-mono animate-pulse">
        ● {text}
      </span>
    );
  }

  let text: string;
  if (remaining.days > 0) {
    text = `${remaining.days}d ${remaining.hours}h`;
  } else if (remaining.hours > 0) {
    text = `${remaining.hours}h ${remaining.minutes}m`;
  } else {
    text = `${remaining.minutes}m ${remaining.seconds.toString().padStart(2, "0")}s`;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-white/5 text-muted-foreground border border-xan-border font-mono">
      {text}
    </span>
  );
}
