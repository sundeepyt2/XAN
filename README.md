<div align="center">

# 🎬 XAN

### Stream anime without the noise.

A modern, full-featured anime streaming web app built with Next.js 16, TypeScript, Tailwind CSS v4, and shadcn/ui. Powered by AniList + AllAnime APIs.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![shadcn/ui](https://img.shields.io/badge/shadcn/ui-latest-black?style=for-the-badge)](https://ui.shadcn.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## ✨ Features

### 🎯 Core Experience
- **🎬 Real HLS Video Playback** — Custom video player with hls.js, custom controls, fullscreen, seek, mute
- **🔍 Powerful Search** — Debounced search with genre/sort/format filters and pagination
- **📺 Trending & Popular** — Real-time trending and popular anime from AniList
- **📂 Browse by Genre** — 20+ genres with instant tab switching
- **👤 Anime Details** — Full info pages with synopsis, characters, relations, recommendations
- **📺 Episode Lists** — Searchable episode grids with direct watch links
- **🕐 Watch History** — LocalStorage-based history with progress bars and "Continue Watching"
- **🎨 Beautiful UI** — Dark theme with crimson→violet gradients, smooth animations, responsive design

### 🔌 Multi-API Integration
- **AniList GraphQL** — Primary metadata source (trending, popular, search, details, characters)
- **AllAnime GraphQL** — Cross-reference + episode availability (sub/dub/raw counts)
- **Manual Cloudflare Verification** — Settings page to enable real AllAnime streams

### 🛡️ Defensive Engineering (24+ bug-prevention patterns)
- ✅ Zod runtime validation on every API response
- ✅ Bounded retry with `AbortController` (10s timeout, max 1 retry)
- ✅ Per-item `safeParse()` — skip bad items, don't crash
- ✅ SSR-safe `localStorage` hooks (`typeof window` guards)
- ✅ Next.js 15+ async params (`await params`)
- ✅ Suspense boundaries around every async Server Component
- ✅ `useEffect` cleanup for all listeners/timers
- ✅ HTML sanitization for AniList descriptions
- ✅ Sandboxed YouTube iframes
- ✅ `<html suppressHydrationWarning>` for next-themes
- ✅ `images.remotePatterns` (not deprecated `domains`)
- ✅ `motion/react` imports (not `framer-motion`)
- ✅ Tailwind v4 `@theme` (no config file)

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** or **Bun** (recommended)
- **npm** / **bun** / **pnpm** / **yarn**

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/xan.git
cd xan

# Install dependencies
bun install  # or npm install

# Copy environment template
cp .env.example .env.local

# Start the dev server
bun run dev  # or npm run dev
```

Visit **http://localhost:3000** 🎉

### First Run
1. **Landing page** → press `Enter` or click "Start Watching"
2. **Home page** → browse trending, popular, and genre sections
3. **Watch page** → click any anime → "Watch Now" → plays demo HLS stream
4. **Settings** → verify AllAnime to enable real episode streams (see below)

---

## ⚙️ Configuration

### Environment Variables (`.env.local`)

```bash
# REQUIRED: Backend URL (stream proxy)
# Points to XAN's built-in stream proxy by default.
# The proxy tries AllAnime first, then Consumet, then demo HLS.
NEXT_PUBLIC_BACKEND_URL="http://localhost:3000/api"

# OPTIONAL: Consumet API instance (for real anime streaming)
# Self-host Consumet: https://github.com/consumet/api.consumet.org
# ⚠️ The public api.consumet.org is DEAD (HTTP 451). Must self-host.
# CONSUMET_URL="https://your-consumet-instance.com"
```

### AllAnime Stream Verification

To enable **real anime episode playback** (not demo streams):

1. Visit `/settings` in your XAN instance
2. Click **"Open AllAnime"** → solves Cloudflare challenge in new tab
3. Open DevTools (F12) → Console → run:
   ```js
   document.cookie.split(';').find(c => c.includes('cf_clearance')).split('=')[1]
   ```
4. Copy the `cf_clearance` value
5. Paste into `/settings` → click **"Save & Test"**

> ⚠️ **Important:** The `cf_clearance` cookie is **IP-bound**. For this to work, your browser and the XAN server must share the same outbound IP (i.e., run XAN locally). The settings page includes diagnostics to detect IP mismatches.

---

## 📁 Project Structure

```
xan/
├── 📂 src/
│   ├── 📂 app/
│   │   ├── 📂 (app)/                 # App router group (with Navbar + Footer)
│   │   │   ├── 📂 home/              # Home page (trending + popular + genres)
│   │   │   ├── 📂 anime/[id]/        # Anime detail page (async params)
│   │   │   ├── 📂 watch/[id]/        # Watch page (HLS player + episodes)
│   │   │   ├── 📂 search/            # Search with filters + pagination
│   │   │   ├── 📂 trending/          # Full trending list
│   │   │   ├── 📂 history/           # Watch history (localStorage)
│   │   │   └── 📂 settings/          # AllAnime CF verification
│   │   ├── 📂 api/
│   │   │   ├── 📂 stream/[id]/[ep]/  # Stream proxy (3-tier fallback)
│   │   │   ├── 📂 allanime/          # AllAnime search proxy
│   │   │   ├── 📂 cf/                # CF cookie management (status/save/test/clear)
│   │   │   ├── 📂 genre/             # Genre filter proxy
│   │   │   └── 📂 search/            # Search proxy
│   │   ├── layout.tsx                # Root layout (fonts, ThemeProvider)
│   │   ├── page.tsx                  # Landing page
│   │   ├── globals.css               # Tailwind v4 @theme tokens
│   │   ├── error.tsx                 # Global error boundary
│   │   ├── not-found.tsx             # 404 page
│   │   └── loading.tsx               # Loading skeleton
│   ├── 📂 components/
│   │   ├── 📂 landing/               # LandingHero (motion + useRouter)
│   │   ├── 📂 layout/                # Navbar (scroll-aware) + Footer
│   │   ├── 📂 cards/                 # AnimeCard + AnimeCardSkeleton
│   │   ├── 📂 home/                  # TrendingCarousel, PopularGrid, ContinueWatching, CategoryTabs
│   │   ├── 📂 anime/                 # AnimeHero, AnimeInfo, EpisodeGrid, CharacterList, RelatedAnime
│   │   ├── 📂 watch/                 # VideoPlayer, StreamPlayer, EpisodePanel, VerificationBadge
│   │   ├── 📂 allanime/              # AllAnimeCrossReference
│   │   ├── 📂 search/                # SearchBar, FilterPanel
│   │   ├── 📂 ui/                    # shadcn/ui components
│   │   ├── ErrorBoundary.tsx         # Per-section error isolation
│   │   ├── ErrorCard.tsx             # Error fallback UI
│   │   └── theme-provider.tsx        # next-themes wrapper
│   ├── 📂 hooks/
│   │   ├── useWatchHistory.ts        # SSR-safe localStorage history
│   │   ├── useDebounce.ts            # 400ms debounce
│   │   └── useMediaQuery.ts          # SSR-safe media queries
│   ├── 📂 lib/
│   │   ├── anilist.ts                # AniList GraphQL client (bounded retry + AbortController)
│   │   ├── anilist-queries.ts        # GraphQL query strings
│   │   ├── allanime.ts               # AllAnime GraphQL client (CF-aware)
│   │   ├── consumet.ts               # Consumet two-step client (info → watch)
│   │   ├── backend.ts                # Backend stream client
│   │   ├── cf-cookie-store.ts        # Persistent CF cookie storage
│   │   ├── constants.ts              # Genres, sort options, formats
│   │   └── utils.ts                  # cn() helper
│   └── 📂 types/
│       └── anime.ts                  # Zod schemas + helpers
├── 📂 public/
│   └── placeholder-card.png          # Fallback cover image
├── 📂 scripts/
│   └── make-placeholder.ts           # Placeholder image generator
├── .env.example
├── .env.local                        # (gitignored)
├── next.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 🎨 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | React framework with RSC |
| **Language** | TypeScript 5 (strict) | Type safety |
| **Styling** | Tailwind CSS v4 | Utility-first CSS (`@theme` tokens) |
| **UI Library** | shadcn/ui | Accessible components |
| **Animations** | Motion (`motion/react`) | Page + card animations |
| **Video** | hls.js + native `<video>` | HLS playback |
| **Validation** | Zod | Runtime API validation |
| **Icons** | Lucide React | SVG icons |
| **Theme** | next-themes | Dark/light mode |
| **Metadata API** | AniList GraphQL | Trending, popular, search, details |
| **Stream API** | AllAnime GraphQL | Episode availability + streams |
| **Fonts** | Nunito + Inter + Outfit | Display + body + sans |

---

## 🧠 Architecture

### Stream Resolution (3-tier fallback)

```
User clicks "Watch Episode 1"
         │
         ▼
┌─────────────────────────────────┐
│ 1. Server-Side AllAnime Proxy   │  ← Uses stored cf_clearance cookie
│    /api/stream/[id]/[ep]        │     (works if server IP = browser IP)
└─────────────────────────────────┘
         │ fails (CF 403)
         ▼
┌─────────────────────────────────┐
│ 2. Client-Side AllAnime Fetch   │  ← Browser fetches directly
│    VideoPlayer.tsx              │     (works if CORS allows)
└─────────────────────────────────┘
         │ fails (CORS block)
         ▼
┌─────────────────────────────────┐
│ 3. Demo HLS Stream              │  ← Always works (public test streams)
│    Mux + Apple BipBop           │
└─────────────────────────────────┘
```

### Server/Client Component Directives

Every file is explicitly marked `"use client"` or Server Component:

| Component | Directive | Why |
|-----------|-----------|-----|
| `app/layout.tsx` | Server | Fonts, ThemeProvider wrapper |
| `app/page.tsx` | `"use client"` | motion, useRouter |
| `app/error.tsx` | `"use client"` | Next.js requirement |
| `(app)/home/page.tsx` | Server (async) | Fetches data with `await` |
| `(app)/anime/[id]/page.tsx` | Server (async) | `await params`, `generateMetadata` |
| `(app)/watch/[id]/page.tsx` | `"use client"` | Player, localStorage |
| `(app)/search/page.tsx` | `"use client"` | useState, useSearchParams |
| `LandingHero.tsx` | `"use client"` | motion, useEffect |
| `Navbar.tsx` | `"use client"` | scroll listener, state |
| `AnimeCard.tsx` | `"use client"` | motion hover |
| `ErrorBoundary.tsx` | `"use client"` | Class component |

---

## 🔧 API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/stream/[id]/[ep]` | GET | Stream proxy (3-tier fallback) |
| `/api/allanime` | GET | AllAnime search proxy |
| `/api/genre` | GET | Genre filter proxy |
| `/api/search` | GET | Search proxy |
| `/api/cf/status` | GET | Check CF cookie status |
| `/api/cf/save` | POST | Save cf_clearance cookie |
| `/api/cf/test` | POST | Test cookie against AllAnime |
| `/api/cf/clear` | POST | Remove stored cookie |
| `/api/cf/diagnostics` | GET | Full diagnostic info (IPs, UA, etc.) |

---

## 🐛 Bug Prevention (24+ patterns)

This project was built following a 24-point bug audit. Key patterns:

<details>
<summary><strong>📋 View all 24 bug-prevention patterns</strong></summary>

| # | Bug | Fix |
|---|-----|-----|
| 1 | `framer-motion` renamed | Use `motion` package, import from `motion/react` |
| 2 | Tailwind v4 has no config file | Use CSS `@theme` directive |
| 3 | API retry infinite recursion | `MAX_RETRIES = 1` with counter |
| 4 | `error.tsx` missing `"use client"` | Added directive |
| 5 | Landing page missing `"use client"` | Added directive |
| 6 | Vidstack pinned to wrong version | Use hls.js instead |
| 7 | No Server/Client annotations | Full directive map |
| 8 | Mermaid cross-subgraph edges | Refactored to flat nodes |
| 9 | Missing Outfit font | Added to font list |
| 10 | Missing contentEditable check | Added to keyboard handler |
| 11 | Wrong animation plugin | Use `tw-animate-css` |
| 12 | components.json missing config | Added complete config |
| 13 | Missing placeholder image | Generated `placeholder-card.png` |
| 14 | Missing `suppressHydrationWarning` | Added to `<html>` |
| 15 | `images.domains` deprecated | Use `remotePatterns` |
| 16 | `localStorage` during SSR | `typeof window` guard + `useEffect` |
| 17 | Next.js 15 params are Promises | `await params` pattern |
| 18 | No `AbortController` | 10s timeout with abort |
| 19 | Missing `useEffect` cleanup | `return () => removeEventListener(...)` |
| 20 | AniList description has HTML | `sanitizeDescription()` helper |
| 21 | Missing Suspense boundaries | Wrapped every async section |
| 22 | YouTube iframe missing sandbox | Added `sandbox` attribute |
| 23 | Missing placeholder image | Generated and referenced |
| 24 | Project init unclear | Exact `create-next-app` command |

</details>

---

## 📱 Pages & Routes

| Route | Type | Description |
|-------|------|-------------|
| `/` | Client | Landing page (animated hero, Enter key shortcut) |
| `/home` | Server (async) | Home (Continue Watching, Trending, Popular, Browse by Genre) |
| `/anime/[id]` | Server (async) | Anime detail (hero, info, episodes, characters, relations) |
| `/watch/[id]?ep=N` | Client | Watch page (HLS player, episode panel, history) |
| `/search?q=...` | Client | Search with genre/sort/format filters + pagination |
| `/trending` | Server (async) | Full trending list with pagination |
| `/history` | Client | Watch history (localStorage, progress bars) |
| `/settings` | Client | AllAnime CF verification + diagnostics |

---

## 🎯 Key Features Deep Dive

### 🎬 Video Player
- Native `<video>` + `hls.js` for cross-browser HLS support
- Custom controls: play/pause, seek bar, mute, fullscreen, time display
- Loading spinner, error overlay, center play button
- Falls back to native HLS for Safari
- 3-tier stream resolution (server → client → demo)

### 🔍 Search
- 400ms debounce (via `useDebounce` hook)
- URL-synced query params (shareable search links)
- Genre multi-select, sort options, format filter
- Pagination with `hasNextPage` support
- Empty state with helpful message

### 📺 Watch History
- SSR-safe `useWatchHistory` hook (`typeof window` guards)
- Progress bars (timestamp / duration)
- "Continue Watching" section on home page
- Per-item remove + clear all
- Sorted by `updatedAt` (most recent first)
- Max 50 entries (auto-trimmed)

### 🛡️ Error Handling
- Per-section `ErrorBoundary` (one failure doesn't break the page)
- Global `error.tsx` with retry button
- Custom 404 page
- Loading skeletons for every async section
- Graceful API failure (null return → empty state)

---

## 🚀 Deployment

### Vercel (recommended)
1. Push to GitHub
2. Import to [Vercel](https://vercel.com)
3. Add env vars (see `.env.example`)
4. Deploy

### Self-host
```bash
bun run build
bun run start
```

### Docker
```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
EXPOSE 3000
CMD ["bun", "run", "start"]
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development
```bash
bun run lint      # ESLint
bun run typecheck # TypeScript check
bun run dev       # Dev server
```

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **[AniList](https://anilist.co)** — Anime metadata API
- **[AllAnime](https://allmanga.to)** — Episode availability + streams
- **[Jikan](https://jikan.moe)** — MyAnimeList API (optional, not currently used)
- **[shadcn/ui](https://ui.shadcn.com)** — UI components
- **[hls.js](https://github.com/video-dev/hls.js)** — HLS playback
- **[Motion](https://motion.dev)** — Animations
- **[Lucide](https://lucide.dev)** — Icons

---

## ⚠️ Disclaimer

XAN is for educational purposes only. The project demonstrates:
- Next.js 16 App Router patterns
- Server/Client Component directives
- Defensive coding practices
- Multi-API integration
- HLS video playback
- Cloudflare verification flows

**Users are responsible for complying with their local laws and the terms of service of any third-party APIs used.** The maintainers do not host or stream any content. All streaming is performed via third-party APIs (AniList, AllAnime) and the user is responsible for verifying they have the right to access such content in their jurisdiction.

---

<div align="center">

**Built with ❤️ and the AniList + AllAnime APIs**

[Report Bug](../../issues) · [Request Feature](../../issues) · [⬆ Back to Top](#-xan)

</div>
