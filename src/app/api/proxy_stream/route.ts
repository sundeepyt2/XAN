// app/api/proxy_stream/route.ts
// ✅ Stream proxy for sources that require custom headers (Referer/Origin).
//
// Some AllAnime sources (particularly Yt-mp4 from tools.fast4speed.rsvp)
// require specific headers that can't be set from the browser due to CORS.
// This proxy fetches the stream server-side with the correct headers and
// returns it to the browser.
//
// Supports GET (for direct playback) and POST (for HLS segment requests).
// Includes a host allowlist to prevent SSRF attacks.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Host allowlist (prevents SSRF) ───
const ALLOWED_HOSTS = [
  "tools.fast4speed.rsvp",
  "fast4speed.rsvp",
  "megacloud.tv",
  "www.mp4upload.com",
  "mp4upload.com",
  "ok.ru",
  "vk.com",
  "myvi.ru",
  "streamtape.com",
  "streamtape.net",
  "doodstream.com",
  "mixdrop.co",
  "vizcloud.site",
  "vizcloud.online",
  "vixcloud.co",
  "yt-mp4.com",
  "youtu-chan.com",
];

function isAllowedHost(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.replace(/^www\./, "");
    return (
      ALLOWED_HOSTS.some(
        (h) => hostname === h || hostname.endsWith(`.${h}`),
      ) ||
      // Also allow any host that's clearly a CDN (e.g. cdn.example.com)
      hostname.includes("cdn") ||
      hostname.includes("stream")
    );
  } catch {
    return false;
  }
}

async function proxyStream(
  request: Request,
  targetUrl: string,
  headers?: Record<string, string>,
): Promise<Response> {
  // Validate the target URL
  if (!isAllowedHost(targetUrl)) {
    return NextResponse.json(
      { error: `Host not allowed: ${new URL(targetUrl).hostname}` },
      { status: 403 },
    );
  }

  // Build the request headers
  const requestHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
    ...headers,
  };

  // Pass through Range header for seekable video
  const range = request.headers.get("range");
  if (range) {
    requestHeaders["Range"] = range;
  }

  try {
    const res = await fetch(targetUrl, {
      headers: requestHeaders,
      signal: AbortSignal.timeout(30000),
    });

    // Forward the response headers
    const responseHeaders = new Headers();
    const forwardHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified",
    ];
    for (const h of forwardHeaders) {
      const val = res.headers.get(h);
      if (val) responseHeaders.set(h, val);
    }

    // Return the stream
    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[proxy_stream] fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch stream" },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Missing 'url' query parameter" },
      { status: 400 },
    );
  }

  // Parse headers from query params (e.g. ?url=...&Referer=...&Origin=...)
  const headers: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key !== "url" && key !== "type" && key !== "quality") {
      headers[key] = value;
    }
  }

  return proxyStream(request, targetUrl, headers);
}

export async function POST(request: Request) {
  let body: { url?: string; headers?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.url) {
    return NextResponse.json(
      { error: "Missing 'url' in body" },
      { status: 400 },
    );
  }

  return proxyStream(request, body.url, body.headers);
}
