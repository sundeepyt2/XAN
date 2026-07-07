// app/api/manifest-proxy/route.ts
//
// ✅ Tier 2 bandwidth saver: proxies ONLY the .m3u8 manifest (~5KB), then
//    lets hls.js load .ts segments DIRECTLY from the CDN (0 Vercel bandwidth
//    for video data).
//
// How it works:
//   1. Browser calls /api/manifest-proxy?url=<m3u8>&h_Referer=...&h_Origin=...
//   2. Server fetches the .m3u8 WITH the required headers (Referer/Origin)
//   3. Server rewrites all relative segment URLs in the manifest to ABSOLUTE
//      URLs pointing directly at the CDN
//   4. Server returns the rewritten manifest as text/plain (with CORS headers)
//   5. hls.js loads this small text response, parses it, then fetches each
//      .ts segment DIRECTLY from the CDN — bypassing Vercel entirely
//
// Bandwidth cost: ~5KB per episode (the manifest). vs ~200MB-1GB for full proxy.
//
// Fallback: if segments also require Referer (rare — most CDNs use signed URLs
// in the manifest), hls.js will emit segment-load errors. The player's smart
// loader detects this and falls back to /api/proxy_stream (full proxy).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

/**
 * Rewrite all relative URLs in an M3U8 playlist to absolute URLs.
 * This is the key trick: hls.js will then fetch segments directly from
 * the CDN, bypassing our server entirely.
 *
 * Handles:
 *   - Relative paths like "segment.ts" or "../segment.ts"
 *   - Protocol-relative URLs like "//cdn.example.com/seg.ts"
 *   - Sub-manifest URLs (variant playlists) — also rewritten
 *   - URI attributes inside #EXT-X-KEY, #EXT-X-MAP, etc.
 */
function rewriteManifest(manifest: string, baseUrl: string): string {
  const lines = manifest.split("\n");
  const baseOrigin = new URL(baseUrl).origin;

  return lines
    .map((line) => {
      const trimmed = line.trim();

      // Empty line or comment without URI
      if (!trimmed || (trimmed.startsWith("#") && !trimmed.includes("URI="))) {
        return line;
      }

      // Tag with URI attribute (e.g. #EXT-X-KEY:URI="key.bin", #EXT-X-MAP:URI="init.mp4")
      if (trimmed.startsWith("#") && trimmed.includes("URI=")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          const absolute = resolveUrl(uri, baseUrl, baseOrigin);
          return `URI="${absolute}"`;
        });
      }

      // Segment line (not a tag)
      if (!trimmed.startsWith("#")) {
        return resolveUrl(trimmed, baseUrl, baseOrigin);
      }

      return line;
    })
    .join("\n");
}

function resolveUrl(uri: string, baseUrl: string, baseOrigin: string): string {
  // Already absolute
  if (/^https?:\/\//i.test(uri)) {
    return uri;
  }
  // Protocol-relative
  if (uri.startsWith("//")) {
    return `https:${uri}`;
  }
  // Absolute path
  if (uri.startsWith("/")) {
    return `${baseOrigin}${uri}`;
  }
  // Relative path — use URL.resolve
  try {
    return new URL(uri, baseUrl).href;
  } catch {
    return uri;
  }
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const target = u.searchParams.get("url");

  if (!target) {
    return NextResponse.json(
      { error: "Missing url query param" },
      { status: 400 },
    );
  }

  if (!isAllowedHost(target)) {
    return NextResponse.json(
      { error: "Host not allowed by manifest proxy" },
      { status: 403 },
    );
  }

  // Extract custom headers (h_Referer, h_Origin, etc.)
  const headers: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    if (k.startsWith("h_")) {
      headers[k.slice(2)] = v;
    }
  });

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
    Accept: "*/*",
    ...headers,
  };

  // Forward Range header if present (for byte-range manifests — rare but possible)
  const range = request.headers.get("range");
  if (range) upstreamHeaders.range = range;

  try {
    const upstream = await fetch(target, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        {
          error: `Upstream returned ${upstream.status}`,
          url: target,
        },
        { status: 502 },
      );
    }

    const manifestText = await upstream.text();

    // Verify it's actually an M3U8 (defensive — don't proxy arbitrary content)
    if (!manifestText.trimStart().startsWith("#EXTM3U")) {
      return NextResponse.json(
        { error: "Upstream did not return a valid M3U8 manifest" },
        { status: 422 },
      );
    }

    const rewritten = rewriteManifest(manifestText, target);

    return new Response(rewritten, {
      status: 200,
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "range",
        "access-control-expose-headers": "content-length, content-type",
        // ✅ Edge-cache the rewritten manifest for 60s to skip the upstream
        //    fetch on repeat plays / seeks within the same session. HLS
        //    VOD manifests are stable enough for short caching; signed
        //    segment URLs embedded in the manifest typically live for
        //    hours, so a 60s manifest cache is safe.
        //    Previously `no-store` which forced a Vercel function invocation
        //    + AniList/AllAnime fetch on every play — burning Fast Origin
        //    Transfer bytes for no reason.
        "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        vary: "Origin",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown manifest proxy error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ✅ CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "range, content-type",
      "access-control-max-age": "86400",
    },
  });
}
