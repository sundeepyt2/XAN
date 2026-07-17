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

// ─── MASK / BUILD_ID — self-healing with hardcoded fallback ───────────────
// mkissa.to rotates the AES-key MASK and bumps BUILD_ID every time they deploy
// a new build (every few days/weeks). When that happens, AllAnime's API rejects
// every signed request with AA_CRYPTO_STALE.
//
// This Worker self-heals: when AA_CRYPTO_STALE is returned, it crawls mkissa.to's
// SvelteKit bundle at runtime, finds the new MASK and BUILD_ID by regex, caches
// them in memory, and retries the request — all without a code update.
//
// The FALLBACK values below are used:
//   - on the very first request after a cold start (before discovery has run)
//   - if runtime discovery fails (e.g. mkissa.to is down, or the pattern shape
//     changed and the regexes below no longer match — in which case update the
//     regexes in discoverMaskFromMkissa() and the fallback values here, then
//     redeploy)
// Last manual verification: 2026-07-17
const FALLBACK_MASK_HEX = "5264513ba898cb78c5c646bc1c12f2965a53a99891d91e83a2bf9244c36cca41";
const FALLBACK_BUILD_ID = "41";

// Runtime cache for discovered MASK/BUILD_ID. Lives for the lifetime of the
// Worker isolate (cross-request within the same isolate). TTL is long because
// the MASK only changes every few days/weeks — STALE will trigger a refresh.
let discoveredCrypto = null; // { mask, buildId, expiresAt }
const DISCOVERED_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const OLD_KEY_STR = "Xot36i3lK3:v1"; // for decrypting tobeparsed (unchanged)
const ALLANIME_API = "https://api.allanime.day/api";
const MKISSA_EPISODE_URL = (showId, ep, mode) => `https://mkissa.to/watch/${showId}/p-${ep}-${mode}`;
const MKISSA_ORIGIN = "https://mkissa.to/";
const MKISSA_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
async function deriveAesKey(partB, maskHex) {
  const maskBytes = hexToBytes(maskHex);
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
async function buildAaReq(queryHash, epoch, aesKey, buildId) {
  const ts = Math.floor(Date.now() / 300000) * 300000; // 5-min bucket
  const payload = JSON.stringify({ v: 1, ts, epoch, buildId, qh: queryHash });
  // iv = SHA-256(epoch + ":" + buildId + ":" + queryHash + ":" + ts).slice(0, 12)
  const ivSource = `${epoch}:${buildId}:${queryHash}:${ts}`;
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

// ─── Runtime MASK/BUILD_ID discovery (self-healing) ───────────────────────
// Crawls mkissa.to's SvelteKit bundle at runtime to find the current MASK and
// BUILD_ID. Called automatically when AllAnime returns AA_CRYPTO_STALE, so the
// Worker self-heals without needing a code update on every mkissa.to deploy.
//
// Strategy (optimized for Cloudflare Workers' 50-subrequest free-tier limit):
//   1. Fetch https://mkissa.to/ (1 subrequest) — extract entry chunk URLs
//   2. Fetch entry chunks (1–2 subrequests) — extract /chunks/ URLs
//   3. Fetch each chunk in parallel (Promise.all, ~10 subrequests) — search
//      each for the MASK pattern, short-circuit on first hit
// Total: ~13 subrequests, well under the 50-subrequest free-tier limit.

// Robust pattern matching for MASK and BUILD_ID.
//
// mkissa.to's minifier changes the exact shape of these assignments across builds.
// Observed shapes so far:
//
//   Build A (2026-07-08, BUILD_ID=9):
//     const $n=_t(460)!=='string'?"<MASK_HEX>":"",zr="9"
//     buildId:zr, x-build-id:zr
//     → MASK wrapped in _t() check, BUILD_ID is plain string
//
//   Build B (2026-07-11, BUILD_ID=13):
//     const $n=_t(460)!=='string'?"<MASK_HEX>":"",zr="13"
//     buildId:zr, x-build-id:zr  (same shape, different values)
//
//   Build C (2026-07-15+, BUILD_ID=20):
//     const Ju="<MASK_HEX>",sr=_t(483)!=='string'?"20":""
//     buildId:sr, x-build-id:sr
//     → MASK is plain string, BUILD_ID wrapped in _t() check (shapes swapped!)
//
// Robust strategy: instead of matching one exact shape, we:
//   1. Find the ONLY 64-hex string literal in the chunk → that's the MASK
//   2. Find buildId:<var> or x-build-id":<var> → that var holds the BUILD_ID
//   3. Look up that var's assignment: either <var>="<N>" or
//      <var>=_t(N)!=='string'?"<N>":""  → extract the number
//
// This handles all observed shapes and should handle future variations as long
// as (a) the MASK remains the only 64-hex literal and (b) the BUILD_ID remains
// a small integer string referenced via buildId: or x-build-id.

// Any 64-hex string literal (with word boundaries on both sides)
const HEX_64_PATTERN = /"([0-9a-fA-F]{64})"/;
// References like  buildId:<var>  or  x-build-id":<var>
const BUILD_ID_REF_PATTERN = /(?:buildId|x-build-id")\s*:\s*([A-Za-z_$][\w$]*)/g;
// Direct assignment: <var>="<digits>"  (optionally prefixed with const|var|let|,)
function makeBuildIdDirectPattern(varName) {
  const v = varName.replace(/\$/g, "\\$");
  return new RegExp("(?:const|var|let|,)\\s*" + v + '\\s*=\\s*"(\\d{1,3})"');
}
// Wrapped assignment: <var>=_t(N)!=='string'?"<digits>":""
function makeBuildIdWrappedPattern(varName) {
  const v = varName.replace(/\$/g, "\\$");
  return new RegExp(v + '\\s*=\\s*[A-Za-z_$][\\w$]*\\(\\s*\\d+\\s*\\)\\s*!==\\s*"string"\\s*\\?\\s*"(\\d{1,3})"');
}

// Extract MASK and BUILD_ID from a chunk's source code using the robust strategy.
// Returns { mask, buildId } or null if not found.
function extractMaskAndBuildId(src) {
  // 1. Find the (only) 64-hex string literal
  const hexMatch = src.match(HEX_64_PATTERN);
  if (!hexMatch) return null;
  const mask = hexMatch[1];

  // 2. Find all buildId:<var> references and collect candidate values
  const buildIdRefs = [...src.matchAll(BUILD_ID_REF_PATTERN)];
  if (buildIdRefs.length === 0) return { mask, buildId: null };

  // For each referenced var, try to find its assignment
  const candidates = [];
  const seenVars = new Set();
  for (const ref of buildIdRefs) {
    const varName = ref[1];
    if (seenVars.has(varName)) continue;
    seenVars.add(varName);

    // Try direct assignment first: <var>="<N>"
    const directPat = makeBuildIdDirectPattern(varName);
    const directMatch = src.match(directPat);
    if (directMatch) {
      candidates.push(directMatch[1]);
      continue;
    }

    // Try wrapped assignment: <var>=_t(N)!=='string'?"<N>":""
    const wrappedPat = makeBuildIdWrappedPattern(varName);
    const wrappedMatch = src.match(wrappedPat);
    if (wrappedMatch) {
      candidates.push(wrappedMatch[1]);
    }
  }

  if (candidates.length === 0) return { mask, buildId: null };

  // Pick the most common candidate (in case multiple vars are referenced,
  // they should all resolve to the same BUILD_ID value)
  const counts = {};
  for (const c of candidates) counts[c] = (counts[c] || 0) + 1;
  const buildId = candidates.sort((a, b) => counts[b] - counts[a])[0];

  return { mask, buildId };
}

function resolveChunkUrl(rel, baseUrl) {
  if (rel.startsWith("http://") || rel.startsWith("https://")) return rel;
  const clean = rel.split("?")[0].split("#")[0];
  // Strip the filename from baseUrl to get the directory
  let baseDir = baseUrl.slice(0, baseUrl.lastIndexOf("/"));
  let r = clean;
  while (r.startsWith("../")) {
    baseDir = baseDir.slice(0, baseDir.lastIndexOf("/"));
    r = r.slice(3);
  }
  if (r.startsWith("./")) r = r.slice(2);
  return `${baseDir}/${r}`;
}

async function discoverMaskFromMkissa() {
  console.log("[worker] discovering fresh MASK/BUILD_ID from mkissa.to bundle");

  // Step 1: Fetch landing page
  const htmlRes = await fetch(MKISSA_ORIGIN, {
    headers: {
      "User-Agent": MKISSA_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!htmlRes.ok) throw new Error(`mkissa.to returned HTTP ${htmlRes.status}`);
  const html = await htmlRes.text();

  // Step 2: Extract entry chunk URLs from `import("...")` calls
  const entryUrlMatches = [...html.matchAll(/import\(\s*"([^"]+\.js)"\s*\)/g)];
  const entryUrls = entryUrlMatches
    .map((m) => m[1])
    .filter((u) => u.includes("/_app/immutable/entry/"));
  if (entryUrls.length === 0) {
    throw new Error("no entry chunk URLs found in mkissa.to HTML");
  }

  // Step 3: BFS crawl — fetch chunks at increasing depths, searching each for
  // the MASK pattern and collecting new chunk URLs to crawl next.
  //
  // The MASK chunk is NOT always directly imported by the entry chunks —
  // it can be nested 2+ levels deep (e.g. entry → chunkA → chunkB(=MASK)).
  // We crawl breadth-first and short-circuit the moment we find a hit.
  //
  // Subrequest budget: CF Workers free tier allows 50 subrequests per request.
  // Worst case: 1 (HTML) + 2 (entries) + ~10 (depth 1) + ~15 (depth 2) = ~28.
  // We cap at MAX_CHUNKS_TO_CRAWL=40 to stay safely under the limit.
  const MAX_CHUNKS_TO_CRAWL = 40;
  const visited = new Set();
  const queue = [...entryUrls];
  let crawlCount = 0;

  while (queue.length > 0 && crawlCount < MAX_CHUNKS_TO_CRAWL) {
    // Take a batch from the queue (process in parallel for speed)
    const batch = queue.splice(0, Math.min(queue.length, 10));
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        if (visited.has(url)) return { found: null, newUrls: [] };
        visited.add(url);
        crawlCount++;
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": MKISSA_UA, "Accept": "*/*" },
          });
          if (!res.ok) return { found: null, newUrls: [] };
          const src = await res.text();

          // Search for MASK + BUILD_ID in this chunk
          const extracted = extractMaskAndBuildId(src);
          if (extracted && extracted.buildId) {
            return {
              found: {
                mask: extracted.mask,
                buildId: extracted.buildId,
                chunkUrl: url,
              },
              newUrls: [],
            };
          }

          // Not found here — collect new chunk URLs for the next depth level
          const newUrls = [];
          for (const m of src.matchAll(/import\(\s*"([^"]+\.js)"\s*\)/g)) {
            const abs = resolveChunkUrl(m[1], url);
            if (abs.includes("/_app/immutable/chunks/") && !visited.has(abs)) {
              newUrls.push(abs);
            }
          }
          for (const m of src.matchAll(/from\s*"([^"]+\.js)"/g)) {
            const abs = resolveChunkUrl(m[1], url);
            if (abs.includes("/_app/immutable/chunks/") && !visited.has(abs)) {
              newUrls.push(abs);
            }
          }
          return { found: null, newUrls };
        } catch (e) {
          return { found: null, newUrls: [] };
        }
      })
    );

    // Check if any chunk in this batch had the MASK
    const found = batchResults.find((r) => r.found !== null);
    if (found) {
      console.log(
        `[worker] ✓ discovered MASK=${found.found.mask.slice(0, 16)}... BUILD_ID=${found.found.buildId} from ${found.found.chunkUrl.split("/").pop()} (crawled ${crawlCount} chunks)`
      );
      return { mask: found.found.mask, buildId: found.found.buildId };
    }

    // Add new URLs to the queue for the next depth level
    for (const r of batchResults) {
      for (const u of r.newUrls) {
        if (!visited.has(u) && !queue.includes(u)) {
          queue.push(u);
        }
      }
    }
  }

  throw new Error(`MASK/BUILD_ID not found after crawling ${crawlCount} chunks — pattern shape may have changed. Update extractMaskAndBuildId() in worker.js and the matching logic in refresh-mkissa-mask.yml`);
}

// Returns the current MASK/BUILD_ID, preferring cached discovered values,
// falling back to hardcoded constants.
async function getMaskAndBuildId() {
  if (discoveredCrypto && discoveredCrypto.expiresAt > Date.now()) {
    return {
      mask: discoveredCrypto.mask,
      buildId: discoveredCrypto.buildId,
      source: "discovered",
    };
  }
  return {
    mask: FALLBACK_MASK_HEX,
    buildId: FALLBACK_BUILD_ID,
    source: "fallback",
  };
}

// Force a fresh discovery. Called when AA_CRYPTO_STALE happens.
// If discovery succeeds, caches the result for 24h. If it fails, logs a warning
// and leaves the cache empty (caller will use fallback values).
async function refreshMaskAndBuildId() {
  discoveredCrypto = null;
  try {
    const discovered = await discoverMaskFromMkissa();
    discoveredCrypto = {
      mask: discovered.mask,
      buildId: discovered.buildId,
      expiresAt: Date.now() + DISCOVERED_CACHE_TTL_MS,
    };
    return discoveredCrypto;
  } catch (e) {
    console.warn(`[worker] mask discovery failed: ${e.message}`);
    return null;
  }
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

// Cache for __aaCrypto + derived AES key.
// The partB key rotates periodically (AA_CRYPTO_STALE when it expires).
// Cache for 1 hour — if stale, the retry logic will refresh it automatically.
const AA_CRYPTO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let aaCryptoCache = null; // { aaCrypto, aesKey, expiresAt }

async function getAaCryptoAndKey(showId, episodeString, translationType) {
  if (aaCryptoCache && aaCryptoCache.expiresAt > Date.now()) {
    return aaCryptoCache;
  }
  const aaCrypto = await fetchAaCrypto(showId, episodeString, translationType);
  const { mask } = await getMaskAndBuildId();
  const aesKey = await deriveAesKey(aaCrypto.partB, mask);
  aaCryptoCache = {
    aaCrypto,
    aesKey,
    expiresAt: Date.now() + AA_CRYPTO_CACHE_TTL_MS,
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
    const { buildId } = await getMaskAndBuildId();
    const aaReq = await buildAaReq(queryHash, aaCrypto.epoch, aesKey, buildId);
    console.log(`[worker] aaReq built (length: ${aaReq.length}) using BUILD_ID=${buildId}`);

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
        "x-build-id": buildId,
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
      const errCode = err.extensions?.code ?? "";

      // Self-heal trigger: retry on AA_CRYPTO* errors (explicit crypto rejection)
      // OR on ANY error if we're currently using FALLBACK values (which may be stale
      // due to a mkissa.to build rotation). AllAnime's API sometimes returns
      // INTERNAL_SERVER_ERROR instead of AA_CRYPTO_STALE for crypto mismatches,
      // so we can't rely on the error code alone.
      //
      // We only retry ONCE per request — if the retry also fails, it's a real error
      // (e.g. "No episode" for a non-existent showId), not a crypto issue.
      const currentMaskState = await getMaskAndBuildId();
      const currentSource = currentMaskState.source;
      const shouldSelfHeal = errCode.startsWith("AA_CRYPTO") || currentSource === "fallback";

      if (shouldSelfHeal) {
        console.warn(`[worker] ${errCode} (source=${currentSource}) — refreshing __aaCrypto AND MASK/BUILD_ID, then retrying...`);
        aaCryptoCache = null;
        discoveredCrypto = null;

        // Self-heal: discover fresh MASK/BUILD_ID from mkissa.to's bundle.
        // If discovery fails, getMaskAndBuildId() falls back to hardcoded values.
        await refreshMaskAndBuildId();
        const fresh = await getMaskAndBuildId();
        console.log(`[worker] using ${fresh.source} MASK=${fresh.mask.slice(0,16)}... BUILD_ID=${fresh.buildId}`);

        // Optimization: if discovery returned the SAME values we were already using,
        // the error is NOT a crypto issue (e.g. it's a genuine "No episode" for a
        // fake showId). Skip the retry to save ~1s of latency.
        if (
          currentSource === "fallback" &&
          fresh.source === "discovered" &&
          fresh.mask === currentMaskState.mask &&
          fresh.buildId === currentMaskState.buildId
        ) {
          console.log("[worker] discovered values match fallback — error is not crypto-related, skipping retry");
        } else {
        // Re-fetch fresh __aaCrypto + re-derive key + re-sign + retry the API call
        const freshCrypto = await getAaCryptoAndKey(showId, episodeString, translationType);
        const freshAaReq = await buildAaReq(queryHash, freshCrypto.aaCrypto.epoch, freshCrypto.aesKey, fresh.buildId);

        const retryRes = await fetch(ALLANIME_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Referer: "https://mkissa.to/",
            Origin: "https://mkissa.to",
            "x-build-id": fresh.buildId,
          },
          body: JSON.stringify({
            query: EPISODE_QUERY,
            variables: { showId, episodeString, translationType },
            extensions: {
              persistedQuery: { version: 1, sha256Hash: queryHash },
              aaReq: freshAaReq,
            },
          }),
        });

        if (retryRes.ok) {
          const retryJson = await retryRes.json();
          if (!retryJson.errors) {
            // Success on retry!
            if (retryJson.data?.tobeparsed) {
              const decrypted = await decryptTobeparsed(retryJson.data.tobeparsed, freshCrypto.aesKey);
              const sources = decrypted?.episode?.sourceUrls ?? [];
              if (sources.length > 0) {
                console.log(`[worker] retry success — ${sources.length} sources`);
                setCached(cacheKey, sources);
                return { sources, cached: false, error: null };
              }
            }
            if (retryJson.data?.episode?.sourceUrls) {
              const sources = retryJson.data.episode.sourceUrls;
              console.log(`[worker] retry success (cleartext) — ${sources.length} sources`);
              setCached(cacheKey, sources);
              return { sources, cached: false, error: null };
            }
          }
          // Retry also failed — return the original error
          const retryErr = retryJson.errors?.[0];
          if (retryErr) {
            return { sources: null, error: `AllAnime GraphQL (retry): ${retryErr.message} (${retryErr.extensions?.code})` };
          }
        }

        return { sources: null, error: `AllAnime GraphQL: ${err.message} (${errCode}) — retry also failed` };
        } // end else (retry block)
      }

      return { sources: null, error: `AllAnime GraphQL: ${err.message} (${errCode})` };
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
