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
- **🎬 Real HLS/MP4 Video Playback** — Custom video player with hls.js, YouTube-style controls, fullscreen, seek, mute, keyboard shortcuts
- **🔍 Powerful Search** — Debounced search with genre/sort/format filters and pagination
- **📺 Trending & Popular** — Real-time trending and popular anime from AniList
- **📂 Browse by Genre** — 20+ genres with instant tab switching
- **👤 Anime Details** — Full info pages with synopsis, characters, relations, recommendations
- **📺 Episode Lists** — Searchable episode grids with direct watch links
- **🕐 Watch History** — LocalStorage-based history with progress bars and "Continue Watching"
- **🎨 Beautiful UI** — Dark theme with crimson→violet gradients, smooth animations, responsive design
- **🔊 Sub/Dub Toggle** — Automatic fallback from dub to sub when dub is unavailable

### 🔌 Multi-API Integration
- **AniList GraphQL** — Primary metadata source (trending, popular, search, details, characters)
- **AllAnime (mkissa.to)** — Episode sources via direct crypto signing (reverse-engineered, no browser needed)
- **Multi-Provider** — AllAnime, Zen, Koto, AnimePahe, Gogoanime — with per-source on/off toggles

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
- **Node.js 22+** or **Bun** (recommended)
- **npm** / **bun** / **pnpm** / **yarn**

### Installation

```bash
# Clone the repo
git clone https://github.com/sundeepyt2/XAN.git
cd xan

# Install dependencies
bun install  # or: npm install --legacy-peer-deps

# Copy environment template
cp .env.example .env.local

# Start the dev server
bun run dev  # or: npm run dev
```

Visit **http://localhost:3000** 🎉

### First Run
1. **Landing page** → press `Enter` or click "Start Watching"
2. **Home page** → browse trending, popular, and genre sections
3. **Watch page** → click any anime → "Watch Now" → plays in custom video player
4. **Settings** → configure stream providers, bandwidth mode, source toggles

---

## ⚙️ Configuration

### Environment Variables (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CF_WORKER_URL` | **Yes** (for AllAnime) | Cloudflare Worker URL — handles AllAnime crypto + stream proxying. Deploy via GitHub Actions (see below). |
| `NEXT_PUBLIC_FREE_SOLVER_URL` | No | Alternative free solver URL (local + tunnel, Render.com, or Oracle Cloud). Takes precedence over CF Worker if set. |
| `CONSUMET_URL` | No | Self-hosted Consumet API instance for additional stream sources |
| `DATABASE_URL` | No | SQLite database path (defaults to `file:./db/custom.db`) |

### AllAnime Episode Sources — How It Works

As of mid-2026, AllAnime migrated to a new frontend (`mkissa.to`) with a new crypto scheme. The old `allmanga.to` API returns `AA_CRYPTO_MISSING` for episode queries. XAN handles this via a **Cloudflare Worker** that implements AllAnime's crypto directly:

1. Worker fetches `__aaCrypto` from `mkissa.to` (no Cloudflare challenge)
2. Worker derives AES key: `XOR(atob(partB), hexToBytes(MASK))`
3. Worker builds signed `aaReq` extension (AES-GCM encrypted proof)
4. Worker POSTs to `api.allanime.day/api` with the signed request
5. Worker decrypts `tobeparsed` response → returns `sourceUrls[]`

**No browser needed, no external solver service, $0/month.**

### Cloudflare Worker Deployment (GitHub Actions — no local PC needed)

The Worker auto-deploys via GitHub Actions when you push to `main`:

1. **Create a Cloudflare API token**:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - "Create Token" → "Edit Cloudflare Workers" template → Create

2. **Add GitHub secrets** (`Settings → Secrets and variables → Actions`):
   - `CLOUDFLARE_API_TOKEN` — the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` — found on Cloudflare dashboard sidebar

3. **Push to `main`** — the `Deploy Cloudflare Worker` workflow auto-triggers

4. **Set Vercel env var**:
   - `NEXT_PUBLIC_CF_WORKER_URL` = `https://xan-stream-proxy.<your-subdomain>.workers.dev`

See [`cf-worker/README.md`](cf-worker/README.md) for full details.

### Alternative: Free Solver (no card needed)

If you can't use Cloudflare Workers, XAN also supports a standalone Puppeteer-based solver:

- **Path A** — Local computer + Cloudflare Quick Tunnel (zero signup, zero card)
- **Path B** — Render.com free tier (GitHub signup only, no card)
- **Path C** — Oracle Cloud Free Tier (requires card for verification, never charged)

See [`free-solver/README.md`](free-solver/README.md) for full details.

---

## 📁 Project Structure

```
xan/
├── 📂 src/
│   ├── 📂 app/
│   │   ├── 📂 (app)/                 # App router group (Navbar + Footer)
│   │   │   ├── 📂 home/              # Home page (trending + popular + genres)
│   │   │   ├── 📂 anime/[id]/        # Anime detail page (async params)
│   │   │   ├── 📂 watch/[id]/        # Watch page (HLS player + episodes)
│   │   │   ├── 📂 search/            # Search with filters + pagination
│   │   │   ├── 📂 discover/          # Browse/discover page
│   │   │   ├── 📂 list/              # Anime list page
│   │   │   ├── 📂 trending/          # Full trending list
│   │   │   ├── 📂 schedule/          # Airing schedule
│   │   │   ├── 📂 history/           # Watch history (localStorage)
│   │   │   ├── 📂 bookmarks/         # Bookmarked anime
│   │   │   └── 📂 settings/          # Settings (appearance, playback, bandwidth, sources)
│   │   ├── 📂 api/
│   │   │   ├── 📂 stream/[id]/[ep]/  # Main stream proxy (multi-provider, dub→sub fallback)
│   │   │   ├── 📂 allanime/          # AllAnime search proxy
│   │   │   ├── 📂 search/            # Search proxy
│   │   │   ├── 📂 genre/             # Genre filter proxy
│   │   │   ├── 📂 manifest-proxy/    # HLS manifest proxy (edge-cached)
│   │   │   ├── 📂 proxy_stream/      # Full stream proxy (edge-cached, for Referer-required CDNs)
│   │   │   ├── 📂 stream-zen/        # Zen (flixcloud.cc) proxy
│   │   │   ├── 📂 stream-pahe/       # AnimePahe (nekostream) proxy
│   │   │   ├── 📂 stream-gogo/       # Gogoanime proxy
│   │   │   ├── 📂 cf/                # CF cookie management (status/save/test/clear/diagnostics)
│   │   │   ├── 📂 analytics/         # Stream tier analytics
│   │   │   └── 📂 manifest-proxy/    # HLS manifest rewriting proxy
│   │   ├── layout.tsx                # Root layout (fonts, ThemeProvider)
│   │   ├── page.tsx                  # Landing page
│   │   ├── globals.css               # Tailwind v4 @theme tokens
│   │   ├── error.tsx                 # Global error boundary
│   │   ├── global-error.tsx          # App-level error boundary
│   │   ├── not-found.tsx             # 404 page
│   │   └── loading.tsx               # Loading skeleton
│   ├── 📂 components/
│   │   ├── 📂 landing/               # LandingHero (motion + useRouter)
│   │   ├── 📂 layout/                # Navbar (scroll-aware) + Footer
│   │   ├── 📂 cards/                 # AnimeCard + AnimeCardSkeleton + BookmarkButton
│   │   ├── 📂 home/                  # HeroCarousel, PopularGrid, ContinueWatching, TopTenRow, etc.
│   │   ├── 📂 anime/                 # AnimeHero, AnimeInfo, EpisodeGrid, CharacterList, RelatedAnime
│   │   ├── 📂 watch/                 # VideoPlayer, YouTubeStylePlayer, StreamPlayer, EpisodePanel,
│   │   │                             #   SourceSwitcher, SubDubToggle, VerificationBadge, VideoEnhancer
│   │   ├── 📂 search/                # SearchBar, FilterPanel
│   │   ├── 📂 schedule/              # ScheduleView, ScheduleCard, CountdownTimer
│   │   ├── 📂 allanime/              # AllAnimeCrossReference, DevInfoToggle
│   │   ├── 📂 ui/                    # shadcn/ui components (60+ components)
│   │   ├── ErrorBoundary.tsx         # Per-section error isolation
│   │   ├── ErrorCard.tsx             # Error fallback UI
│   │   ├── theme-provider.tsx        # next-themes wrapper
│   │   └── ReducedMotionEnforcer.tsx # Accessibility: respects prefers-reduced-motion
│   ├── 📂 hooks/
│   │   ├── useSettings.ts            # Persistent settings (bandwidth mode, provider priority, source toggles)
│   │   ├── useWatchHistory.ts        # SSR-safe localStorage history
│   │   ├── useBookmarks.ts           # SSR-safe bookmark management
│   │   ├── useDebounce.ts            # 400ms debounce for search
│   │   ├── useMediaQuery.ts          # SSR-safe media queries
│   │   ├── useBandwidthStats.ts      # Stream tier analytics
│   │   ├── useVideoEnhancer.ts       # Video filters (brightness, contrast, saturation)
│   │   ├── useAllAnimeInfo.ts        # AllAnime cross-reference data
│   │   ├── useAnimeList.ts           # Anime list state
│   │   ├── useRecommendations.ts     # Recommendations data
│   │   ├── useCountdownTick.ts       # Schedule countdown timers
│   │   ├── useReducedMotion.ts       # Prefers-reduced-motion hook
│   │   ├── use-toast.ts              # Toast notifications
│   │   └── use-mobile.ts             # Mobile detection
│   ├── 📂 lib/
│   │   ├── allanime.ts               # AllAnime crypto engine (AES-GCM signing + decryption)
│   │   ├── anilist.ts                # AniList GraphQL client (bounded retry + AbortController)
│   │   ├── anilist-queries.ts        # GraphQL query strings
│   │   ├── consumet.ts               # Consumet two-step client (info → watch)
│   │   ├── backend.ts                # Backend stream client
│   │   ├── cf-cookie-store.ts        # Persistent CF cookie storage
│   │   ├── constants.ts              # Genres, sort options, formats
│   │   ├── db.ts                     # Prisma database client
│   │   ├── utils.ts                  # cn() helper
│   │   ├── 📂 providers/             # Multi-provider stream registry
│   │   │   ├── index.ts              # Provider registry (AllAnime, Zen, Koto, Pahe, Gogoanime)
│   │   │   ├── isekai2nd.ts          # AllAnime episode resolver via CF Worker (direct crypto)
│   │   │   ├── zen.ts                # Zen (flixcloud.cc) provider
│   │   │   ├── koto.ts               # Koto (megaplay.buzz) provider
│   │   │   ├── pahe.ts               # AnimePahe (nekostream) provider
│   │   │   └── gogoanime.ts          # Gogoanime provider
│   │   └── 📂 extractors/            # Stream URL extractors
│   │       ├── index.ts              # Extractor registry
│   │       ├── megacloud.ts          # MegaCloud HLS extractor
│   │       └── vixcloud.ts           # VixCloud HLS extractor
│   └── 📂 types/
│       └── anime.ts                  # Zod schemas + helpers
├── 📂 cf-worker/                     # Cloudflare Worker (v5 — direct crypto)
│   ├── worker.js                     # Stream proxy + AllAnime episode resolver
│   ├── wrangler.toml                 # Worker config
│   ├── package.json                  # Dependencies (wrangler v4)
│   └── README.md                     # Deploy guide (GitHub Actions)
├── 📂 free-solver/                   # Alternative free Puppeteer solver
│   ├── server.js                     # Express + Puppeteer + stealth
│   ├── Dockerfile                    # For Render.com / Docker hosts
│   ├── start-with-tunnel.sh          # One-command local + Cloudflare Quick Tunnel
│   ├── package.json                  # Dependencies
│   └── README.md                     # 3 no-card setup paths
├── 📂 .github/workflows/
│   └── deploy-cf-worker.yml          # Auto-deploy Worker on push to main
├── 📂 public/
│   ├── placeholder-card.png          # Fallback cover image
│   ├── logo.svg                      # XAN logo
│   └── robots.txt
├── 📂 scripts/
│   └── make-placeholder.ts           # Placeholder image generator
├── .env.example                      # Environment variable documentation
├── next.config.ts                    # Next.js config (images.unoptimized, remotePatterns)
├── tsconfig.json                     # TypeScript config (strict)
├── tailwind.config.ts                # Tailwind v4 config
├── eslint.config.mjs                 # ESLint config (ignores cf-worker/ and free-solver/)
├── components.json                   # shadcn/ui config
├── vercel.json                       # Vercel deployment config
├── Dockerfile                        # Docker deployment
├── docker-compose.yml                # Docker Compose
├── package.json                      # Dependencies
└── LICENSE                           # MIT License
```

---

## 🎨 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | React framework with RSC |
| **Language** | TypeScript 5 (strict) | Type safety |
| **Styling** | Tailwind CSS v4 | Utility-first CSS (`@theme` tokens) |
| **UI Library** | shadcn/ui | Accessible components (60+) |
| **Animations** | Motion (`motion/react`) | Page + card animations |
| **Video** | hls.js + native `<video>` | HLS playback |
| **Validation** | Zod | Runtime API validation |
| **Icons** | Lucide React | SVG icons |
| **Theme** | next-themes | Dark/light mode |
| **Metadata API** | AniList GraphQL | Trending, popular, search, details |
| **Stream API** | AllAnime (mkissa.to) | Episode sources (direct crypto signing) |
| **Cloudflare Worker** | Wrangler v4 | Stream proxy + AllAnime crypto resolver |
| **Fonts** | Nunito + Inter + Outfit | Display + body + sans |

---

## 🧠 Architecture

### Stream Resolution (Multi-Provider with Dub→Sub Fallback)

```
User clicks "Watch Episode N"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 1. AllAnime (via CF Worker — direct crypto)             │
│    a. Check availableEpisodes.dub                       │
│       - dub=0 or episode>dub → skip to sub              │
│    b. Worker fetches __aaCrypto from mkissa.to          │
│    c. Worker signs GraphQL request (AES-GCM)            │
│    d. Worker decrypts tobeparsed → sourceUrls[]         │
│    e. XAN decodes URLs (XOR) + extracts direct MP4      │
│       from mp4upload embeds                             │
│    f. If dub returned 0 sources → retry with sub        │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Other Providers (parallel, non-blocking)             │
│    - Zen (flixcloud.cc) — HLS embed                     │
│    - Koto (megaplay.buzz) — iframe embed                │
│    - AnimePahe (nekostream) — MP4 downloads             │
│    - Gogoanime — HLS/MP4 scraping                       │
│    (Pahe + Gogoanime disabled by default)               │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Merge + Deduplicate                                 │
│    - AllAnime sources first (highest priority)          │
│    - Deduplicate by sourceName (keep first)             │
│    - Filter by disabledSources (source names + provider IDs) │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Player Tier Cascade (per source)                     │
│    For MP4 sources:                                     │
│    - Pre-wrapped with CF Worker URL (instant load)      │
│    For HLS sources:                                     │
│    - direct → manifest-proxy → cf-proxy → full-proxy   │
│    For iframe sources:                                  │
│    - Loaded in <iframe> (embed page JS renders player)  │
└─────────────────────────────────────────────────────────┘
```

### AllAnime Crypto Scheme (v5 — Direct, No Browser)

The Cloudflare Worker implements AllAnime's new crypto scheme directly using Web Crypto API:

```
1. Fetch __aaCrypto = {epoch, partB} from mkissa.to/watch/<id>/p-<ep>-<type>
   (mkissa.to has NO Cloudflare challenge — returns 200 directly)

2. Derive AES key: key = XOR(atob(partB), hexToBytes(MASK))
   where MASK = "b1a9a4d051988f1b1b12dbb747439d9bd64b09ea17835600a7eaa4de87c1ad87"

3. Build signed "aaReq" extension:
   - ts = floor(Date.now() / 300000) * 300000  (5-min bucket)
   - payload = {v:1, ts, epoch, buildId:"9", qh:queryHash}
   - iv = SHA-256(epoch + ":" + buildId + ":" + queryHash + ":" + ts).slice(0, 12)
   - aaReq = base64([0x01][iv(12)][AES-GCM-encrypt(key, iv, payload)])

4. POST to api.allanime.day/api with:
   - body: {query, variables, extensions: {persistedQuery, aaReq}}
   - headers: {Content-Type, x-build-id: "9"}

5. Server returns tobeparsed — decrypt with SAME key (mask XOR partB)
   (OLD key sha256("Xot36i3lK3:v1") kept as fallback)

6. Return sourceUrls[] to XAN as JSON
```

### Source Types

| Source | Provider | Type | How It Plays |
|--------|----------|------|-------------|
| **Mp4** | AllAnime | mp4 | Direct MP4 from mp4upload (pre-wrapped with CF Worker for Referer) — plays in custom player with seeking |
| **Fm-Hls** | AllAnime | iframe | FileMoon HLS embed (bysekoze.com) — JS-rendered player |
| **Vn-Hls** | AllAnime | iframe | VidNest HLS embed (vidnest.io) — JS-rendered player |
| **Ok** | AllAnime | iframe | Ok.ru video embed (may show captcha on first visit) |
| **Uni** | AllAnime | iframe | AllAnime Uni embed (allanime.uns.bio) — JS-rendered player |
| **Zen** | Zen | iframe | FlixCloud HLS embed |
| **Koto** | Koto | iframe | MegaPlay embed |
| ~~Luf-Mp4~~ | AllAnime | ❌ | Skipped (clock.json endpoint dead) |
| ~~Ak~~ | AllAnime | ❌ | Skipped (clock.json endpoint dead) |

---

## 🔧 API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/stream/[id]/[ep]` | GET | Main stream endpoint — multi-provider, dub→sub fallback, source dedup |
| `/api/allanime` | GET | AllAnime search proxy (no captcha needed) |
| `/api/search` | GET | Search proxy |
| `/api/genre` | GET | Genre filter proxy |
| `/api/manifest-proxy` | GET | HLS manifest proxy (edge-cached, rewrites segment URLs) |
| `/api/proxy_stream` | GET | Full stream proxy (edge-cached, for Referer-required CDNs) |
| `/api/stream-zen` | GET | Zen (flixcloud.cc) proxy |
| `/api/stream-pahe` | GET | AnimePahe (nekostream) proxy |
| `/api/stream-gogo` | GET | Gogoanime proxy |
| `/api/cf/status` | GET | Check CF cookie status |
| `/api/cf/save` | POST | Save cf_clearance cookie |
| `/api/cf/test` | POST | Test cookie against AllAnime |
| `/api/cf/clear` | POST | Remove stored cookie |
| `/api/cf/diagnostics` | GET | Full diagnostic info (IPs, UA, etc.) |
| `/api/analytics/stream-tier` | GET | Stream tier analytics |

### Cloudflare Worker Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/?url=<stream_url>&h_Referer=...` | GET | Stream proxy — adds Referer/Origin headers for CDNs |
| `/allanime/episode?showId=...&episodeString=...&translationType=sub\|dub` | GET | AllAnime episode resolver (direct crypto, no browser) |
| `/` (no params) | GET | Health check — returns version, browserRendering status |

---

## 📱 Pages & Routes

| Route | Type | Description |
|-------|------|-------------|
| `/` | Client | Landing page (animated hero, Enter key shortcut) |
| `/home` | Server (async) | Home (Continue Watching, Trending, Popular, Browse by Genre) |
| `/anime/[id]` | Server (async) | Anime detail (hero, info, episodes, characters, relations) |
| `/watch/[id]?ep=N` | Client | Watch page (video player, episode panel, history) |
| `/search?q=...` | Client | Search with genre/sort/format filters + pagination |
| `/discover` | Server (async) | Discover page |
| `/list` | Client | Anime list |
| `/schedule` | Server (async) | Airing schedule with countdowns |
| `/history` | Client | Watch history (localStorage, progress bars) |
| `/bookmarks` | Client | Bookmarked anime |
| `/settings` | Client | Settings (appearance, playback, bandwidth, sources, accessibility) |

---

## 🎯 Key Features Deep Dive

### 🎬 Video Player
- YouTube-style custom player with hls.js for cross-browser HLS
- Custom controls: play/pause, seek bar, mute, fullscreen, time display, playback speed
- Loading spinner, error overlay, center play button, auto-play next episode
- Keyboard shortcuts (space=play, ←/→=seek, F=fullscreen, M=mute)
- Multi-source fallback (auto-advances to next source if all tiers fail)
- Video enhancer (brightness, contrast, saturation, hue filters)
- Falls back to native HLS for Safari

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

### 🔀 Sub/Dub Toggle
- Automatic fallback from dub to sub when dub is unavailable
- Pre-check: `availableEpisodes.dub` before calling Worker (saves round-trip)
- Post-check: if dub returns 0 sources, retries with sub
- Client notified via `fallbackMode` response field → toggle switches to "Sub"

### ⚙️ Settings
- **Appearance**: Theme (dark/light/system), reduced motion, TV mode
- **Playback**: Auto-play next, auto-resume, playback speed, default volume, skip intro/outro
- **Bandwidth**: Mode (auto/direct-only/cf-only/etc.), source toggles, provider priority
- **Sources**: Per-source on/off toggles (Mp4, Fm-Hls, Vn-Hls, Ok, Uni, Zen, Koto, pahe, gogoanime)
- **Content**: Hide adult, hide spoilers, default sort
- **Accessibility**: Reduced motion (auto/reduce/no-reduce)
- Settings version migration (v6) — auto-cleans up old source names, adds defaults

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
```bash
docker-compose up -d
```

---

## 💰 Cost Optimization ($0/month on Vercel Hobby)

XAN is optimized to stay within Vercel's free tier limits:

| Optimization | What It Does | Quota Saved |
|-------------|--------------|-------------|
| `images.unoptimized: true` | Bypasses Vercel's Image Optimization | Kills image-optimization quota (5k/month → 0) |
| `manifest-proxy` edge caching | Caches HLS manifests at edge | Reduces Fast Origin Transfer |
| `proxy_stream` edge caching | Caches VOD segments as immutable | Reduces Fast Origin Transfer |
| CF Worker stream proxy | Offloads video bandwidth to Cloudflare | 0 Vercel bandwidth for proxied streams |
| CF Worker direct crypto | AllAnime sources without browser/Puppeteer | 0 external solver cost |
| 5-min response cache | Worker caches episode sources | Reduces Worker CPU time |

**Total monthly cost: $0** (Vercel Hobby + Cloudflare Workers free tier)

---

## 🐛 Bug Prevention (24+ patterns)

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
| 25 | AA_CRYPTO_MISSING (new) | CF Worker v5 — direct crypto implementation |
| 26 | Double-slash URL bug | Strip trailing slash from Worker URL |
| 27 | Vercel fetch cache staleness | `cache: "no-store"` for Worker calls |
| 28 | Duplicate sources | Skip old AllAnime path when Worker configured + dedup |

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
bun run dev       # Dev server
```

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **[AniList](https://anilist.co)** — Anime metadata API
- **[AllAnime / mkissa.to](https://mkissa.to)** — Episode sources + streaming
- **[shadcn/ui](https://ui.shadcn.com)** — UI components
- **[hls.js](https://github.com/video-dev/hls.js)** — HLS playback
- **[Motion](https://motion.dev)** — Animations
- **[Lucide](https://lucide.dev)** — Icons
- **[Cloudflare Workers](https://workers.cloudflare.com)** — Free serverless compute + stream proxy

---

## ⚠️ Disclaimer

XAN is for educational purposes only. The project demonstrates:
- Next.js 16 App Router patterns
- Server/Client Component directives
- Defensive coding practices
- Multi-API integration
- HLS video playback
- Reverse-engineering of client-side crypto schemes
- Cloudflare Worker deployment via GitHub Actions

**Users are responsible for complying with their local laws and the terms of service of any third-party APIs used.** The maintainers do not host or stream any content. All streaming is performed via third-party APIs (AniList, AllAnime) and the user is responsible for verifying they have the right to access such content in their jurisdiction.

---

<div align="center">

**Built with ❤️ and the AniList + AllAnime APIs**

[Report Bug](../../issues) · [Request Feature](../../issues) · [⬆ Back to Top](#-xan)

</div>
