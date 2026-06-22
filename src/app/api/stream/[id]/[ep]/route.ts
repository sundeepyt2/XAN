// app/api/stream/[id]/[ep]/route.ts
// Server-side proxy to the configured backend.
//
// Behavior:
// - If NEXT_PUBLIC_BACKEND_URL is not set → 502 with clear "Backend Required" error
// - If NEXT_PUBLIC_BACKEND_URL points to this app's own /api (demo mode) → return mock HLS
// - Otherwise → proxy to the real backend via fetchEpisodeStream()

import { NextResponse } from "next/server";
import { getBackendConfig } from "@/lib/backend";

export const dynamic = "force-dynamic";

// ─── Mock backend (used when NEXT_PUBLIC_BACKEND_URL points to this app) ───
// Public test HLS streams — verified working, CORS-enabled.
const MOCK_STREAMS: { url: string; quality: string }[] = [
  {
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    quality: "1080p",
  },
  {
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8",
    quality: "720p",
  },
];

function mockResponse(animeId: number, episode: number) {
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
  };
}

export async function GET(
  _request: Request,
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

  const cfg = getBackendConfig();

  // 1. Backend URL is missing → mandatory error
  if (!cfg.configured) {
    return NextResponse.json(
      {
        error:
          "Backend not configured. Set NEXT_PUBLIC_BACKEND_URL to enable streaming.",
      },
      { status: 502 },
    );
  }

  // 2. Backend URL points to this app's own API (demo mode) → return mock data
  //    This avoids infinite self-proxy loops.
  const isSelfReferential =
    cfg.url.includes("localhost:3000") ||
    cfg.url.includes("127.0.0.1:3000") ||
    cfg.url.includes("space-z.ai");

  if (isSelfReferential) {
    return NextResponse.json(mockResponse(animeId, episode));
  }

  // 3. Real backend → proxy to it
  const { fetchEpisodeStream } = await import("@/lib/backend");
  const result = await fetchEpisodeStream(animeId, episode);
  if (!result) {
    return NextResponse.json(
      { error: "Backend returned no stream for this episode." },
      { status: 502 },
    );
  }
  return NextResponse.json(result);
}
