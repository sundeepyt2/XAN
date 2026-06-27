# Ultimate Verified Implementation Plan: YouTube-Like Video Player (Vidstack)

This document outlines the complete architectural design, data flows, and code patterns for integrating a YouTube-like custom video player into **XAN** (`https://xan-gamma.vercel.app/watch/[id]`) using **Vidstack**. 

The goal of this implementation is to provide a premium, buffer-free, and highly accessible user experience that matches industry leaders while remaining perfectly integrated into XAN's Tailwind CSS design system.

---

## 1. State Management Architecture

A modern video player requires robust state management to ensure that a user's progress is saved and that UI layout shifts (like Theater Mode) are synced globally across the application. We use **Zustand** combined with its `persist` middleware to achieve this safely.

### The Problem with Basic State
If we only store a single `savedTime` variable, watching Episode 2 would immediately overwrite the watch progress of Episode 1. If the user navigates back to Episode 1, their progress is lost.

### The Solution: Per-Episode Progress Maps
Instead of a single variable, we create a dictionary map (`watchProgress: Record<string, number>`) where the key is a combination of the anime's ID and the episode number (e.g., `147105-2`). This guarantees that every single episode on the platform maintains its own unique history in the browser's `localStorage`.

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
  
  // This object stores progress mapped specifically to an episode ID.
  // Example: { "147105-1": 1245.5, "147105-2": 45.2 }
  watchProgress: Record<string, number>; 
  
  setStream: (url: string, subtitles: Subtitle[], malId: number, episodeNumber: number) => void;
  saveEpisodeProgress: (malId: number, episodeNumber: number, progressTime: number) => void;
  toggleTheaterMode: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  // The 'persist' wrapper automatically synchronizes our chosen state variables with localStorage.
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

      // We dynamically update the specific key without destroying other saved episodes
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
      // partialize ensures we ONLY save layout preferences and history to local storage, 
      // preventing stale URLs from loading on app boot.
      partialize: (state) => ({
        isTheaterMode: state.isTheaterMode,
        watchProgress: state.watchProgress,
      }),
    }
  )
);
```

---

## 2. Dynamic Player Initialization (Bypassing SSR)

Vidstack interacts deeply with the browser's native DOM (video elements, fullscreen APIs, and media session APIs). Because Next.js renders on the server first, rendering Vidstack there causes "hydration mismatches" (the server HTML doesn't match the browser HTML). 

To solve this, we wrap the player in a `next/dynamic` import with `ssr: false`. We also pass `currentStreamUrl` as a React `key`. When the key changes, React completely destroys the old player instance and creates a fresh one, which is the safest way to prevent memory leaks or audio overlap when switching servers.

```tsx
// components/player/XanPlayer.tsx
'use client';

import dynamic from 'next/dynamic';
import { usePlayerStore } from '@/store/playerStore';

const VidstackPlayerComponent = dynamic(
  () => import('./VidstackPlayerComponent').then((mod) => mod.default),
  { 
    ssr: false, 
    // This displays a visually pleasing skeleton while the JS bundle downloads
    loading: () => <div className="w-full aspect-video animate-pulse bg-xan-card rounded-2xl border border-xan-border" /> 
  }
);

export default function XanPlayer() {
  const { currentStreamUrl } = usePlayerStore();

  return <VidstackPlayerComponent key={currentStreamUrl} />;
}
```

---

## 3. The Core Player Engine

The main player component coordinates video playback, subtitle tracks, watch history restoration, and keyboard shortcuts. 

### Why `onLoadedMetadata` for seeking?
If we try to restore the user's saved time immediately on render, the browser will throw an error because the video hasn't loaded its duration or timeline yet. We use `onLoadedMetadata` to precisely wait until the video timeline exists, but *before* the first frame is painted to the screen. This ensures a seamless jump without a visual glitch.

### Why Throttle State Saves?
We track `currentTime` dynamically. However, saving state to `localStorage` 60 times a second would severely degrade the browser's performance. The modulo operator logic (`currentSec % 5 === 0`) combined with `lastSavedSecond.current` guarantees that we only interact with the Zustand store exactly once every 5 seconds.

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
  
  // Custom hook that provides exactly when to show the "Skip Intro" button
  const { showSkipButton, introEnd } = useAniSkip(playerRef);
  
  // High-performance state subscription directly to the video's current playhead time
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

  // Performance Optimization: Throttle watch progress updates to prevent store spamming
  useEffect(() => {
    if (!malId || !episodeNumber) return;
    
    const currentSec = Math.floor(currentTime);
    if (currentSec % 5 === 0 && currentSec !== lastSavedSecond.current && currentSec > 0) {
      saveEpisodeProgress(malId, episodeNumber, currentTime);
      lastSavedSecond.current = currentSec;
    }
  }, [currentTime, malId, episodeNumber, saveEpisodeProgress]);

  // Jump the playhead forward when the user clicks "Skip Intro"
  const handleSkipIntro = () => {
    if (playerRef.current && introEnd) {
      playerRef.current.currentTime = introEnd;
    }
  };

  // Custom Keyboard shortcut listener for non-native Vidstack actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If the user is typing in the search bar, ignore hotkeys
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 't':
          // Toggle layout mode globally without relying on local stale state
          usePlayerStore.getState().toggleTheaterMode();
          break;
        // Note: Native shortcuts (Space, F, M, J, L) are handled automatically by Vidstack's keyTarget
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
        // keyTarget="document" tells Vidstack to intercept Space, J, L, F, M globally, 
        // perfectly mimicking YouTube's anywhere-on-page hotkey logic.
        keyTarget="document" 
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

        {/* Dynamic Skip Intro Overlay bounded by AniSkip timestamp calculations */}
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

## 4. Intelligent Intro Skipping (AniSkip)

The `useAniSkip` hook is designed to abstract away the complexity of fetching and managing timestamps from the AniSkip public database.

### Preventing Race Conditions
Because network requests take time, a user might click away to a new episode before the AniSkip API returns its data. If we try to update React state on an unmounted component, it causes a memory leak. The `isMounted` flag acts as a circuit breaker, safely throwing away network responses if the component is no longer active.

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

  // Network Fetch Lifecycle
  useEffect(() => {
    if (!malId || !episodeNumber) return;

    let isMounted = true; // Circuit breaker for memory leaks

    const fetchSkipTimes = async () => {
      try {
        // Appending &episodeLength=0 bypasses AniSkip's 400 Bad Request strict validation
        const response = await fetch(
          `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?types=op&types=ed&episodeLength=0`
        );
        const data = await response.json();
        
        // Only update state if the user hasn't already clicked away
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
      // If the component unmounts, trip the circuit breaker
      isMounted = false;
    };
  }, [malId, episodeNumber]);

  // Timestamp Collision Detection
  useEffect(() => {
    const current = currentTime;
    // Check if the video's current playhead is inside any known intro/outro bounds
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

## 5. Safely Overcoming Browser Autoplay Restrictions

Modern web browsers (especially Safari and Chrome) implement strict policies that block video from playing automatically if it has sound and the user hasn't interacted with the website yet.

### The Fallback Matrix
Instead of failing silently, we can implement an intuitive fallback:
1. Attempt to autoplay with audio as requested.
2. If the browser kills the play request (`autoplay-fail` event), we instantly mute the player.
3. Browsers *do* allow muted video to autoplay. We restart the video muted.
4. We display a stylized toast popup prompting the user to "Click to Unmute", preserving the flow.

*(Implementation Note: Vidstack automatically attempts this internally on some devices, but if a custom fallback is desired, it can be hooked into `onAutoplayFail` on the `MediaPlayer`).*

---

## 6. Adaptive Bitrate Streaming (ABR) & HLS Configuration

An optimal anime viewing experience requires adapting the resolution to the user's current internet speeds without buffering. Vidstack handles this by parsing HLS manifests (`.m3u8`) and orchestrating media downloads under the hood.

### ABR Mechanics
When Vidstack detects an HLS stream, it reads the master playlist which references multiple video quality directories (e.g., 1080p, 720p, 480p). 
* **Dynamic Downscaling:** If the network bandwidth drops below a quality segment's threshold, Vidstack automatically swaps to the next lower resolution in the buffer queue.
* **Seamless Swaps:** HLS aligns video segments at exact Keyframes. This allows the player to swap resolutions mid-playback without stuttering or audio desynchronization.

### Configuring Custom HLS Settings
We can configure custom properties (like max buffer length or retry policies) on the `<MediaPlayer>` component to optimize playback for slower connections:

```tsx
<MediaPlayer
  ref={playerRef}
  src={currentStreamUrl}
  // Passing options directly to hls.js under the hood
  hls={{
    config: {
      maxMaxBufferLength: 30, // Limit buffer ahead of playhead to 30s to conserve data
      enableWorker: true,    // Run HLS decoding in a separate web worker thread to prevent UI thread lag
      lowLatencyMode: false, // Standard streaming (low-latency is unnecessary for pre-recorded media)
    }
  }}
  ...
/>
```

---

## 7. Styling & Theme Engine Customization (Tailwind Integration)

Vidstack uses standard custom CSS variables to control the theme properties of the layout templates. This makes styling the player to match XAN's Crimson accent theme straightforward.

### Applying XAN Color Palette
We override the CSS variable tokens inside our global stylesheet (`app/globals.css`) or inside a local CSS utility layout to apply the `#e94560` (xan-crimson) branding:

```css
@layer utilities {
  .vds-video-layout {
    /* Accent brand colors */
    --video-brand: #e94560;                  /* Seekbar filled track, active buttons */
    --video-focus: rgba(233, 69, 96, 0.4);   /* Ring outlines for keyboards focus elements */
    
    /* Backgrounds & Borders matching XAN cards */
    --video-bg: rgba(15, 15, 26, 0.95);      /* Settings menus matching xan-card background */
    --video-border: rgba(255, 255, 255, 0.1);/* Thin borders */
    
    /* Font family overrides to Nunito/Outfit */
    --video-font-family: var(--font-nunito), sans-serif;
  }
}
```

This layout automatically adapts to mobile viewports, restructuring menus into bottom drawers and enlarging trigger tap boxes.

---

## 8. OS Lock Screen Controls & Media Session API

To make XAN feel like a native streaming app, we must hook into the user's OS media controls (such as keyboards with media buttons, mobile lock screens, and Bluetooth devices). 

### How Media Session Works
Vidstack natively exposes hook connections to the browser's `navigator.mediaSession` APIs. When the player starts loading an episode, we sync the anime's title, episode number, and cover art so it displays on the user's system screen overlay.

### Synchronizing Metadata
We configure this dynamically in a custom React effect inside the player container:

```typescript
useEffect(() => {
  if (!playerRef.current || !malId || !episodeNumber) return;

  const player = playerRef.current;
  
  // Set Media Session metadata once playback starts
  const updateMediaSession = () => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Episode ${episodeNumber}`,
        artist: 'XAN Stream',
        album: `Anime ID: ${malId}`,
        artwork: [
          { src: '/player-placeholder.jpg', sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      // Hook up physical lock-screen buttons to trigger player actions
      navigator.mediaSession.setActionHandler('play', () => player.play());
      navigator.mediaSession.setActionHandler('pause', () => player.pause());
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        player.currentTime = Math.max(0, player.currentTime - (details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        player.currentTime = Math.min(player.state.duration, player.currentTime + (details.seekOffset || 10));
      });
    }
  };

  player.on('play', updateMediaSession);
  
  return () => {
    player.off('play', updateMediaSession);
  };
}, [malId, episodeNumber]);
```

---

## 9. Robust Error Handling & Stream Recovery

In online streaming, source manifests (`.m3u8`) can fail to load due to outdated CDN tokens, network timeouts, or server-side changes. A user-friendly player must gracefully capture these errors and offer options rather than crashing.

### Vidstack Error Hooks
Vidstack provides standard event bindings to intercept playback failures:
* `onError`: Fired when a network asset or video decoding fails.
* `onHlsError`: Fired specifically during adaptive bitrate fragment loading errors.

### Recovery Strategy
1. **Detect loading error:** If a video load fails, we catch the event.
2. **Display visual indicator:** Render a beautiful, glassmorphic toast notification directly over the black player container.
3. **Offer manual resolution:** Display retry buttons and prompt the user to:
   * *Try again* (re-requests the URL).
   * *Switch servers* (highlights the server switcher component underneath).

```tsx
const handlePlaybackError = (event: any) => {
  console.error('Video Playback Error:', event);
  // Show localized error overlay
  setPlaybackError('The video stream failed to load. Please try switching servers below.');
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
6.  **Media Session:** Play an episode, lock your computer/mobile screen, and verify that the lock screen displays the correct metadata and controls seek operations properly.
