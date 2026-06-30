// app/api/proxy_stream/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_HOSTS = [
  "tools.fast4speed.rsvp",
  "megacloud.tv",
  "vixcloud.co",
  "youtu-chan.com",
  "allanime.day",
  "allanime.uns.bio",
  "mp4upload.com",
  "bysekoze.com",
  "vidnest.io",
  "ok.ru",
  "repackager.wixmp.com",
  "allanimenews.com",
  "sharepoint.com",
  "fast4speed.rsvp",
  "wixmp.com",
  "pahe.nekostream.site",
  "nekostream.site",
  "kwik.cx",
  "kwik.si",
  "streamwish.to",
  "megaplay.buzz",
  "flixcloud.cc",
  "gogoanime.fi",
  "gogoanime.vc",
  "gogoanime.dk",
];

function isAllowedHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return ALLOWED_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
  "last-modified",
];

const FORWARD_REQUEST_HEADERS = ["range", "if-range", "if-modified-since"];

async function proxyStream(
  url: string,
  headers: Record<string, string> | undefined,
  clientRequest?: Request,
): Promise<Response> {
  if (!isAllowedHost(url)) {
    return NextResponse.json({ error: "Host not allowed by proxy" }, { status: 403 });
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
    Accept: "*/*",
    ...(headers ?? {}),
  };

  if (clientRequest) {
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = clientRequest.headers.get(h);
      if (v) upstreamHeaders[h] = v;
    }
  }

  try {
    const upstream = await fetch(url, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const respHeaders = new Headers();
    for (const h of FORWARD_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) respHeaders.set(h, v);
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    const urlLower = url.toLowerCase();
    if (
      (contentType.includes("octet-stream") || !contentType) &&
      (urlLower.includes(".mp4") || urlLower.includes("/media"))
    ) {
      respHeaders.set("content-type", "video/mp4");
    }

    respHeaders.set("access-control-allow-origin", "*");
    respHeaders.set("access-control-allow-headers", "range");
    respHeaders.set(
      "access-control-expose-headers",
      "content-length, content-range, content-type",
    );

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown proxy error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(request: Request) {
  let body: { url?: string; headers?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  return proxyStream(body.url, body.headers, request);
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const target = u.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url query param" }, { status: 400 });
  }
  const headers: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    if (k.startsWith("h_")) {
      headers[k.slice(2)] = v;
    }
  });
  return proxyStream(
    target,
    Object.keys(headers).length > 0 ? headers : undefined,
    request,
  );
}

// ✅ Handle CORS preflight (OPTIONS) requests — browsers send these before
// cross-origin POST requests. Without this handler, the proxy POST fails
// silently in browsers that enforce preflight.
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "range, content-type, if-range, if-modified-since",
      "access-control-max-age": "86400",
    },
  });
}
