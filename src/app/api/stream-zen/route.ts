// app/api/stream-zen/route.ts
// ✅ CORS proxy for flixcloud.cc API
// ✅ flixcloud.cc is behind Cloudflare (returns 403 to direct browser fetches)
// ✅ Server-side fetch bypasses Cloudflare's browser challenge

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  const u = new URL(request.url);
  const anilistId = u.searchParams.get("anilistId");
  const episode = u.searchParams.get("episode");

  if (!anilistId || !episode) {
    return NextResponse.json(
      { error: "Missing anilistId or episode parameter" },
      { status: 400 },
    );
  }

  try {
    const upstreamUrl = `https://flixcloud.cc/videos/raw?anilist_id=${anilistId}&episode=${episode}`;
    const res = await fetch(upstreamUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}`, status: "error" },
        { status: 502 },
      );
    }

    const data = await res.json();

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: msg, status: "error" },
      { status: 502 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}
