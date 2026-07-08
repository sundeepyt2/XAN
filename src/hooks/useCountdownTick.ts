"use client";

// hooks/useCountdownTick.ts
// ✅ Single shared setInterval for ALL CountdownTimer instances on a page.
//    Previously, each CountdownTimer spawned its own setInterval(1000) — 50
//    schedule cards = 50 re-renders/sec. Now one global tick drives all of
//    them via useSyncExternalStore.

import { useSyncExternalStore } from "react";

// Module-level singleton: one tick value + one interval + subscriber set
let currentTick = Date.now();
let subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureInterval() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    currentTick = Date.now();
    // Snapshot to a copy in case a subscriber unsubscribes during iteration
    const snapshot = Array.from(subscribers);
    for (const cb of snapshot) cb();
  }, 1000);
}

function maybeStopInterval() {
  if (subscribers.size === 0 && intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  ensureInterval();
  return () => {
    subscribers.delete(callback);
    maybeStopInterval();
  };
}

function getSnapshot(): number {
  return currentTick;
}

/**
 * Returns a Unix-ms timestamp that updates once per second.
 * All components using this hook share ONE setInterval — no matter how many
 * CountdownTimer instances are mounted.
 */
export function useCountdownTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
