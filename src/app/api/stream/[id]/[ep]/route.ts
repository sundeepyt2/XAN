// app/api/stream/[id]/[ep]/route.ts
// Server-side stream proxy.
//
// Flow (tries each in order):
//   1. AllAnime GraphQL → find show by AniList ID → fetch stream sources
//      (Usually fails — AllAnime's /episodes endpoint is Cloudflare-protected)
//   2. Consumet (if CONSUMET_URL set) → animepahe two-step flow
//   3. Mock HLS fallback (public test streams)
//
// Whatever returns a valid stream URL first wins; the rest are skipped.

import { NextResponse } from "next/server";
import {
  findShowByAniListId,
  fetchAllAnimeStreamSources,
} from "@/lib/allanime";
import { fetchConsumetStream, getConsumetConfig } from "@/lib/consumet";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Mock HLS streams (final fallback) ───
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

  // ─── 1. Try AllAnime (unless allowDemo is set — then skip straight to demo) ───
  if (!allowDemo && title) {
    try {
      const show = await findShowByAniListId(animeId, title);
      if (show) {
        const sources = await fetchAllAnimeStreamSources(
          show._id,
          String(episode),
        );
        if (sources && sources.length > 0) {
          const picked = sources[0];
          if (picked && picked.url) {
            return NextResponse.json({
              stream: {
                url: picked.url,
                type: picked.url.includes(".m3u8") ? "hls" : "mp4",
                quality: picked.quality,
              },
              sources: sources.map((s) => ({
                url: s.url,
                type: s.url.includes(".m3u8") ? ("hls" as const) : ("mp4" as const),
                quality: s.quality,
              })),
              duration: null,
              episodeTitle: `Episode ${episode}`,
              thumbnail: null,
              provider: "allanime",
            });
          }
        }
      }
    } catch (err) {
      console.error("[stream] AllAnime attempt failed:", err);
    }
  }

  // ─── 2. Try Consumet ───
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

  // ─── 3. Fallback to mock ───
  const reasons: string[] = [];
  if (title) reasons.push("AllAnime stream endpoint is Cloudflare-protected");
  if (!cfg.configured) reasons.push("CONSUMET_URL not set");
  else reasons.push("Consumet returned no sources");

  return NextResponse.json(
    mockResponse(animeId, episode, reasons.join("; ") + ". Showing demo stream."),
  );
}
