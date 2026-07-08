// lib/providers/index.ts
// ✅ Unified provider registry — lists all available stream providers
// ✅ Used by the SourceSwitcher to show provider names and by the priority system

export type ProviderId =
  | "allanime" // Our existing AllAnime extractor (Yt-mp4, Mp4, Sw, Ok, etc.)
  | "isekai2nd" // AllAnime episode sources via CF Worker (Turnstile solver)
  | "zen" // flixcloud.cc — HLS embed (often blocked by Cloudflare)
  | "koto" // megaplay.buzz — iframe embed
  | "pahe" // nekostream — MP4 downloads
  | "gogoanime"; // gogoanime.fi — HLS/MP4 scraping

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  description: string;
  /** Whether this provider supports sub streams */
  supportsSub: boolean;
  /** Whether this provider supports dub streams */
  supportsDub: boolean;
  /** Default priority (higher = tried first) */
  defaultPriority: number;
}

/**
 * Registry of all available providers.
 * Displayed in Settings → Bandwidth → Provider Priority.
 */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "allanime",
    name: "AllAnime",
    description: "Primary provider — extracts streams from AllAnime's API. Returns multiple sources per episode (Yt-mp4, Mp4, StreamWish, Ok.ru, etc.). NOTE: As of mid-2026, AllAnime requires a Turnstile captcha for episode queries — this provider will return 0 sources unless the CF Worker (with solver) is deployed.",
    supportsSub: true,
    supportsDub: true,
    defaultPriority: 90, // lowered from 100 — isekai2nd is now preferred
  },
  {
    id: "isekai2nd",
    name: "Isekai2nd",
    description: "AllAnime episode sources routed through the Cloudflare Worker (which solves the Turnstile captcha via 2captcha/CapSolver). Same upstream CDNs as AllAnime (tools.fast4speed.rsvp, megacloud.tv, etc.) but uses isekai2nd.com as the Referer — AllAnime's official config for episode streams. Requires NEXT_PUBLIC_CF_WORKER_URL.",
    supportsSub: true,
    supportsDub: true,
    defaultPriority: 100, // highest — this is the working path for AllAnime sources
  },
  {
    id: "zen",
    name: "Zen",
    description: "FlixCloud embed — HLS player. 0 Vercel bandwidth (iframe). Good fallback when AllAnime sources fail.",
    supportsSub: true,
    supportsDub: false,
    defaultPriority: 80,
  },
  {
    id: "koto",
    name: "Koto",
    description: "MegaPlay embed — iframe player. 0 Vercel bandwidth. Good for subbed anime.",
    supportsSub: true,
    supportsDub: true,
    defaultPriority: 70,
  },
  {
    id: "pahe",
    name: "AnimePahe",
    description: "AnimePahe downloads — direct MP4 URLs via nekostream mapper. Good quality, may need CF Worker.",
    supportsSub: true,
    supportsDub: false,
    defaultPriority: 60,
  },
  {
    id: "gogoanime",
    name: "Gogoanime",
    description: "Gogoanime — HLS/MP4 streams scraped from gogoanime.fi. Tries multiple domains. Good fallback.",
    supportsSub: true,
    supportsDub: true,
    defaultPriority: 50,
  },
];

/**
 * Get the default priority order for all providers.
 * Used to initialize the providerPriority setting.
 */
export function getDefaultProviderPriority(): ProviderId[] {
  return [...PROVIDERS].sort((a, b) => b.defaultPriority - a.defaultPriority).map((p) => p.id);
}

/**
 * Get provider info by ID.
 */
export function getProviderInfo(id: ProviderId): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
