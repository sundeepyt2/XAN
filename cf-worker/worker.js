// XAN Cloudflare Worker v4 — Stream Proxy + AllAnime Episode Resolver
//
// This Worker does TWO jobs, both 100% free (no card, no external service):
//
//   1. Stream proxy (existing) — proxies video segment/manifest requests to
//      anime CDNs that require Referer/Origin headers. Browsers can't set
//      those headers themselves, so the Worker adds them.
//      Endpoint: GET /?url=<stream_url>&h_Referer=...&h_Origin=...
//
//   2. AllAnime episode resolver (NEW — uses Cloudflare Browser Rendering) —
//      fetches episode source URLs from AllAnime's GraphQL API, which as of
//      mid-2026 requires a Cloudflare Turnstile captcha token. The Worker
//      launches a managed Chrome browser on Cloudflare's edge, navigates to
//      AllAnime's episode page, the browser auto-passes Cloudflare's
//      "Just a moment..." challenge and AllAnime's Vue app auto-solves the
//      Turnstile widget (managed mode = no user interaction). The Worker
//      intercepts the GraphQL response, decrypts the AES-GCM-encrypted
//      `tobeparsed` field, and returns the sourceUrls[] as JSON.
//      Endpoint: GET /allanime/episode?showId=...&episodeString=...&translationType=sub|dub
//
// Free tier limits (no payment needed):
//   - 100,000 Worker requests/day
//   - 10 minutes/day of browser CPU time
//   - 10 concurrent browser sessions
//   - 60 seconds max per browser session
//
// For a personal XAN instance, these limits are generous. With 5-min caching,
// 10 min of browser CPU covers ~100-300 episode plays/day.

import puppeteer from "@cloudflare/puppeteer";

// ─── Stream proxy allowlist (unchanged from v2/v3) ───────────────────────
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
  "isekai2nd.com",
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

// ─── AllAnime AES-GCM decryption ──────────────────────────────────────────
// AllAnime encrypts the `episode.sourceUrls` field as `tobeparsed` — a base64
// blob with this structure:
//   byte 0:        version flag (must be 0x01)
//   bytes 1-13:    IV (12 bytes)
//   bytes 13-(N-16): ciphertext
//   last 16 bytes: GCM auth tag
// Key: SHA-256("Xot36i3lK3:v1")  (derived from char-code constants in bundle)

const ALLANIME_KEY_STR = "Xot36i3lK3:v1";
const ALLANIME_REFERER = "https://isekai2nd.com";
const ALLANIME_ORIGIN = "https://isekai2nd.com";

async function getAllAnimeKey() {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(ALLANIME_KEY_STR));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptTobeparsed(b64) {
  try {
    // Decode base64 to bytes
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    if (bytes.length < 32 || bytes[0] !== 1) return null;

    const iv = bytes.slice(1, 13);
    const ctWithTag = bytes.slice(13); // AES-GCM expects ciphertext+tag concatenated

    const key = await getAllAnimeKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ctWithTag
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (err) {
    console.error("[worker] decryptTobeparsed failed:", err);
    return null;
  }
}

// ─── In-memory response cache ────────────────────────────────────────────
// Episode sources don't change often — cache for 5 min to avoid re-launching
// the browser for repeat requests. Cache is per-Worker-isolate (not shared
// globally, but good enough — Cloudflare reuses isolates aggressively).
const responseCache = new Map(); // key: "showId:ep:mode" → { sources, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sources;
  }
  if (cached) responseCache.delete(key); // expired
  return null;
}

function setCached(key, sources) {
  responseCache.set(key, { sources, expiresAt: Date.now() + CACHE_TTL_MS });
  // Cap cache size to prevent memory leaks
  if (responseCache.size > 100) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
}

// ─── AllAnime episode resolver using Cloudflare Browser Rendering ─────────
//
// Flow:
//   1. Check cache — return immediately if hit
//   2. Launch managed Chrome browser via env.BROWSER binding
//   3. Open a new page, set realistic User-Agent
//   4. Register a response interceptor for api.allanime.day requests
//   5. Navigate to https://allmanga.to/bangumi/<showId>/p-<ep>-<mode>
//   6. Cloudflare's "Just a moment..." challenge auto-passes (Chrome on CF
//      infra is more trusted than random VPS IPs)
//   7. AllAnime's Vue app auto-renders Turnstile widget, which auto-solves
//      (managed mode = no user interaction)
//   8. Vue app fetches episode sources with the captcha token
//   9. Our interceptor captures the response, decrypts tobeparsed
//  10. Close browser, cache sources, return JSON
//
// Time budget: 60s max per browser session (Cloudflare limit). Typical
// execution: 20-40s.

async function fetchAllAnimeEpisodeViaBrowser(showId, episodeString, translationType, env) {
  const cacheKey = `${showId}:${episodeString}:${translationType}`;

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[worker] cache hit for ${cacheKey} (${cached.length} sources)`);
    return { sources: cached, cached: true, error: null };
  }

  console.log(`[worker] launching browser for ${cacheKey}`);

  if (!env.BROWSER) {
    return {
      sources: null,
      cached: false,
      error: "Browser binding not configured — add [[browser]] binding to wrangler.toml and redeploy",
    };
  }

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
  } catch (err) {
    return {
      sources: null,
      cached: false,
      error: `Failed to launch browser: ${err.message}. You may have hit the 10 concurrent session limit — retry in a moment.`,
    };
  }

  let page;
  try {
    page = await browser.newPage();

    // Realistic User-Agent (Cloudflare Browser Rendering uses Linux Chrome)
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    let sources = null;
    let graphQLCallCount = 0;

    // Intercept AllAnime API responses
    page.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("api.allanime.day")) return;
      if (!url.includes("/api?") && !url.includes("/api/graphql")) return;

      graphQLCallCount++;
      console.log(`[worker] GraphQL call #${graphQLCallCount}: ${response.status()} ${url.slice(0, 80)}...`);

      try {
        const text = await response.text();
        const json = JSON.parse(text);

        // Extract sourceUrls from tobeparsed (encrypted) or cleartext
        if (json.data?.tobeparsed) {
          const decrypted = await decryptTobeparsed(json.data.tobeparsed);
          if (decrypted?.episode?.sourceUrls) {
            sources = decrypted.episode.sourceUrls;
            console.log(`[worker] decrypted tobeparsed — ${sources.length} sources`);
          }
        } else if (json.data?.episode?.sourceUrls) {
          sources = json.data.episode.sourceUrls;
          console.log(`[worker] got cleartext sourceUrls — ${sources.length} sources`);
        }
      } catch (e) {
        // Not JSON or parse error — ignore
      }
    });

    // Navigate to the episode page
    const episodeUrl = `https://allmanga.to/bangumi/${showId}/p-${episodeString}-${translationType}`;
    console.log(`[worker] navigating to ${episodeUrl}`);

    try {
      await page.goto(episodeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    } catch (err) {
      console.warn(`[worker] initial goto error (may still be on CF challenge): ${err.message}`);
    }

    // Wait for Cloudflare challenge to resolve (title changes from "Just a moment...")
    try {
      await page.waitForFunction(
        () => document.title !== "Just a moment..." && !document.title.includes("Just a moment"),
        { timeout: 30000 }
      );
      console.log("[worker] Cloudflare challenge passed — page title:", await page.title());
    } catch (err) {
      console.warn("[worker] Cloudflare challenge may not have passed — title:", await page.title());
    }

    // Wait for sourceUrls to be captured (Vue app auto-fetches them after Turnstile solves)
    const maxWaitMs = 25000;
    const startWait = Date.now();
    while (!sources && Date.now() - startWait < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (sources && sources.length > 0) {
      const durationMs = Date.now() - startWait;
      console.log(`[worker] success — ${sources.length} sources captured in ${durationMs}ms`);
      setCached(cacheKey, sources);
      return { sources, cached: false, error: null, durationMs, graphQLCalls: graphQLCallCount };
    } else {
      const pageTitle = await page.title().catch(() => "unknown");
      console.warn(`[worker] no sources captured after ${maxWaitMs}ms (${graphQLCallCount} GraphQL calls seen)`);
      return {
        sources: null,
        cached: false,
        error: `Failed to capture sources — Cloudflare may have blocked the browser or Turnstile didn't auto-solve. Page title: "${pageTitle}"`,
        graphQLCalls: graphQLCallCount,
      };
    }
  } catch (err) {
    console.error("[worker] unexpected error:", err);
    return { sources: null, cached: false, error: err.message };
  } finally {
    // Always close the browser to free up the session slot
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn("[worker] failed to close browser:", e.message);
      }
    }
  }
}

// ─── Stream proxy (existing, unchanged) ───────────────────────────────────

async function proxyStream(url, headers, clientRequest) {
  if (!isAllowedHost(url)) {
    return jsonError("Host not allowed by proxy", 403);
  }

  const upstreamHeaders = {
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

    const respHeaders = new Headers(CORS_HEADERS);
    for (const h of FORWARD_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) respHeaders.set(h, v);
    }

    const contentType = upstream.headers.get("content-type") || "";
    const urlLower = url.toLowerCase();
    if (
      (contentType.indexOf("octet-stream") >= 0 || !contentType) &&
      (urlLower.indexOf(".mp4") >= 0 || urlLower.indexOf("/media") >= 0)
    ) {
      respHeaders.set("content-type", "video/mp4");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    const msg = (err && err.message) || "Unknown proxy error";
    return jsonError(msg, 502);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────

const worker = {
  async fetch(request, env) {
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

    // ─── AllAnime episode resolver endpoint ───
    // GET /allanime/episode?showId=...&episodeString=...&translationType=sub|dub
    if (url.pathname === "/allanime/episode") {
      if (request.method !== "GET") {
        return jsonError("Method not allowed - use GET", 405);
      }

      const showId = url.searchParams.get("showId");
      const episodeString = url.searchParams.get("episodeString");
      const translationType = url.searchParams.get("translationType") || "sub";

      if (!showId || !episodeString) {
        return jsonError("Missing showId or episodeString", 400);
      }
      if (translationType !== "sub" && translationType !== "dub") {
        return jsonError("translationType must be 'sub' or 'dub'", 400);
      }

      const result = await fetchAllAnimeEpisodeViaBrowser(
        showId,
        episodeString,
        translationType,
        env
      );

      return new Response(
        JSON.stringify({
          sources: result.sources,
          ...(result.cached ? { cached: true } : {}),
          ...(result.error ? { error: result.error } : {}),
          ...(result.durationMs ? { durationMs: result.durationMs } : {}),
          ...(result.graphQLCalls ? { graphQLCalls: result.graphQLCalls } : {}),
        }),
        {
          status: result.error && !result.sources ? 502 : 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            // Cache successful responses for 5 min — episode sources don't change often
            "cache-control": result.sources
              ? "public, max-age=300, s-maxage=600, stale-while-revalidate=3600"
              : "no-store",
          },
        }
      );
    }

    // ─── Health check / stream proxy ───
    if (request.method !== "GET") {
      return jsonError("Method not allowed - use GET", 405);
    }

    const target = url.searchParams.get("url");
    if (!target) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "xan-stream-proxy",
          version: 4,
          browserRendering: !!env.BROWSER,
          endpoints: {
            "/": "Stream proxy. Pass ?url=<stream_url>&h_Referer=... to proxy a request.",
            "/allanime/episode":
              "AllAnime episode resolver (uses Cloudflare Browser Rendering — free, no external solver). Pass ?showId=...&episodeString=...&translationType=sub|dub.",
          },
          cacheSize: responseCache.size,
          allowedHosts: ALLOWED_HOSTS.length,
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

    const customHeaders = {};
    url.searchParams.forEach(function (v, k) {
      if (k.indexOf("h_") === 0) {
        customHeaders[k.slice(2)] = v;
      }
    });

    return proxyStream(
      target,
      Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
      request
    );
  },
};

export default worker;
