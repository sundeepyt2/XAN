// app/api/stream-pahe/route.ts
// ✅ CORS proxy for nekostream mapper API (AnimePahe download links)
// ✅ Returns direct MP4 download URLs

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  const u = new URL(request.url);
  const malId = u.searchParams.get("malId");
  const episode = u.searchParams.get("episode");
  const ts = u.searchParams.get("ts") || Math.floor(Date.now() / 1000).toString();

  if (!malId || !episode) {
    return NextResponse.json(
      { error: "Missing malId or episode parameter" },
      { status: 400 },
    );
  }

  try {
    const upstreamUrl = `https://mapper.nekostream.site/api/mal/${malId}/${episode}/${ts}`;
    const res = await fetch(upstreamUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
        Accept: "application/json",
        Referer: "https://animex.one/",
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
