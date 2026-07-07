// app/api/stream/[id]/[ep]/route.ts
//
// ✅ Bug fixes:
// - When dub is requested but unavailable, falls back to sub instead of demo
// - Returns structured error when episode not yet released (instead of silent demo)
// - Better error context in response
//
// ✅ Multi-provider support:
// - AllAnime (existing) — multiple sources per episode
// - Zen (flixcloud.cc) — HLS embed
// - Koto (megaplay.buzz) — iframe embed
// - AnimePahe (nekostream) — MP4 downloads
// All providers are fetched in parallel; sources are merged into one array.

import { NextResponse } from "next/server";
import {
  findShowByAniListId,
  extractStreamUrl,
  decodeUrl,
  type StreamResult,
} from "@/lib/allanime";
import { fetchConsumetStream, getConsumetConfig } from "@/lib/consumet";
import { fetchIsekai2ndSources } from "@/lib/providers/isekai2nd";

export const dynamic = "force-dynamic";
// Vercel Hobby maxDuration max is 60s. The isekai2nd provider may need to
// wait for the CF Worker's Turnstile solver (30-120s on first call, <1s cached).
// 60s gives us headroom for cached calls; first-call solver waits happen in
// the Worker, not here — the Worker caches tokens for 4 min so subsequent
// calls within a session are fast.
export const maxDuration = 60;

// Unified source shape — used by all provider fetchers in this file.
type UnifiedSource = {
  url: string;
  type: "hls" | "mp4" | "iframe";
  quality: string | null;
  sourceName: string;
  headers?: Record<string, string>;
  provider: string;
};

const MOCK_STREAMS: { url: string; quality: string }[] = [
  { url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", quality: "1080p (demo)" },
  {
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8",
    quality: "720p (demo)",
  },
];

function mockResponse(animeId: number, episode: number, reason?: string) {
  const pick = MOCK_STREAMS[animeId % MOCK_STREAMS.length];
  return {
    stream: { url: pick.url, type: "hls" as const, quality: pick.quality },
    sources: MOCK_STREAMS.map((s) => ({ ...s, type: "hls" as const })),
    duration: 600,
    episodeTitle: `Episode ${episode}`,
    thumbnail: null,
    provider: "demo" as const,
    fallbackReason: reason ?? null,
  };
}

function streamResultToJSON(s: StreamResult) {
  return {
    url: s.url,
    type: s.type,
    quality: s.quality,
    sourceName: s.sourceName,
    headers: s.headers,
    provider: "allanime" as const,
  };
}

// ✅ Fetch Zen (flixcloud.cc) sources — server-side to bypass Cloudflare
async function fetchZenSourcesServerSide(
  anilistId: number,
  episode: number,
): Promise<Array<{ url: string; type: "iframe"; quality: string | null; sourceName: string; provider: string }>> {
  try {
    const res = await fetch(
      `https://flixcloud.cc/videos/raw?anilist_id=${anilistId}&episode=${episode}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.status !== "success" || !json.data) return [];

    const sources: Array<{ url: string; type: "iframe"; quality: string | null; sourceName: string; provider: string }> = [];
    for (const item of json.data) {
      if (item.player_url) {
        sources.push({
          url: item.player_url,
          type: "iframe",
          quality: item.quality ?? null,
          sourceName: "Zen",
          provider: "zen",
        });
      }
    }
    return sources;
  } catch (err) {
    console.warn("[stream] Zen fetch failed:", err);
    return [];
  }
}

// ✅ Build Koto (megaplay.buzz) source — just a URL, no fetch needed
function getKotoSource(
  anilistId: number,
  episode: number,
  mode: "sub" | "dub",
) {
  return {
    url: `https://megaplay.buzz/stream/ani/${anilistId}/${episode}/${mode}`,
    type: "iframe" as const,
    quality: null,
    sourceName: "Koto",
    provider: "koto" as const,
  };
}

// ✅ Fetch AnimePahe (nekostream) sources — server-side to bypass CORS
// Response structure: {provider: {sub: {download: {quality: url}}, dub: {download: {quality: url}}}, status: {...}}
//
// ⚠️ Pahe sources are DOWNLOAD links, not direct stream URLs.
// The chain is: pahe.nekostream.site → HTML download page → JS redirect →
// proud-dew workers.dev → 302 → kwik.cx (Cloudflare 403).
// We mark them as "iframe" type so they load in an iframe (showing the
// download page). The user can click "Download" to get the file.
async function fetchPaheSourcesServerSide(
  malId: number | null,
  episode: number,
  requestedMode: "sub" | "dub",
): Promise<Array<{ url: string; type: "iframe"; quality: string | null; sourceName: string; provider: string }>> {
  if (!malId) return [];

  try {
    const ts = Math.floor(Date.now() / 1000);
    const res = await fetch(
      `https://mapper.nekostream.site/api/mal/${malId}/${episode}/${ts}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
          Accept: "application/json",
          Referer: "https://animex.one/",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];
    const json = await res.json();

    const sources: Array<{ url: string; type: "iframe"; quality: string | null; sourceName: string; provider: string }> = [];
    for (const [providerKey, value] of Object.entries(json)) {
      if (providerKey === "status") continue;
      if (!value || typeof value !== "object") continue;

      const providerObj = value as Record<string, unknown>;

      // ✅ New structure: {provider: {sub: {download: {quality: url}}, dub: {download: {quality: url}}}}
      const modeData = providerObj[requestedMode] as Record<string, unknown> | undefined;
      if (modeData && typeof modeData === "object") {
        for (const [downloadType, qualityObj] of Object.entries(modeData)) {
          if (qualityObj && typeof qualityObj === "object") {
            for (const [quality, urlVal] of Object.entries(qualityObj as Record<string, unknown>)) {
              if (typeof urlVal === "string" && urlVal.startsWith("http")) {
                // ✅ Use the ORIGINAL pahe.nekostream.site URL (not the workers.dev redirect).
                // The workers.dev URL just redirects to kwik.cx which is Cloudflare-blocked.
                // The pahe.nekostream.site URL shows a download page in the iframe.
                sources.push({
                  url: urlVal,
                  type: "iframe",
                  quality: quality || downloadType || null,
                  sourceName: `Pahe-${providerKey}`,
                  provider: "pahe",
                });
              }
            }
          }
        }
      }

      // ✅ Fallback: old flat structure {provider: {quality: url}}
      if (sources.length === 0) {
        for (const [quality, urlVal] of Object.entries(providerObj)) {
          if (typeof urlVal === "string" && urlVal.startsWith("http")) {
            sources.push({
              url: urlVal,
              type: "iframe",
              quality: quality || null,
              sourceName: `Pahe-${providerKey}`,
              provider: "pahe",
            });
          }
        }
      }
    }
    return sources;
  } catch (err) {
    console.warn("[stream] Pahe fetch failed:", err);
    return [];
  }
}

// ✅ Fetch Gogoanime sources — uses gogoanime.fi as iframe embed
// gogoanime.fi is a WordPress site (dramastream theme) that loads its player
// via AJAX — we can't scrape the stream URL server-side. Instead, we find the
// episode page URL and embed it as an iframe. The user watches on gogoanime's
// own player. 0 Vercel bandwidth.
async function fetchGogoanimeSourcesServerSide(
  title: string,
  episode: number,
): Promise<Array<{ url: string; type: "iframe"; quality: string | null; sourceName: string; provider: string }>> {
  if (!title.trim()) return [];

  const GOGO_DOMAINS = ["https://gogoanime.fi"];
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const FETCH_HEADERS = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  for (const baseUrl of GOGO_DOMAINS) {
    try {
      // Step 1: Fetch the category page (search redirects to home, so we try
      // building the slug from the title directly)
      // gogoanime.fi slug format: title-with-hyphens
      const slug = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      // Step 2: Try the episode URL with "-english-subbed" suffix (gogoanime.fi format)
      const epUrl = `${baseUrl}/${slug}-episode-${episode}-english-subbed/`;
      const epRes = await fetch(epUrl, {
        headers: { ...FETCH_HEADERS, Referer: `${baseUrl}/` },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });

      if (epRes.ok) {
        const epHtml = await epRes.text();
        // Verify it's a real episode page (not a 404 or redirect)
        if (epHtml.length > 10000 && epHtml.includes("gogoanime")) {
          return [{
            url: epUrl,
            type: "iframe",
            quality: null,
            sourceName: "Gogoanime",
            provider: "gogoanime",
          }];
        }
      }

      // Step 3: If the direct URL didn't work, try searching for the anime
      // gogoanime.fi search redirects to home page, so we need to use the
      // category page to find the correct slug
      const catUrl = `${baseUrl}/category/${slug}`;
      const catRes = await fetch(catUrl, {
        headers: { ...FETCH_HEADERS, Referer: `${baseUrl}/` },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });

      if (catRes.ok) {
        const catHtml = await catRes.text();
        // Look for episode links on the category page
        const epLinkMatch = catHtml.match(
          new RegExp(`href="(https://${baseUrl.replace("https://", "")}/[^"]*-episode-${episode}[^"]*)"`)
        );
        if (epLinkMatch && epLinkMatch[1]) {
          return [{
            url: epLinkMatch[1],
            type: "iframe",
            quality: null,
            sourceName: "Gogoanime",
            provider: "gogoanime",
          }];
        }
      }
    } catch {
      // Try next domain
      continue;
    }
  }

  return [];
}

// ✅ Fetch AllAnime sources via the CF Worker.
// All sources are returned as iframe embeds — the embed pages (bysekoze.com,
// vidnest.io, mp4upload, ok.ru, allanime.uns.bio) are JavaScript-rendered
// and can't be scraped server-side. The browser's iframe element loads them
// and the embed page's JS renders the video player.
//
// Sources that decode to /apivtwo/clock (Luf-Mp4, Ak) are skipped — the
// clock.json endpoint is dead (HTTP 500) as of mid-2026.
//
// All sources are tagged provider: "allanime".
async function fetchIsekai2ndSourcesServerSide(
  anilistId: number,
  title: string,
  episode: number,
  mode: "sub" | "dub",
): Promise<UnifiedSource[]> {
  if (!title.trim()) return [];

  try {
    // Step 1: Find AllAnime showId (search is public, no captcha)
    const show = await findShowByAniListId(anilistId, title);
    if (!show?._id) return [];

    // Step 2: Fetch raw sourceUrls via the CF Worker
    const rawSources = await fetchIsekai2ndSources(show._id, String(episode), mode);
    if (rawSources.length === 0) return [];

    // Step 3: Decode URLs and return as iframe sources
    // - Direct URLs (https://...) → return as iframe
    // - XOR-encoded ("--...") → decode with decodeUrl()
    //   - If decoded to /apivtwo/clock → skip (endpoint is dead)
    //   - If decoded to https://... → return as iframe
    const sources: UnifiedSource[] = [];
    let skippedClockSources = 0;

    for (const s of rawSources) {
      const decodedUrl = decodeUrl(s.url);

      // Skip dead clock.json sources (Luf-Mp4, Ak) — endpoint returns 500
      if (decodedUrl.startsWith("/apivtwo/")) {
        skippedClockSources++;
        continue;
      }

      // Only return absolute URLs (http/https) — relative paths can't load in iframe
      if (!decodedUrl.startsWith("http")) {
        continue;
      }

      sources.push({
        url: decodedUrl,
        type: "iframe",
        quality: s.quality,
        sourceName: s.sourceName,
        headers: s.headers,
        provider: "allanime",
      });
    }

    if (skippedClockSources > 0) {
      console.log(`[stream] AllAnime: skipped ${skippedClockSources} dead clock.json sources (Luf-Mp4/Ak)`);
    }
    console.log(`[stream] AllAnime: ${sources.length} playable iframe sources`);
    return sources;
  } catch (err) {
    console.warn("[stream] AllAnime (via Worker) fetch failed:", err);
    return [];
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; ep: string }> },
) {
  const { id, ep } = await context.params;
  const animeId = parseInt(id, 10);
  const episode = parseInt(ep, 10);

  if (isNaN(animeId) || isNaN(episode)) {
    return NextResponse.json(
      { error: "Invalid anime ID or episode number" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const title = url.searchParams.get("title") || "";
  const allowDemo = url.searchParams.get("allowDemo") === "true";
  const malIdParam = url.searchParams.get("malId");
  const malId = malIdParam ? parseInt(malIdParam, 10) : null;
  // ✅ Sub/Dub switching: accept type=sub|dub, default to sub
  const requestedMode = url.searchParams.get("type") === "dub" ? "dub" : "sub";

  // ─── Collect sources from all providers in parallel ──────────────────
  // Each provider returns its own sources array; we merge them all.
  // The client (VideoPlayer) uses providerPriority to pick the first one.

  let allanimeSources: UnifiedSource[] = [];
  let allanimeFailures: { source: string; reason: string }[] = [];
  let allanimeMode: "sub" | "dub" | null = null;

  // ─── 1. AllAnime (primary) ───
  if (!allowDemo && title) {
    try {
      const show = await findShowByAniListId(animeId, title);
      if (show) {
        const modesToTry: ("sub" | "dub")[] =
          requestedMode === "dub" ? ["dub", "sub"] : ["sub"];

        for (const mode of modesToTry) {
          const result = await extractStreamUrl(show._id, String(episode), mode);
          if (result && result.sources.length > 0) {
            allanimeSources = result.sources.slice(0, 8).map(streamResultToJSON);
            allanimeFailures = result.failures;
            allanimeMode = mode;
            break;
          }
          if (result) allanimeFailures = result.failures;
        }

        // Check if episode is released
        if (allanimeSources.length === 0) {
          const sub = show.availableEpisodes?.sub ?? 0;
          if (episode > sub) {
            return NextResponse.json({
              stream: null,
              sources: [],
              duration: null,
              episodeTitle: `Episode ${episode}`,
              thumbnail: null,
              provider: "allanime",
              error: `Episode ${episode} hasn't been released yet. Only ${sub} episode(s) available.`,
              failures: allanimeFailures,
            });
          }
        }
      }
    } catch (err) {
      console.error("[stream] AllAnime attempt failed:", err);
    }
  }

  // ─── 2. Zen, Koto, Pahe, Gogoanime, Isekai2nd (in parallel, non-blocking) ───
  const [zenSources, paheSources, gogoSources, isekai2ndSources] = await Promise.all([
    fetchZenSourcesServerSide(animeId, episode),
    fetchPaheSourcesServerSide(malId, episode, requestedMode),
    fetchGogoanimeSourcesServerSide(title, episode),
    fetchIsekai2ndSourcesServerSide(animeId, title, episode, requestedMode),
  ]);

  // Koto is just a URL builder — no fetch needed
  const kotoSource = getKotoSource(animeId, episode, requestedMode);

  // ─── 3. Merge all sources ───
  const mergedSources: UnifiedSource[] = [
    ...isekai2ndSources, // isekai2nd first (highest priority — working AllAnime path via CF Worker)
    ...allanimeSources, // regular AllAnime (will be empty if captcha is enforced)
    ...zenSources,
    kotoSource,
    ...paheSources,
    ...gogoSources,
  ];

  // ─── 4. Return the merged response ───
  if (mergedSources.length > 0) {
    const picked = mergedSources[0];
    return NextResponse.json({
      stream: picked,
      sources: mergedSources,
      duration: null,
      episodeTitle: `Episode ${episode}`,
      thumbnail: null,
      provider: picked.provider,
      // ✅ If AllAnime fell back from dub to sub
      ...(requestedMode === "dub" && allanimeMode === "sub"
        ? { fallbackMode: "dub unavailable, fell back to sub" }
        : {}),
      failures: allanimeFailures,
    });
  }

  // ─── 5. Fallback to Consumet if configured ───
  const cfg = getConsumetConfig();
  if (cfg.configured) {
    const stream = await fetchConsumetStream(animeId, episode);
    if (stream) {
      return NextResponse.json({
        stream: { url: stream.url, type: stream.type, quality: stream.quality, provider: "consumet" },
        sources: [{ ...stream, provider: "consumet" }],
        duration: null,
        episodeTitle: `Episode ${episode}`,
        thumbnail: null,
        provider: "consumet/animepahe",
      });
    }
  }

  // ─── 6. All providers failed — return demo ───
  const reasons: string[] = [];
  if (title) reasons.push("AllAnime returned no playable sources");
  reasons.push("Zen/Koto/Pahe returned no sources");
  if (!cfg.configured) reasons.push("CONSUMET_URL not set");
  else reasons.push("Consumet returned no sources");

  return NextResponse.json(
    mockResponse(animeId, episode, reasons.join("; ") + ". Showing demo stream."),
  );
}
