// app/api/stream/[id]/[ep]/route.ts
//
// ✅ Bug fixes:
// - When dub is requested but unavailable, falls back to sub instead of demo
// - Returns structured error when episode not yet released (instead of silent demo)
// - Better error context in response

import { NextResponse } from "next/server";
import {
  findShowByAniListId,
  extractStreamUrl,
  type StreamResult,
} from "@/lib/allanime";
import { fetchConsumetStream, getConsumetConfig } from "@/lib/consumet";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  // ✅ Sub/Dub switching: accept type=sub|dub, default to sub
  const requestedMode = url.searchParams.get("type") === "dub" ? "dub" : "sub";

  if (!allowDemo && title) {
    try {
      const show = await findShowByAniListId(animeId, title);
      if (show) {
        // ✅ Try requested mode first, then fall back to sub if dub fails
        const modesToTry: ("sub" | "dub")[] =
          requestedMode === "dub" ? ["dub", "sub"] : ["sub"];

        let lastResult: { sources: StreamResult[]; failures: { source: string; reason: string }[] } | null = null;

        for (const mode of modesToTry) {
          const result = await extractStreamUrl(show._id, String(episode), mode);
          if (result && result.sources.length > 0) {
            // ✅ Cap at 8 sources to keep the UI manageable (xancld uses 6)
            const cappedSources = result.sources.slice(0, 8);
            const picked = cappedSources[0];
            if (picked) {
              return NextResponse.json({
                stream: streamResultToJSON(picked),
                sources: cappedSources.map(streamResultToJSON),
                duration: null,
                episodeTitle: `Episode ${episode}`,
                thumbnail: null,
                provider: "allanime",
                mode, // ✅ tell the client which mode actually worked
                failures: result.failures,
                // ✅ If we fell back from dub to sub, tell the client
                ...(requestedMode === "dub" && mode === "sub"
                  ? { fallbackMode: "dub unavailable, fell back to sub" }
                  : {}),
              });
            }
          }
          if (result) lastResult = result;
        }

        // ✅ If we got here, both modes failed but AllAnime found the show.
        // Check if the episode is released yet.
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
            failures: lastResult?.failures ?? [],
          });
        }
      }
    } catch (err) {
      console.error("[stream] AllAnime attempt failed:", err);
    }
  }

  const cfg = getConsumetConfig();
  if (cfg.configured) {
    const stream = await fetchConsumetStream(animeId, episode);
    if (stream) {
      return NextResponse.json({
        stream: { url: stream.url, type: stream.type, quality: stream.quality },
        sources: [{ ...stream }],
        duration: null,
        episodeTitle: `Episode ${episode}`,
        thumbnail: null,
        provider: "consumet/animepahe",
      });
    }
  }

  const reasons: string[] = [];
  if (title) reasons.push("AllAnime stream extraction returned no playable sources");
  if (!cfg.configured) reasons.push("CONSUMET_URL not set");
  else reasons.push("Consumet returned no sources");

  return NextResponse.json(
    mockResponse(animeId, episode, reasons.join("; ") + ". Showing demo stream."),
  );
}
