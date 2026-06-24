// app/api/stream/[id]/[ep]/route.ts
// ✅ Stream proxy — new pipeline ported from SNI.
//
// Flow:
//   1. Find AllAnime show by AniList ID + title
//   2. getEpisodeSources() — persisted GraphQL query (NO Cloudflare!)
//   3. For each source: extractStreamUrl() (Yt-mp4 / Megacloud / Vixcloud / etc.)
//   4. Return first working stream
//   5. Consumet fallback (if CONSUMET_URL set)
//   6. Demo HLS emergency fallback

import { NextResponse } from "next/server";
import { findShowByAniListId, getEpisodeStreams } from "@/lib/allanime";
import { fetchConsumetStream, getConsumetConfig } from "@/lib/consumet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Mock HLS streams (emergency fallback) ───
const MOCK_STREAMS: { url: string; quality: string }[] = [
  {
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "1080p (demo)",
  },
  {
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8",
    quality: "720p (demo)",
  },
];

function mockResponse(animeId: number, episode: number, reason?: string) {
  const pick = MOCK_STREAMS[animeId % MOCK_STREAMS.length];
  return {
    stream: {
      url: pick.url,
      type: "hls" as const,
      quality: pick.quality,
    },
    sources: MOCK_STREAMS.map((s) => ({ ...s, type: "hls" as const })),
    duration: 600,
    episodeTitle: `Episode ${episode}`,
    thumbnail: null,
    provider: "demo",
    fallbackReason: reason ?? null,
  };
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

  // ─── 1. Try AllAnime (persisted GraphQL — no CF!) ───
  if (!allowDemo && title) {
    try {
      const show = await findShowByAniListId(animeId, title);
      if (show) {
        const streams = await getEpisodeStreams(show._id, String(episode), "sub");
        if (streams.length > 0) {
          const picked = streams[0];
          if (picked && picked.url) {
            return NextResponse.json({
              stream: {
                url: picked.url,
                type: picked.type,
                quality: picked.quality,
              },
              sources: streams.map((s) => ({
                url: s.url,
                type: s.type,
                quality: s.quality,
                sourceName: s.sourceName,
                headers: s.headers,
              })),
              duration: null,
              episodeTitle: `Episode ${episode}`,
              thumbnail: null,
              provider: "allanime",
              sourceName: picked.sourceName,
              headers: picked.headers,
            });
          }
        }
      }
    } catch (err) {
      console.error("[stream] AllAnime attempt failed:", err);
    }
  }

  // ─── 2. Try Consumet (if configured) ───
  const cfg = getConsumetConfig();
  if (cfg.configured) {
    const stream = await fetchConsumetStream(animeId, episode);
    if (stream) {
      return NextResponse.json({
        stream: {
          url: stream.url,
          type: stream.type,
          quality: stream.quality,
        },
        sources: [{ ...stream }],
        duration: null,
        episodeTitle: `Episode ${episode}`,
        thumbnail: null,
        provider: "consumet/animepahe",
      });
    }
  }

  // ─── 3. Emergency demo fallback ───
  const reasons: string[] = [];
  if (title) reasons.push("AllAnime returned no playable sources");
  if (!cfg.configured) reasons.push("CONSUMET_URL not set");
  else reasons.push("Consumet returned no sources");

  return NextResponse.json(
    mockResponse(animeId, episode, reasons.join("; ") + ". Showing demo stream."),
  );
}
