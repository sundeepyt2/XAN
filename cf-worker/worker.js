// XAN External Stream Proxy — Cloudflare Worker
// Re-paste this ENTIRE file into the Cloudflare editor, replacing everything.

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
];

function isAllowedHost(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some(
      (h) => host === h || host.endsWith("." + h)
    );
  } catch (e) {
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

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "range",
  "access-control-expose-headers":
    "content-length, content-range, content-type",
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status: status || 400,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers":
            "range, content-type, if-range, if-modified-since",
          "access-control-max-age": "86400",
        },
      });
    }

    if (request.method !== "GET") {
      return jsonError("Method not allowed - use GET", 405);
    }

    // Health check
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "xan-stream-proxy",
          version: 2,
          allowedHosts: ALLOWED_HOSTS.length,
          message:
            "Cloudflare Worker proxy for XAN. Pass ?url=<stream_url> to proxy a request.",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          },
        }
      );
    }

    // Host allowlist
    if (!isAllowedHost(target)) {
      return jsonError(
        "Host not allowed: " + (function () {
          try {
            return new URL(target).hostname;
          } catch (e) {
            return "invalid-url";
          }
        })(),
        403
      );
    }

    // Build upstream headers (h_Referer, h_Origin, etc. -> Referer, Origin)
    const customHeaders = {};
    url.searchParams.forEach(function (v, k) {
      if (k.indexOf("h_") === 0) {
        customHeaders[k.slice(2)] = v;
      }
    });

    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
      Accept: "*/*",
    };
    Object.keys(customHeaders).forEach(function (k) {
      upstreamHeaders[k] = customHeaders[k];
    });

    // Forward Range / conditional-fetch headers
    for (let i = 0; i < FORWARD_REQUEST_HEADERS.length; i++) {
      const h = FORWARD_REQUEST_HEADERS[i];
      const v = request.headers.get(h);
      if (v) upstreamHeaders[h] = v;
    }

    // Fetch upstream
    try {
      const upstream = await fetch(target, {
        headers: upstreamHeaders,
        redirect: "follow",
      });

      // Build response headers
      const respHeaders = new Headers(CORS_HEADERS);
      for (let i = 0; i < FORWARD_RESPONSE_HEADERS.length; i++) {
        const h = FORWARD_RESPONSE_HEADERS[i];
        const v = upstream.headers.get(h);
        if (v) respHeaders.set(h, v);
      }

      // Fix content-type for MP4 streams
      const contentType = upstream.headers.get("content-type") || "";
      const urlLower = target.toLowerCase();
      if (
        (contentType.indexOf("octet-stream") >= 0 || !contentType) &&
        (urlLower.indexOf(".mp4") >= 0 || urlLower.indexOf("/media") >= 0)
      ) {
        respHeaders.set("content-type", "video/mp4");
      }

      // Stream the response body back
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: respHeaders,
      });
    } catch (err) {
      const msg = (err && err.message) || "Unknown proxy error";
      return jsonError(msg, 502);
    }
  },
};
