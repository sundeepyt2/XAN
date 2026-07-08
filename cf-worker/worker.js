// XAN Cloudflare Worker v5 — Stream Proxy + AllAnime Episode Resolver (direct crypto)
//
// BREAKTHROUGH: Instead of using Browser Rendering to load mkissa.to and
// intercept the API call, this Worker implements AllAnime's NEW crypto
// scheme DIRECTLY. No browser needed — just pure Web Crypto.
//
// The crypto scheme (reverse-engineered from mkissa.to's SvelteKit bundle):
//
//   1. AllAnime embeds __aaCrypto = {epoch, partB} in the page HTML
//      (mkissa.to returns 200 with no Cloudflare challenge)
//   2. The AES key is derived: key = XOR(atob(partB), hexToBytes(MASK))
//      where MASK = "b1a9a4d051988f1b1b12dbb747439d9bd64b09ea17835600a7eaa4de87c1ad87"
//   3. For each episode query, build a signed "aaReq" extension:
//      a. ts = Math.floor(Date.now() / 300000) * 300000  (5-min bucket)
//      b. payload = JSON.stringify({v:1, ts, epoch, buildId:"9", qh:queryHash})
//      c. iv = SHA-256(epoch + ":" + buildId + ":" + queryHash + ":" + ts).slice(0, 12)
//      d. encrypted = AES-GCM-encrypt(key, iv, payload)
//      e. aaReq = base64([0x01][iv(12)][encrypted+tag])
//   4. POST to https://api.allanime.day/api with:
//      - body: {query, variables, extensions: {persistedQuery, aaReq}}
//      - headers: Content-Type: application/json, x-build-id: "9"
//   5. Server returns tobeparsed (encrypted with OLD key sha256("Xot36i3lK3:v1"))
//   6. Worker decrypts tobeparsed → sourceUrls
//
// This is 10x faster than Browser Rendering (no Chrome launch) and works
// on the free tier with no browser CPU limits.

// ─── Constants (from mkissa.to's bundle) ──────────────────────────────────
const MASK_HEX = "b1a9a4d051988f1b1b12dbb747439d9bd64b09ea17835600a7eaa4de87c1ad87";
const BUILD_ID = "9";
const OLD_KEY_STR = "Xot36i3lK3:v1"; // for decrypting tobeparsed (unchanged)
const ALLANIME_API = "https://api.allanime.day/api";
const MKISSA_EPISODE_URL = (showId, ep, mode) => `https://mkissa.to/watch/${showId}/p-${ep}-${mode}`;

// ─── Stream proxy allowlist (unchanged) ───────────────────────────────────
const ALLOWED_HOSTS = [
  "tools.fast4speed.rsvp", "megacloud.tv", "vixcloud.co", "youtu-chan.com",
  "allanime.day", "allanime.uns.bio", "mp4upload.com", "bysekoze.com",
  "vidnest.io", "ok.ru", "repackager.wixmp.com", "allanimenews.com",
  "sharepoint.com", "fast4speed.rsvp", "wixmp.com", "pahe.nekostream.site",
  "nekostream.site", "kwik.cx", "kwik.si", "streamwish.to", "megaplay.buzz",
  "flixcloud.cc", "gogoanime.fi", "gogoanime.vc", "gogoanime.dk", "isekai2nd.com",
];

function isAllowedHost(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch { return false; }
}

const FORWARD_RESPONSE_HEADERS = ["content-type","content-length","content-range","accept-ranges","cache-control","etag","last-modified"];
const FORWARD_REQUEST_HEADERS = ["range","if-range","if-modified-since"];
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "range",
  "access-control-expose-headers": "content-length, content-range, content-type",
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status: status || 400,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function errToString(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ─── AES-GCM decryption for tobeparsed ────────────────────────────────────
// mkissa.to's NEW scheme encrypts tobeparsed with the SAME key used for
// signing requests (mask XOR partB). The OLD scheme (allmanga.to) used
// sha256("Xot36i3lK3:v1"). We try the new key first, fall back to old.

async function getOldKey() {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(OLD_KEY_STR));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptTobeparsed(b64, newKey) {
  try {
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    if (bytes.length < 32 || bytes[0] !== 1) return null;
    const iv = bytes.slice(1, 13);
    const ctWithTag = bytes.slice(13);

    // Try NEW key first (mkissa.to's primary path)
    if (newKey) {
      try {
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, newKey, ctWithTag);
        return JSON.parse(new TextDecoder().decode(plaintext));
      } catch (e) {
        console.log("[worker] new key decrypt failed, trying old key...");
      }
    }

    // Fallback: OLD key (sha256("Xot36i3lK3:v1"))
    try {
      const oldKey = await getOldKey();
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, oldKey, ctWithTag);
      return JSON.parse(new TextDecoder().decode(plaintext));
    } catch (e) {
      console.error("[worker] old key decrypt also failed:", errToString(e));
      return null;
    }
  } catch (err) {
    console.error("[worker] decryptTobeparsed failed:", errToString(err));
    return null;
  }
}

// ─── NEW: Direct crypto implementation (no browser needed) ────────────────

// Convert hex string to Uint8Array
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Derive the AES key from partB and the mask
// key = XOR(atob(partB), maskBytes)  — both are 32 bytes
// This key is used for BOTH signing requests AND decrypting tobeparsed
async function deriveAesKey(partB) {
  const maskBytes = hexToBytes(MASK_HEX);
  const partBBytes = Uint8Array.from(atob(partB), (c) => c.charCodeAt(0));
  if (partBBytes.length < 32) throw new Error("partB too short");
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = partBBytes[i] ^ maskBytes[i % maskBytes.length];
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// Compute SHA-256 and return Uint8Array
async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

// Build the aaReq extension (the signed request proof)
// Mirrors mkissa.to's a0() function
async function buildAaReq(queryHash, epoch, aesKey) {
  const ts = Math.floor(Date.now() / 300000) * 300000; // 5-min bucket
  const payload = JSON.stringify({ v: 1, ts, epoch, buildId: BUILD_ID, qh: queryHash });
  // iv = SHA-256(epoch + ":" + buildId + ":" + queryHash + ":" + ts).slice(0, 12)
  const ivSource = `${epoch}:${BUILD_ID}:${queryHash}:${ts}`;
  const ivHash = await sha256(ivSource);
  const iv = ivHash.slice(0, 12);
  // Encrypt payload
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(payload)
  );
  // Format: [0x01][iv(12)][encrypted+tag]
  const encryptedBytes = new Uint8Array(encrypted);
  const result = new Uint8Array(1 + 12 + encryptedBytes.length);
  result[0] = 1;
  result.set(iv, 1);
  result.set(encryptedBytes, 13);
  // Base64 encode
  let binary = "";
  for (let i = 0; i < result.length; i++) binary += String.fromCharCode(result[i]);
  return btoa(binary);
}

// Fetch __aaCrypto from mkissa.to's episode page HTML
async function fetchAaCrypto(showId, episodeString, translationType) {
  const url = MKISSA_EPISODE_URL(showId, episodeString, translationType);
  console.log(`[worker] fetching __aaCrypto from ${url}`);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`mkissa.to returned HTTP ${res.status}`);
  }
  const html = await res.text();
  // Extract window.__aaCrypto={...}
  const match = html.match(/window\.__aaCrypto\s*=\s*(\{[^}]+\})/);
  if (!match) {
    throw new Error("__aaCrypto not found in mkissa.to page HTML");
  }
  const aaCrypto = JSON.parse(match[1]);
  if (!aaCrypto.partB || !aaCrypto.epoch) {
    throw new Error(`__aaCrypto missing required fields: ${JSON.stringify(aaCrypto)}`);
  }
  console.log(`[worker] __aaCrypto: epoch=${aaCrypto.epoch}, partB length=${aaCrypto.partB.length}`);
  return aaCrypto;
}

// Compute the query hash (SHA-256 of the query string)
async function computeQueryHash(queryStr) {
  const hash = await sha256(queryStr);
  // Convert to hex string
  return Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── In-memory cache ─────────────────────────────────────────────────────
const responseCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.sources;
  if (cached) responseCache.delete(key);
  return null;
}

function setCached(key, sources) {
  responseCache.set(key, { sources, expiresAt: Date.now() + CACHE_TTL_MS });
  if (responseCache.size > 100) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
}

// Cache for __aaCrypto + derived AES key (valid for the epoch duration)
let aaCryptoCache = null; // { aaCrypto, aesKey, expiresAt }

async function getAaCryptoAndKey(showId, episodeString, translationType) {
  if (aaCryptoCache && aaCryptoCache.expiresAt > Date.now()) {
    return aaCryptoCache;
  }
  const aaCrypto = await fetchAaCrypto(showId, episodeString, translationType);
  const aesKey = await deriveAesKey(aaCrypto.partB);
  aaCryptoCache = {
    aaCrypto,
    aesKey,
    expiresAt: Date.now() + (aaCrypto.epochMs || 432000000), // 5 days default
  };
  return aaCryptoCache;
}

// ─── Episode resolver (direct crypto, no browser) ─────────────────────────

// The EXACT query mkissa.to uses — the server expects all these fields
// (querying for just sourceUrls causes "Cannot set properties of undefined" errors)
const EPISODE_QUERY = `query(
$showId: String!
$translationType: VaildTranslationTypeEnumType!
$episodeString: String!
) {
episode(
showId: $showId
translationType: $translationType
episodeString: $episodeString
) {
episodeString
uploadDate
sourceUrls
thumbnail
notes
show{
_id
name
englishName
nativeName
slugTime
thumbnail
lastEpisodeInfo
lastEpisodeDate
type
season
score
airedStart
availableEpisodes
episodeDuration
episodeCount
lastUpdateEnd
characterCount
description
broadcastInterval
banner
characters
availableEpisodesDetail
nameOnlyString
isAdult
relatedShows
relatedMangas
altNames
disqusIds
}
pageStatus{
_id
notes
pageId
showId
views
likesCount
commentCount
dislikesCount
reviewCount
userScoreCount
userScoreTotalValue
userScoreAverValue
}
episodeInfo{
notes
thumbnails
vidInforssub
uploadDates
vidInforsdub
vidInforsraw
description
}
versionFix
}
}`;

async function fetchAllAnimeEpisodeDirect(showId, episodeString, translationType) {
  const cacheKey = `${showId}:${episodeString}:${translationType}`;

  // Check cache
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[worker] cache hit for ${cacheKey} (${cached.length} sources)`);
    return { sources: cached, cached: true, error: null };
  }

  console.log(`[worker] direct crypto resolve for ${cacheKey}`);

  try {
    // Step 1: Get __aaCrypto from mkissa.to (no Cloudflare challenge!)
    const { aaCrypto, aesKey } = await getAaCryptoAndKey(showId, episodeString, translationType);

    // Step 2: Compute query hash
    const queryHash = await computeQueryHash(EPISODE_QUERY);
    console.log(`[worker] queryHash: ${queryHash.slice(0, 16)}...`);

    // Step 3: Build aaReq extension (the signed proof)
    const aaReq = await buildAaReq(queryHash, aaCrypto.epoch, aesKey);
    console.log(`[worker] aaReq built (length: ${aaReq.length})`);

    // Step 4: POST to api.allanime.day/api with the signed request
    const body = {
      query: EPISODE_QUERY,
      variables: { showId, episodeString, translationType },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: queryHash },
        aaReq,
      },
    };

    const res = await fetch(ALLANIME_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Referer": "https://mkissa.to/",
        "Origin": "https://mkissa.to",
        "x-build-id": BUILD_ID,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { sources: null, error: `AllAnime API HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const json = await res.json();

    if (json.errors && json.errors[0]) {
      const err = json.errors[0];
      // If crypto is rejected, clear the cache so next call re-fetches __aaCrypto
      if (err.extensions?.code?.startsWith("AA_CRYPTO")) {
        aaCryptoCache = null;
      }
      return { sources: null, error: `AllAnime GraphQL: ${err.message} (${err.extensions?.code})` };
    }

    // Step 5: Decrypt tobeparsed (try new key first, old key as fallback)
    if (json.data?.tobeparsed) {
      const decrypted = await decryptTobeparsed(json.data.tobeparsed, aesKey);
      const sources = decrypted?.episode?.sourceUrls ?? [];
      if (sources.length === 0) {
        return { sources: null, error: "tobeparsed decrypted but no sourceUrls" };
      }
      console.log(`[worker] success — ${sources.length} sources`);
      setCached(cacheKey, sources);
      return { sources, cached: false, error: null };
    }

    if (json.data?.episode?.sourceUrls) {
      const sources = json.data.episode.sourceUrls;
      console.log(`[worker] success (cleartext) — ${sources.length} sources`);
      setCached(cacheKey, sources);
      return { sources, cached: false, error: null };
    }

    return { sources: null, error: "No sourceUrls in response" };
  } catch (err) {
    return { sources: null, error: `Direct crypto failed: ${errToString(err)}` };
  }
}

// ─── Stream proxy (unchanged) ─────────────────────────────────────────────

async function proxyStream(url, headers, clientRequest) {
  if (!isAllowedHost(url)) return jsonError("Host not allowed by proxy", 403);
  const upstreamHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
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
    const upstream = await fetch(url, { headers: upstreamHeaders, redirect: "follow" });
    const respHeaders = new Headers(CORS_HEADERS);
    for (const h of FORWARD_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) respHeaders.set(h, v);
    }
    const contentType = upstream.headers.get("content-type") || "";
    const urlLower = url.toLowerCase();
    if ((contentType.indexOf("octet-stream") >= 0 || !contentType) &&
        (urlLower.indexOf(".mp4") >= 0 || urlLower.indexOf("/media") >= 0)) {
      respHeaders.set("content-type", "video/mp4");
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return jsonError(errToString(err), 502);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "range, content-type, if-range, if-modified-since",
          "access-control-max-age": "86400",
        },
      });
    }

    // ─── AllAnime episode resolver (direct crypto, no browser) ───
    if (url.pathname === "/allanime/episode") {
      if (request.method !== "GET") return jsonError("Method not allowed - use GET", 405);

      const showId = url.searchParams.get("showId");
      const episodeString = url.searchParams.get("episodeString");
      const translationType = url.searchParams.get("translationType") || "sub";

      if (!showId || !episodeString) return jsonError("Missing showId or episodeString", 400);
      if (translationType !== "sub" && translationType !== "dub") {
        return jsonError("translationType must be 'sub' or 'dub'", 400);
      }

      const result = await fetchAllAnimeEpisodeDirect(showId, episodeString, translationType);

      return new Response(
        JSON.stringify({
          sources: result.sources,
          ...(result.cached ? { cached: true } : {}),
          ...(result.error ? { error: result.error } : {}),
        }),
        {
          status: result.error && !result.sources ? 502 : 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "cache-control": result.sources
              ? "public, max-age=300, s-maxage=600, stale-while-revalidate=3600"
              : "no-store",
          },
        }
      );
    }

    // ─── Health check / stream proxy ───
    if (request.method !== "GET") return jsonError("Method not allowed - use GET", 405);

    const target = url.searchParams.get("url");
    if (!target) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "xan-stream-proxy",
          version: 5,
          mode: "direct-crypto", // No browser needed!
          endpoints: {
            "/": "Stream proxy. Pass ?url=<stream_url>&h_Referer=... to proxy a request.",
            "/allanime/episode":
              "AllAnime episode resolver (direct crypto — no browser needed). Pass ?showId=...&episodeString=...&translationType=sub|dub.",
          },
          cacheSize: responseCache.size,
          allowedHosts: ALLOWED_HOSTS.length,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        }
      );
    }

    if (!isAllowedHost(target)) {
      return jsonError("Host not allowed: " + (function(){try{return new URL(target).hostname}catch{return"invalid-url"}})(), 403);
    }

    const customHeaders = {};
    url.searchParams.forEach(function (v, k) {
      if (k.indexOf("h_") === 0) customHeaders[k.slice(2)] = v;
    });

    return proxyStream(target, Object.keys(customHeaders).length > 0 ? customHeaders : undefined, request);
  },
};

export default worker;
