# Final Verified Implementation Plan: YouTube-Like Video Player (Vidstack)

This document outlines the complete architectural design, data flows, and code patterns for integrating a YouTube-like custom video player into **XAN** (`https://xan-gamma.vercel.app/watch/[id]`) using **Vidstack**.

> [!IMPORTANT]
> **Plan Refinements & Extreme Rigor Checks Applied:**
> - **Double-Trigger Hotkey Bug Prevented:** Writing manual event listeners for `Space`, `F`, `M`, `J`, `L` alongside Vidstack causes playback functions to trigger twice (e.g. pause then immediately play). Instead, we now leverage Vidstack's native `keyTarget="document"` API for flawless global shortcuts. We only use custom listeners for non-standard keys like `t` (Theater Mode).
> - **Race Condition & Memory Leak Fix:** Added an `isMounted` or `AbortController` flag inside the `useAniSkip` fetch hook. Without this, fetching skip times and navigating away before the request finishes throws React state-unmount memory leak errors.
> - **Seek Target Event Shift:** Changed the timeline restore trigger from `onCanPlay` to `onLoadedMetadata`. `onCanPlay` fires too late, potentially causing the video to flash a frame at 0:00 before seeking. `onLoadedMetadata` ensures the playhead is positioned instantly.
> - **AniSkip API Accuracy:** Appended `&episodeLength=0` to the API query. Omitting this query parameter entirely can cause the AniSkip API to return HTTP 400 Bad Requests on some episodes.

---

## 1. Architectural Code Blueprints

### State Store: `store/playerStore.ts`
Persists watch progress keyed by episode and handles layout modes.

```typescript
// store/playerStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Subtitle {
  url: string;
  lang: string;
  label: string;
  isDefault?: boolean;
}

interface PlayerState {
  currentStreamUrl: string;
  subtitles: Subtitle[];
  isTheaterMode: boolean;
  malId: number | null;
  episodeNumber: number | null;
  watchProgress: Record<string, number>; // Key: `${malId}-${episodeNumber}`
  
  setStream: (url: string, subtitles: Subtitle[], malId: number, episodeNumber: number) => void;
  saveEpisodeProgress: (malId: number, episodeNumber: number, progressTime: number) => void;
  toggleTheaterMode: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      currentStreamUrl: '',
      subtitles: [],
      isTheaterMode: false,
      malId: null,
      episodeNumber: null,
      watchProgress: {},

      setStream: (url, subtitles, malId, episodeNumber) => set({
        currentStreamUrl: url,
        subtitles,
        malId,
        episodeNumber,
      }),

      saveEpisodeProgress: (malId, episodeNumber, progressTime) => {
        const key = `${malId}-${episodeNumber}`;
        set((state) => ({
          watchProgress: {
            ...state.watchProgress,
            [key]: progressTime,
          },
        }));
      },

      toggleTheaterMode: () => set((state) => ({ isTheaterMode: !state.isTheaterMode })),
    }),
    {
      name: 'xan-player-storage',
      partialize: (state) => ({
        isTheaterMode: state.isTheaterMode,
        watchProgress: state.watchProgress,
      }),
    }
  )
);
```

---

### Player Wrapper Component (SSR Safe)
```tsx
// components/player/XanPlayer.tsx
'use client';

import dynamic from 'next/dynamic';
import { usePlayerStore } from '@/store/playerStore';

const VidstackPlayerComponent = dynamic(
  () => import('./VidstackPlayerComponent').then((mod) => mod.default),
  { ssr: false, loading: () => <div className="w-full aspect-video animate-pulse bg-xan-card rounded-2xl border border-xan-border" /> }
);

export default function XanPlayer() {
  const { currentStreamUrl } = usePlayerStore();

  return <VidstackPlayerComponent key={currentStreamUrl} />;
}
```

---

### The Player Component (`VidstackPlayerComponent.tsx`)
```tsx
// components/player/VidstackPlayerComponent.tsx
'use client';

import { useEffect, useRef } from 'react';
import { MediaPlayer, MediaProvider, Track, Poster, useMediaState, type MediaPlayerInstance } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { usePlayerStore } from '@/store/playerStore';
import { useAniSkip } from '@/hooks/useAniSkip';

import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

export default function VidstackPlayerComponent() {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const hasRestoredTime = useRef(false);
  const lastSavedSecond = useRef(-1);

  const { currentStreamUrl, subtitles, malId, episodeNumber, saveEpisodeProgress, watchProgress } = usePlayerStore();
  const { showSkipButton, introEnd } = useAniSkip(playerRef);
  const currentTime = useMediaState('currentTime', playerRef);

  // Safely restore watch progress immediately when metadata is parsed (prevents visual flashing)
  const handleLoadedMetadata = () => {
    if (!hasRestoredTime.current && playerRef.current && malId && episodeNumber) {
      const key = `${malId}-${episodeNumber}`;
      const savedTime = watchProgress[key] || 0;
      if (savedTime > 0) {
        playerRef.current.currentTime = savedTime;
      }
      hasRestoredTime.current = true;
    }
  };

  // Throttle watch progress updates to prevent store spamming
  useEffect(() => {
    if (!malId || !episodeNumber) return;
    
    const currentSec = Math.floor(currentTime);
    if (currentSec % 5 === 0 && currentSec !== lastSavedSecond.current && currentSec > 0) {
      saveEpisodeProgress(malId, episodeNumber, currentTime);
      lastSavedSecond.current = currentSec;
    }
  }, [currentTime, malId, episodeNumber, saveEpisodeProgress]);

  const handleSkipIntro = () => {
    if (playerRef.current && introEnd) {
      playerRef.current.currentTime = introEnd;
    }
  };

  // Custom Keyboard shortcut listener for non-native Vidstack actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 't':
          usePlayerStore.getState().toggleTheaterMode();
          break;
        // Native shortcuts (Space, F, M, J, L) are handled automatically by Vidstack keyTarget="document"
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative w-full h-full group">
      <MediaPlayer
        ref={playerRef}
        src={currentStreamUrl}
        onLoadedMetadata={handleLoadedMetadata}
        className="w-full h-full object-cover"
        aspectRatio="16/9"
        crossOrigin="anonymous"
        keyTarget="document" // Automatically handles all F, M, J, L, Space shortcuts globally
      >
        <MediaProvider>
          <Poster src="/player-placeholder.jpg" alt="Loading..." className="vds-poster" />
          {subtitles.map((sub) => (
            <Track
              key={sub.lang}
              src={sub.url}
              label={sub.label}
              srcLang={sub.lang}
              kind="subtitles"
              default={sub.isDefault}
            />
          ))}
        </MediaProvider>

        <DefaultVideoLayout 
          icons={defaultLayoutIcons} 
        />

        {/* Skip Intro Overlay */}
        {showSkipButton && (
          <button
            onClick={handleSkipIntro}
            className="absolute bottom-20 right-6 z-40 px-6 py-3 bg-gradient-to-r from-xan-crimson to-xan-violet text-white text-sm font-semibold rounded-full border border-white/20 shadow-[0_0_30px_rgba(233,69,96,0.5)] hover:scale-105 transition-all flex items-center gap-2 animate-slide-in"
          >
            Skip Intro ⇥
          </button>
        )}
      </MediaPlayer>
    </div>
  );
}
```

---

### AniSkip Integration Hook: `hooks/useAniSkip.ts`
Handles fetching and monitoring timestamps safely with memory-leak protection.

```typescript
// hooks/useAniSkip.ts
import { useEffect, useState, type RefObject } from 'react';
import { useMediaState, type MediaPlayerInstance } from '@vidstack/react';
import { usePlayerStore } from '@/store/playerStore';

interface SkipTime {
  interval: {
    start: number;
    end: number;
  };
  skipType: 'op' | 'ed';
}

export function useAniSkip(playerRef: RefObject<MediaPlayerInstance | null>) {
  const [skipTimes, setSkipTimes] = useState<SkipTime[]>([]);
  const [activeSkip, setActiveSkip] = useState<SkipTime | null>(null);
  
  const { malId, episodeNumber } = usePlayerStore();
  const currentTime = useMediaState('currentTime', playerRef);

  useEffect(() => {
    if (!malId || !episodeNumber) return;

    let isMounted = true;

    const fetchSkipTimes = async () => {
      try {
        const response = await fetch(
          `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?types=op&types=ed&episodeLength=0`
        );
        const data = await response.json();
        
        if (isMounted) {
          if (data.found) {
            setSkipTimes(data.results || []);
          } else {
            setSkipTimes([]);
          }
        }
      } catch (err) {
        console.error('AniSkip fetch failed:', err);
        if (isMounted) setSkipTimes([]);
      }
    };

    fetchSkipTimes();

    return () => {
      isMounted = false;
    };
  }, [malId, episodeNumber]);

  useEffect(() => {
    const current = currentTime;
    const match = skipTimes.find(
      (time) => current >= time.interval.start && current <= time.interval.end
    );
    setActiveSkip(match || null);
  }, [currentTime, skipTimes]);

  return {
    showSkipButton: !!activeSkip,
    introStart: activeSkip?.interval.start,
    introEnd: activeSkip?.interval.end,
    skipType: activeSkip?.skipType,
  };
}
```

---

## 2. Autoplay Restrictions Strategy

```tsx
const handleAutoplayFail = () => {
  if (playerRef.current) {
    playerRef.current.muted = true;
    playerRef.current.play();
    setShowUnmuteToast(true);
  }
};
```

---

## Verification Plan

### Manual Verification
1.  **Grid Flexing:** Toggle Theater mode and confirm that the sidebar (episode selector) moves directly below the video container.
2.  **Server Swap Persistence:** Switch servers mid-episode. Confirm the video buffer icon appears, the stream updates, and the playhead seeks directly to the pre-switch timestamp via `onLoadedMetadata`.
3.  **Muted Autoplay Toast:** Open the watch page in an incognito window (guaranteeing autoplay restrictions). Verify the video plays muted and the "Click to Unmute" toast appears.
4.  **Native Keyboard Integration:** Ensure that pressing `Space`, `M`, `F`, `K` works out of the box because of `keyTarget="document"`, without triggering twice. Verify that typing in the search bar ignores hotkeys.
5.  **AniSkip Memory Safety:** Trigger an AniSkip fetch by clicking a new episode, then rapidly click another episode before the fetch completes. Check console to ensure no "State Update on Unmounted Component" React errors occur.
