# Detailed Analysis & Implementation Plan: YouTube-Like Custom Anime Video Player for XAN

This document provides a comprehensive, deep-dive analysis and architectural plan for building a state-of-the-art, YouTube-like custom video player for the XAN anime streaming platform. 

The goal is to merge the familiarity and robust UX of YouTube with the specialized features required by the anime streaming community.

---

## 1. UX/UI Analysis: Why a "YouTube-Like" Player?

### The Psychology of the Layout
YouTube has spent billions refining their video player. Users have built deep muscle memory around its interactions. By adopting this layout, we remove the learning curve for XAN users.

*   **Bottom-Heavy Controls:** Keeping all controls at the bottom ensures the video itself remains the focal point.
*   **The Scrubbing Experience:** YouTube's progress bar is arguably the best in the industry. It provides a massive hit area for scrubbing without obscuring the video. The visual feedback (thin line expanding on hover) is critical.
*   **Settings Consolidation:** Grouping Quality, Speed, and Subtitles into a single, nested "Gear" menu keeps the interface clean while retaining power-user features.

### Adapting it for Anime (The "XAN" Touch)
While the core layout will mimic YouTube, we must inject features specific to anime watchers:
*   **Next Episode vs. Next Video:** Instead of a generic "Next" button, we need a "Next Episode" button that clearly transitions the state of the parent page.
*   **Intro/Outro Skipping:** Anime has highly structured Openings (OP) and Endings (ED). A dynamic "Skip Intro" button is mandatory.
*   **Subtitle Superiority:** Anime heavily relies on subtitles. We need a robust Subtitle Settings menu (Font size, Color, Background opacity, Sync delay).
*   **Server Switching:** Often, anime sources can be unstable. We need a seamless way to switch servers (e.g., from 'Vidstreaming' to 'Megacloud') without losing the current timestamp.

---

## 2. Component Architecture & Detailed Layout

We will build the player using **React/Next.js** and **Vidstack (`@vidstack/react`)**. Vidstack is chosen because it provides completely unstyled, highly accessible player primitives that allow us to build a 1:1 YouTube clone much faster and more reliably than writing everything from scratch over the native HTML5 `<video>` element.

### Core Component: `<XanPlayer />`
This is the root wrapper. It manages the HLS provider, global player state (playing, buffering, current time), and context.

### The UI Layers (Z-Index Hierarchy)

````carousel
### Layer 1: The Video Surface (Immersive)
- **Component:** `<VideoProvider />` (Vidstack)
- **Function:** Renders the actual video element. Handles HLS streaming, loading the `.m3u8` manifest.
- **Interactions:** 
  - Single Click: Play / Pause (shows a quick ping animation).
  - Double Tap Left/Right (Mobile): Seek -10s / +10s.
  - Swipe Up/Down (Mobile): Volume / Brightness.

<!-- slide -->
### Layer 2: Contextual Overlays (Dynamic)
- **Component:** `<OverlayManager />`
- **Elements:**
  - **Play/Pause Ping:** A circular icon that scales up and fades out in the center of the screen when playback state changes.
  - **Skip Intro Button:** A pill-shaped button (`Skip Intro ⇥`) appearing at the bottom right. Triggered by comparing `currentTime` against AniSkip API timestamps.
  - **Up Next Screen:** Darkens the video when 10 seconds are left. Shows the thumbnail, title of the next episode, and a circular countdown timer.

<!-- slide -->
### Layer 3: The Control Bar (The YouTube Layout)
- **Component:** `<Controls />`
- **Visibility:** Visible on hover, or when paused. Slides up from the bottom. Features a dark-to-transparent CSS gradient background to ensure visibility against light anime scenes.
````

### Detailed Breakdown of the Control Bar

*   **Top Row:** The Progress Scrubber.
    *   **Inactive State:** 3px tall red line.
    *   **Hover State:** Expands to 5px tall. A scrubber knob appears.
    *   **Tooltips:** Hovering over the bar shows a timestamp and (if implemented) a preview thumbnail sprite.
    *   **Buffered Data:** Shown as a light gray background behind the red progress line.
*   **Bottom Row (Left Side):**
    *   **Play/Pause Button:** SVGs swapping based on state.
    *   **Next Episode Button:** Skips to the next episode in the queue.
    *   **Volume Control:** An icon that changes based on level (Muted, Low, High). Hovering reveals a horizontal range slider to precisely adjust volume.
    *   **Time Display:** Format: `[Current Time] / [Total Time]` (e.g., `12:34 / 24:00`).
*   **Bottom Row (Right Side):**
    *   **Auto-Play Toggle:** A toggle switch for "Autoplay next episode".
    *   **Captions (CC):** Toggles subtitles on/off. Shows a red underline when active.
    *   **Settings (Gear Icon):** Opens the `<SettingsMenu />`.
    *   **Miniplayer (PiP):** Triggers browser Picture-in-Picture.
    *   **Theater Mode:** Expands the player width to 100vw, pushing the rest of the app content down.
    *   **Fullscreen:** Triggers native fullscreen API.

### The Settings Menu (Nested Architecture)
To perfectly mimic YouTube, the Settings menu operates with a "Main Menu" that slides horizontally into "Sub Menus".

1.  **Main Menu Options:**
    *   `Quality` (Current: Auto) -> Opens Quality Sub-Menu
    *   `Subtitles/CC` (Current: English) -> Opens Subtitles Sub-Menu
    *   `Playback Speed` (Current: Normal) -> Opens Speed Sub-Menu
2.  **Quality Sub-Menu:** Lists available HLS resolutions (e.g., 1080p, 720p, 480p, Auto).
3.  **Subtitles Sub-Menu:** Lists available languages. Includes an "Options" button that opens a third-level menu for font styling (Size, Color, Background).

---

## 3. Technological Implementation & Data Flow

### Dependencies
```json
{
  "dependencies": {
    "@vidstack/react": "^1.0.0", // Core player framework
    "hls.js": "^1.5.0",          // Adaptive streaming engine
    "lucide-react": "^0.300.0",  // For consistent, clean SVG icons
    "zustand": "^4.5.0"          // Lightweight state management (optional, for cross-component state)
  }
}
```

### 1. Handling the Video Stream (HLS)
The player must receive an `.m3u8` manifest file. 
*   **Vidstack's `<MediaProvider>`** will automatically detect the HLS URL and instantiate `hls.js` under the hood.
*   We will hook into the `hls.js` events to populate the Quality Settings menu dynamically based on the available bitrates in the manifest.

### 2. The AniSkip Integration (Skip Intro)
To make the "Skip Intro" button work seamlessly:
1.  **Data Fetching:** When the video loads, we query the AniSkip API using the anime's MAL ID and the current episode number.
2.  **Data Structure:** We receive an array of timestamps: `[{ type: "op", start: 120, end: 210 }, { type: "ed", start: 1300, end: 1420 }]`.
3.  **Time Tracking:** Inside the player component, we listen to the `onTimeUpdate` event.
4.  **Trigger:** If `currentTime` falls within the `start` and `end` window of an "op", we mount the `<SkipButton />`. Clicking it sets `currentTime` to `end`.

### 3. Subtitles (WebVTT)
*   Subtitles will be loaded as `<track>` elements inside the video provider.
*   We will use standard WebVTT format.
*   To support custom styling (via the Settings Menu), we will inject CSS variables to override the native `::cue` pseudo-element.

```css
/* Example of how we style the native WebVTT cues based on user settings */
::cue {
  color: var(--subtitle-color, #ffffff);
  background-color: var(--subtitle-bg, rgba(0, 0, 0, 0.8));
  font-size: var(--subtitle-size, 1.2rem);
  font-family: 'Inter', sans-serif;
}
```

### 4. Saving User Preferences
We will create a custom hook `usePlayerSettings()` that syncs with `localStorage`.
*   Saved metrics: `volume`, `muted`, `qualityPreference` (e.g., always try 1080p first), `theaterMode`, `autoPlay`.
*   Watch Progress: We will throttle saving the `currentTime` to `localStorage` (and the backend database, if applicable) every 5 seconds. On load, if a saved timestamp exists, we prompt "Resume from XX:XX?".

---

## 4. Keyboard Navigation Matrix

A true YouTube clone requires exhaustive keyboard support. We will implement global event listeners when the player is in focus.

| Key | Action | Implementation Detail |
| :--- | :--- | :--- |
| `Space` / `k` | Play / Pause | Prevents default scrolling behavior. |
| `j` | Seek Backward 10s | `currentTime = Math.max(0, currentTime - 10)` |
| `l` | Seek Forward 10s | `currentTime = Math.min(duration, currentTime + 10)` |
| `Left Arrow` | Seek Backward 5s | Same logic as `j` |
| `Right Arrow` | Seek Forward 5s | Same logic as `l` |
| `Up Arrow` | Volume Up 5% | `volume = Math.min(1, volume + 0.05)` |
| `Down Arrow` | Volume Down 5% | `volume = Math.max(0, volume - 0.05)` |
| `f` | Fullscreen | Toggles native Fullscreen API |
| `t` | Theater Mode | Toggles a boolean state that alters the parent layout CSS |
| `m` | Mute | Toggles `muted` state |
| `c` | Captions | Cycles through available subtitle tracks |

---

## User Review Required

> [!IMPORTANT]
> **1. Vidstack vs. Custom Build:**
> This plan heavily relies on adopting **Vidstack**. Building a YouTube layout entirely from scratch (handling all the complex math for the scrubber hover states, fullscreen API quirks, and HLS quality parsing) is extremely time-consuming. Vidstack handles the complex math and APIs, letting us focus solely on the CSS/Layout to make it look exactly like YouTube. Do you approve of using the `@vidstack/react` library?
>
> **2. Subtitle Approach:**
> We are prioritizing WebVTT for subtitles as it is natively supported and highly performant. If your video sources provide complex `.ass` subtitles, we will need a much heavier WASM-based renderer (like `jassub`). Are standard WebVTT subtitles sufficient for now?

## Open Questions

> [!WARNING]
> **1. Scrubber Thumbnails:** To show preview images when hovering over the progress bar (like YouTube), we need a VTT sprite sheet generated by your backend. Should we plan for this feature now, or skip it for MVP?
>
> **2. Analytics:** Do you need to track watch time analytics (e.g., "User X watched 80% of Episode Y") to trigger a "Completed" status on their profile? If so, we need to map out the API calls for that.

---

## Verification Plan

### Automated Tests
1.  **Component Rendering:** Ensure `<XanPlayer />` and its sub-components render without crashing.
2.  **State Logic:** Test that the `usePlayerSettings` hook correctly reads/writes to `localStorage`.

### Manual Verification
1.  **The "YouTube" Feel:** Side-by-side comparison with YouTube. The scrubber expansion on hover, the menu animations, and the central play/pause ping must feel identical.
2.  **HLS Quality Switch:** Manually switch from Auto to 1080p, then to 480p, and verify the video stream changes without breaking.
3.  **Keyboard Matrix:** Press every key defined in the Keyboard Matrix and verify the exact expected behavior.
4.  **AniSkip Flow:** Load an episode with known OP/ED times. Verify the button appears exactly on time, and clicking it seeks exactly to the end of the OP/ED.
5.  **Theater Mode:** Toggle Theater Mode and ensure the layout correctly expands while maintaining aspect ratio, and pushing other page content down appropriately.
