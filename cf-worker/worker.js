// XAN Cloudflare Worker v6 — Stream Proxy + AllAnime Episode Resolver
//
// MAJOR FIX (2026-08-29): mkissa.to removed __aaCrypto from page HTML.
// This version uses the bootstrap API endpoint directly, with the x-aa-boot
// header computed by loading mkissa.to's SPA chunk in the Worker.
//
// Two paths for episode resolution:
//   Path A (fast, no browser): Direct crypto — compute x-aa-boot + aaReq,
//     call bootstrap + episode GraphQL directly. Works if the Worker's IP
//     isn't challenged by Cloudflare Turnstile.
//   Path B (reliable, uses browser): Browser Rendering — load mkissa.to
//     in managed Chrome, let the SPA handle all crypto + Turnstile,
//     intercept the episode GraphQL response. Used as fallback when
//     Path A returns NEED_CAPTCHA.
//
// The stream proxy functionality is unchanged.

// ─── MASK / BUILD_ID — auto-refreshed by refresh-mkissa-mask.yml ──────────
// Last manual verification: 2026-09-04
const FALLBACK_MASK_HEX = "43724f7d46135c6cdb2824f00c4ee272a0fff52f89681213140c6c2b80af8d21";
const FALLBACK_BUILD_ID = "161";

// Runtime cache for discovered MASK/BUILD_ID
let discoveredCrypto = null;
const DISCOVERED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const OLD_KEY_STR = "Xot36i3lK3:v1";
const ALLANIME_API = "https://api.allanime.day/api";
const MKISSA_ORIGIN = "https://mkissa.to/";
const MKISSA_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Content lanes (from SPA's lg() function)
const LANE_EPISODE = "k7";    // \bepisode\s*\( → k7
const LANE_CHAPTER = "k9";    // \bchapterPages\s*\( → k9
const LANE_MUSIC = "k2";      // \bmusic\s*\( → k2

// ─── Stream proxy allowlist ───────────────────────────────────────────────
const ALLOWED_HOSTS = [
  "tools.fast4speed.rsvp", "megacloud.tv", "vixcloud.co", "youtu-chan.com",
  "allanime.day", "allanime.uns.bio", "mp4upload.com", "bysekoze.com",
  "vidnest.io", "ok.ru", "repackager.wixmp.com", "allanimenews.com",
  "sharepoint.com", "fast4speed.rsvp", "wixmp.com", "pahe.nekostream.site",
  "nekostream.site", "kwik.cx", "kwik.si", "streamwish.to", "megaplay.buzz",
  "flixcloud.cc", "gogoanime.fi", "gogoanime.vc", "gogoanime.dk", "isekai2nd.com",
  "mkissa.to", "mkissa.net",
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
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "range, content-type, if-range, if-modified-since",
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

// ─── Crypto helpers ───────────────────────────────────────────────────────

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

async function sha256Hex(str) {
  const hash = await sha256(str);
  return Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getOldKey() {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(OLD_KEY_STR));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}

// Derive AES key: XOR(atob(partB), maskBytes)
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

// ─── FIXED: buildAaReq (was missing `k: lane` in payload and `:lane` in IV) ──
// Mirrors mkissa.to SPA's xk() + bk() functions exactly.
//
// SPA's xk() payload: {v:1, ts, epoch, buildId, qh, k: contentLane}
// SPA's bk() IV source: epoch + ":" + buildId + ":" + queryHash + ":" + ts + ":" + lane
async function buildAaReq(queryHash, epoch, aesKey, buildId, contentLane) {
  const ts = Math.floor(Date.now() / 300000) * 300000; // 5-min bucket
  // Payload includes k: contentLane (BUG FIX #1 — cf-worker v5 was missing this)
  const payload = JSON.stringify({
    v: 1, ts, epoch, buildId, qh: queryHash,
    k: contentLane,  // ← BUG FIX #1
  });
  // IV source includes :lane suffix (BUG FIX #2 — cf-worker v5 was missing this)
  const ivSource = `${epoch}:${buildId}:${queryHash}:${ts}:${contentLane}`;  // ← BUG FIX #2
  const ivHash = await sha256(ivSource);
  const iv = ivHash.slice(0, 12);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(payload),
  );
  const encryptedBytes = new Uint8Array(encrypted);
  const result = new Uint8Array(1 + 12 + encryptedBytes.length);
  result[0] = 1;
  result.set(iv, 1);
  result.set(encryptedBytes, 13);
  let binary = "";
  for (let i = 0; i < result.length; i++) binary += String.fromCharCode(result[i]);
  return btoa(binary);
}

// ─── Compute x-aa-boot for the bootstrap endpoint ──────────────────────────
// This is the key breakthrough: we compute x-aa-boot locally without a browser.
// The algorithm (reverse-engineered from SPA's tk() function):
//
//   1. mask = Ny(buildId)  →  32-byte Uint8Array from the SPA's MASK_HEX
//   2. fragStr = Zx(buildId)  →  string (buildId-based fragment)
//   3. ekInput = ek({buildId, group: keyGroup, host: refererHost, epoch, lane})
//   4. dh1 = Dh(mask, fragStr)  →  Uint8Array (PBKDF2-like derivation)
//   5. dh2 = Dh(dh1, ekInput)  →  Uint8Array (final key material)
//   6. xAaBoot = Jx(dh2)  →  hex string
//
// Since Ny/Zx/Dh/ek/Jx are deeply obfuscated, we load the SPA chunk itself
// and call its functions. This is done in a Worker-safe way using eval().
//
// The SPA chunk URL is discovered at runtime from mkissa.to's HTML.
let spaChunkLoader = null;  // cached loader function

async function loadSpaChunkFunctions() {
  if (spaChunkLoader) return spaChunkLoader;

  // Fetch mkissa.to's home page to find the entry chunk URL
  const htmlRes = await fetch(MKISSA_ORIGIN, {
    headers: { "User-Agent": MKISSA_UA, "Accept": "text/html" },
  });
  if (!htmlRes.ok) throw new Error(`mkissa.to home returned HTTP ${htmlRes.status}`);
  const html = await htmlRes.text();

  // Extract entry chunk URLs from import("...") calls
  const entryUrlMatches = [...html.matchAll(/import\(\s*"([^"]+\.js)"\s*\)/g)];
  const entryUrls = entryUrlMatches
    .map((m) => m[1])
    .filter((u) => u.includes("/_app/immutable/entry/"));
  if (entryUrls.length === 0) throw new Error("no entry chunk URLs in mkissa.to HTML");

  // Fetch the app entry chunk to find the main B-MUXVpI chunk
  // (The entry chunk imports chunks/, and one of those chunks contains the crypto)
  // We BFS-crawl chunks until we find one containing "VaildTranslationTypeEnumType"
  // (a string unique to the crypto chunk)
  const visited = new Set();
  const queue = [];

  // Resolve entry chunk URLs to absolute
  for (const rel of entryUrls) {
    const abs = rel.startsWith("http") ? rel : `https://cdn.mkissa.net${rel}`;
    queue.push(abs);
  }

  let cryptoChunkSrc = null;
  const MAX_CRAWL = 40;
  let crawlCount = 0;

  while (queue.length > 0 && crawlCount < MAX_CRAWL && !cryptoChunkSrc) {
    const batch = queue.splice(0, Math.min(queue.length, 10));
    const results = await Promise.all(
      batch.map(async (url) => {
        if (visited.has(url)) return { found: null, newUrls: [] };
        visited.add(url);
        crawlCount++;
        try {
          const res = await fetch(url, { headers: { "User-Agent": MKISSA_UA } });
          if (!res.ok) return { found: null, newUrls: [] };
          const src = await res.text();
          // Check if this chunk contains the crypto functions
          // Search for just "VaildTranslationTypeEnumType" — it's a very unique
          // string only found in the crypto chunk. (Previously also required
          // "function tk" and "__aaCrypto" but those may be refactored out.)
          if (src.includes("VaildTranslationTypeEnumType")) {
            return { found: src, newUrls: [] };
          }
          // Collect new chunk URLs
          const newUrls = [];
          for (const m of src.matchAll(/import\(\s*"([^"]+\.js)"\s*\)/g)) {
            const abs = m[1].startsWith("http") ? m[1] : new URL(m[1], url).href;
            if (abs.includes("/_app/immutable/chunks/") && !visited.has(abs)) {
              newUrls.push(abs);
            }
          }
          for (const m of src.matchAll(/from\s*"([^"]+\.js)"/g)) {
            const abs = m[1].startsWith("http") ? m[1] : new URL(m[1], url).href;
            if (abs.includes("/_app/immutable/chunks/") && !visited.has(abs)) {
              newUrls.push(abs);
            }
          }
          return { found: null, newUrls };
        } catch { return { found: null, newUrls: [] }; }
      }),
    );

    for (const r of results) {
      if (r.found) { cryptoChunkSrc = r.found; break; }
      for (const u of r.newUrls) if (!queue.includes(u)) queue.push(u);
    }
  }

  if (!cryptoChunkSrc) throw new Error("crypto chunk not found after crawling");

  // Strip ES module imports/exports
  const stripped = cryptoChunkSrc
    .replace(/import\{([^}]+)\}from"[^"]+";/g, (full, names) => {
      const pairs = names.split(",").map((n) => n.trim()).filter(Boolean);
      const localNames = pairs.map((p) => {
        const m = p.match(/^[$\w]+\s+as\s+([$\w]+)$/);
        return m ? m[1] : p;
      });
      return `const ${localNames.map((n) => `${n} = globalStub`).join(", ")};`;
    })
    .replace(/import\.meta\.url/g, '"https://mkissa.to/"')
    .replace(/export\{[^}]*\}\s*;?/g, ";")
    .replace(/export\s+default\s+[^;]+;/g, ";")
    .replace(/export\s+(const|var|let|function|class|async\s+function)\s/g, "$1 ");

  // Build a self-contained module that defines all the crypto functions
  // and returns them via an object. We use new Function() to avoid polluting
  // the Worker's global scope.
  const moduleCode = `
    ${stripped}
    return {
      tk, xk, Fy, Py, uk, ol, j7, mk, Ak, kk, Uy, By, lg,
      get yr() { return yr; },
      get Aa() { return Aa; },
      get og() { return og; },
    };
  `;

  // Create a stub for stripped imports
  const globalStub = new Proxy(function () { return globalStub; }, {
    get: (t, p) => {
      if (p === Symbol.toPrimitive) return () => "";
      if (p === "toString") return () => "";
      if (p === "length") return 0;
      if (typeof p === "symbol") return undefined;
      return globalStub;
    },
    apply: () => globalStub,
    construct: () => globalStub,
  });

  // Execute the module code with the stub in scope.
  // We use a Function constructor to create a sandboxed scope.
  // NOTE: Cloudflare Workers blocks `new Function()` by default (no unsafe_eval
  // flag available). This will throw "Code generation from strings disallowed
  // for this context" — which is caught by the caller (getAaCryptoAndKey) and
  // causes Path A to gracefully fail and fall back to Path B (Browser Rendering).
  // Path B is the reliable path anyway — it runs the SPA in a real browser.
  let wrapper;
  try {
    wrapper = new Function("globalStub", "crypto", "TextEncoder", "TextDecoder", "atob", "btoa", "URL", "Buffer", "console", moduleCode);
  } catch (e) {
    throw new Error(`Path A unavailable (${e.message}) — Browser Rendering will handle this request`);
  }

  // Workers don't have Buffer by default, but we can provide a shim
  const BufferShim = {
    from: (data, encoding) => {
      if (encoding === "base64") {
        const bin = atob(data);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      }
      if (encoding === "hex") {
        const arr = new Uint8Array(data.length / 2);
        for (let i = 0; i < arr.length; i++) arr[i] = parseInt(data.slice(i * 2, i * 2 + 2), 16);
        return arr;
      }
      return new TextEncoder().encode(String(data));
    },
  };

  const stubConsole = {
    log: () => {}, error: () => {}, warn: () => {}, info: () => {},
    debug: () => {}, trace: () => {}, table: () => {}, group: () => {},
    groupEnd: () => {}, time: () => {}, timeEnd: () => {}, dir: () => {},
    count: () => {}, assert: () => {}, clear: () => {},
  };

  spaChunkLoader = wrapper(globalStub, crypto, TextEncoder, TextDecoder, atob, btoa, URL, BufferShim, stubConsole);
  return spaChunkLoader;
}

// ─── Compute x-aa-boot using the SPA's own tk() function ───────────────────
async function computeXAaBoot(epoch, contentLane, buildId) {
  const fns = await loadSpaChunkFunctions();
  const keyGroup = fns.uk("mkissa.to");  // → "mkissa"
  const xAaBoot = await fns.tk({
    buildId: String(buildId),
    epoch,
    keyGroup,
    refererHost: "mkissa.to",
    contentLane,
  });
  return xAaBoot;
}

// ─── Fetch __aaCrypto via bootstrap endpoint (replaces HTML scrape) ────────
// Cache for __aaCrypto + derived AES key (3 hours — epoch lasts ~7 days)
let aaCryptoCache = null;
const AA_CRYPTO_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

async function getAaCryptoAndKey(contentLane, env) {
  if (aaCryptoCache && aaCryptoCache.expiresAt > Date.now()) {
    return aaCryptoCache;
  }

  const { mask, buildId } = await getMaskAndBuildId();
  const fns = await loadSpaChunkFunctions();
  const epoch = fns.Fy();  // local 5-min bucket — no prior epoch needed!

  console.log(`[worker] computing x-aa-boot for bootstrap (epoch=${epoch}, buildId=${buildId}, lane=${contentLane})`);
  const xAaBoot = await computeXAaBoot(epoch, contentLane, buildId);

  const bootstrapUrl = `https://api.mkissa.net/client-crypto/v1/bootstrap?buildId=${encodeURIComponent(buildId)}&k=${encodeURIComponent(contentLane)}`;
  console.log(`[worker] calling bootstrap: ${bootstrapUrl}`);

  const res = await fetch(bootstrapUrl, {
    method: "GET",
    headers: {
      "User-Agent": MKISSA_UA,
      "Accept": "application/json",
      "Referer": "https://mkissa.to/",
      "Origin": "https://mkissa.to",
      "x-build-id": String(buildId),
      "x-aa-boot": xAaBoot,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`bootstrap HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const aaCrypto = await res.json();
  if (!aaCrypto.partB || !aaCrypto.epoch) {
    throw new Error(`bootstrap response missing partB/epoch: ${JSON.stringify(aaCrypto).slice(0, 200)}`);
  }

  console.log(`[worker] bootstrap success: epoch=${aaCrypto.epoch}, partB length=${aaCrypto.partB.length}`);

  // Cache the bootstrap response in the VM so xk() can use it
  fns.mk(aaCrypto, contentLane);

  const aesKey = await deriveAesKey(aaCrypto.partB, mask);
  aaCryptoCache = {
    aaCrypto,
    aesKey,
    fns,
    expiresAt: Date.now() + AA_CRYPTO_CACHE_TTL_MS,
  };
  return aaCryptoCache;
}

// ─── Decrypt tobeparsed (try new key first, fall back to old) ──────────────
async function decryptTobeparsed(b64, newKey) {
  try {
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    if (bytes.length < 32 || bytes[0] !== 1) return null;
    const iv = bytes.slice(1, 13);
    const ctWithTag = bytes.slice(13);

    // Try NEW key first
    if (newKey) {
      try {
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, newKey, ctWithTag);
        return JSON.parse(new TextDecoder().decode(plaintext));
      } catch {
        // fall through to old key
      }
    }

    // Fallback: OLD key
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

// ─── Runtime MASK/BUILD_ID discovery (self-healing) ───────────────────────
// (unchanged from v5 — crawls mkissa.to's SvelteKit bundle for MASK + BUILD_ID)
const HEX_64_PATTERN = /"([0-9a-fA-F]{64})"/;
const BUILD_ID_REF_PATTERN = /(?:buildId|x-build-id")\s*:\s*([A-Za-z_$][\w$]*)/g;

function makeBuildIdDirectPattern(varName) {
  const v = varName.replace(/\$/g, "\\$");
  return new RegExp("(?:const|var|let|,)\\s*" + v + '\\s*=\\s*"(\\d{1,3})"');
}

function makeBuildIdWrappedPattern(varName) {
  const v = varName.replace(/\$/g, "\\$");
  return new RegExp(v + '\\s*=\\s*[A-Za-z_$][\\w$]*\\(\\s*\\d+\\s*\\)\\s*!==\\s*"string"\\s*\\?\\s*"(\\d{1,3})"');
}

function extractMaskAndBuildId(src) {
  const hexMatch = src.match(HEX_64_PATTERN);
  if (!hexMatch) return null;
  const mask = hexMatch[1];
  const buildIdRefs = [...src.matchAll(BUILD_ID_REF_PATTERN)];
  if (buildIdRefs.length === 0) return { mask, buildId: null };
  const candidates = [];
  const seenVars = new Set();
  for (const ref of buildIdRefs) {
    const varName = ref[1];
    if (seenVars.has(varName)) continue;
    seenVars.add(varName);
    const directPat = makeBuildIdDirectPattern(varName);
    const directMatch = src.match(directPat);
    if (directMatch) { candidates.push(directMatch[1]); continue; }
    const wrappedPat = makeBuildIdWrappedPattern(varName);
    const wrappedMatch = src.match(wrappedPat);
    if (wrappedMatch) candidates.push(wrappedMatch[1]);
  }
  if (candidates.length === 0) return { mask, buildId: null };
  const counts = {};
  for (const c of candidates) counts[c] = (counts[c] || 0) + 1;
  const buildId = candidates.sort((a, b) => counts[b] - counts[a])[0];
  return { mask, buildId };
}

function resolveChunkUrl(rel, baseUrl) {
  if (rel.startsWith("http://") || rel.startsWith("https://")) return rel;
  const clean = rel.split("?")[0].split("#")[0];
  let baseDir = baseUrl.slice(0, baseUrl.lastIndexOf("/"));
  let r = clean;
  while (r.startsWith("../")) { baseDir = baseDir.slice(0, baseDir.lastIndexOf("/")); r = r.slice(3); }
  if (r.startsWith("./")) r = r.slice(2);
  return `${baseDir}/${r}`;
}

async function discoverMaskFromMkissa() {
  console.log("[worker] discovering fresh MASK/BUILD_ID from mkissa.to bundle");
  const htmlRes = await fetch(MKISSA_ORIGIN, {
    headers: { "User-Agent": MKISSA_UA, "Accept": "text/html" },
  });
  if (!htmlRes.ok) throw new Error(`mkissa.to returned HTTP ${htmlRes.status}`);
  const html = await htmlRes.text();
  const entryUrlMatches = [...html.matchAll(/import\(\s*"([^"]+\.js)"\s*\)/g)];
  const entryUrls = entryUrlMatches.map((m) => m[1]).filter((u) => u.includes("/_app/immutable/entry/"));
  if (entryUrls.length === 0) throw new Error("no entry chunk URLs found in mkissa.to HTML");

  const MAX_CHUNKS_TO_CRAWL = 40;
  const visited = new Set();
  const queue = [...entryUrls];
  let crawlCount = 0;

  while (queue.length > 0 && crawlCount < MAX_CHUNKS_TO_CRAWL) {
    const batch = queue.splice(0, Math.min(queue.length, 10));
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        if (visited.has(url)) return { found: null, newUrls: [] };
        visited.add(url);
        crawlCount++;
        try {
          const res = await fetch(url, { headers: { "User-Agent": MKISSA_UA, "Accept": "*/*" } });
          if (!res.ok) return { found: null, newUrls: [] };
          const src = await res.text();
          const extracted = extractMaskAndBuildId(src);
          if (extracted && extracted.buildId) {
            return { found: { mask: extracted.mask, buildId: extracted.buildId, chunkUrl: url }, newUrls: [] };
          }
          const newUrls = [];
          for (const m of src.matchAll(/import\(\s*"([^"]+\.js)"\s*\)/g)) {
            const abs = resolveChunkUrl(m[1], url);
            if (abs.includes("/_app/immutable/chunks/") && !visited.has(abs)) newUrls.push(abs);
          }
          for (const m of src.matchAll(/from\s*"([^"]+\.js)"/g)) {
            const abs = resolveChunkUrl(m[1], url);
            if (abs.includes("/_app/immutable/chunks/") && !visited.has(abs)) newUrls.push(abs);
          }
          return { found: null, newUrls };
        } catch { return { found: null, newUrls: [] }; }
      })
    );
    const found = batchResults.find((r) => r.found !== null);
    if (found) {
      console.log(`[worker] ✓ discovered MASK=${found.found.mask.slice(0, 16)}... BUILD_ID=${found.found.buildId} from ${found.found.chunkUrl.split("/").pop()} (crawled ${crawlCount} chunks)`);
      return { mask: found.found.mask, buildId: found.found.buildId };
    }
    for (const r of batchResults) {
      for (const u of r.newUrls) {
        if (!visited.has(u) && !queue.includes(u)) queue.push(u);
      }
    }
  }
  throw new Error(`MASK/BUILD_ID not found after crawling ${crawlCount} chunks`);
}

async function getMaskAndBuildId() {
  if (discoveredCrypto && discoveredCrypto.expiresAt > Date.now()) {
    return { mask: discoveredCrypto.mask, buildId: discoveredCrypto.buildId, source: "discovered" };
  }
  return { mask: FALLBACK_MASK_HEX, buildId: FALLBACK_BUILD_ID, source: "fallback" };
}

async function refreshMaskAndBuildId() {
  discoveredCrypto = null;
  try {
    const discovered = await discoverMaskFromMkissa();
    discoveredCrypto = { mask: discovered.mask, buildId: discovered.buildId, expiresAt: Date.now() + DISCOVERED_CACHE_TTL_MS };
    return discoveredCrypto;
  } catch (e) {
    console.warn(`[worker] mask discovery failed: ${e.message}`);
    return null;
  }
}

// ─── In-memory cache ───────────────────────────────────────────────────────
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

// ─── Episode query (exact fields mkissa.to expects — from SPA's j7()) ──────
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

// ─── Path A: Direct crypto episode resolver ────────────────────────────────
// Computes x-aa-boot + aaReq locally, calls the API directly.
// Works if the Worker's IP isn't challenged by Turnstile.
async function fetchAllAnimeEpisodeDirect(showId, episodeString, translationType, env) {
  const cacheKey = `${showId}:${episodeString}:${translationType}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[worker] cache hit for ${cacheKey} (${cached.length} sources)`);
    return { sources: cached, cached: true, error: null };
  }

  console.log(`[worker] direct crypto resolve for ${cacheKey}`);

  try {
    const contentLane = LANE_EPISODE; // "k7"
    const { aaCrypto, aesKey, fns } = await getAaCryptoAndKey(contentLane, env);
    const { buildId } = await getMaskAndBuildId();

    // Compute query hash using the SPA's own SHA-256 function
    const queryHash = fns.ol(EPISODE_QUERY);
    console.log(`[worker] queryHash: ${queryHash.slice(0, 16)}...`);

    // Build aaReq with FIXED bugs (k: lane in payload, :lane in IV)
    const aaReq = await buildAaReq(queryHash, aaCrypto.epoch, aesKey, buildId, contentLane);
    console.log(`[worker] aaReq built (length: ${aaReq.length}) using BUILD_ID=${buildId}`);

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
        "User-Agent": MKISSA_UA,
        "Referer": "https://mkissa.to/",
        "Origin": "https://mkissa.to",
        "x-build-id": String(buildId),
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
      const errMsg = err.message ?? "Unknown error";
      console.warn(`[worker] episode query error: ${errMsg} (${errCode})`);

      // If NEED_CAPTCHA → signal to caller to try Browser Rendering
      if (errMsg === "NEED_CAPTCHA" || errCode === "NEED_CAPTCHA") {
        return { sources: null, error: "NEED_CAPTCHA", needBrowser: true };
      }

      // If crypto is rejected, refresh __aaCrypto and retry
      if (errCode.startsWith("AA_CRYPTO")) {
        aaCryptoCache = null;
        discoveredCrypto = null;
        await refreshMaskAndBuildId();
        // Retry once with fresh values
        const freshCrypto = await getAaCryptoAndKey(contentLane, env);
        const freshMask = await getMaskAndBuildId();
        const freshAaReq = await buildAaReq(queryHash, freshCrypto.aaCrypto.epoch, freshCrypto.aesKey, freshMask.buildId, contentLane);
        const retryRes = await fetch(ALLANIME_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": MKISSA_UA,
            "Referer": "https://mkissa.to/",
            "Origin": "https://mkissa.to",
            "x-build-id": String(freshMask.buildId),
          },
          body: JSON.stringify({
            query: EPISODE_QUERY,
            variables: { showId, episodeString, translationType },
            extensions: { persistedQuery: { version: 1, sha256Hash: queryHash }, aaReq: freshAaReq },
          }),
        });
        if (retryRes.ok) {
          const retryJson = await retryRes.json();
          if (!retryJson.errors) {
            if (retryJson.data?.tobeparsed) {
              const decrypted = await decryptTobeparsed(retryJson.data.tobeparsed, freshCrypto.aesKey);
              const sources = decrypted?.episode?.sourceUrls ?? [];
              if (sources.length > 0) {
                setCached(cacheKey, sources);
                return { sources, cached: false, error: null };
              }
            }
            if (retryJson.data?.episode?.sourceUrls) {
              const sources = retryJson.data.episode.sourceUrls;
              setCached(cacheKey, sources);
              return { sources, cached: false, error: null };
            }
          }
        }
      }

      return { sources: null, error: `AllAnime GraphQL: ${errMsg} (${errCode})` };
    }

    // Success — decrypt tobeparsed
    if (json.data?.tobeparsed) {
      const decrypted = await decryptTobeparsed(json.data.tobeparsed, aesKey);
      const sources = decrypted?.episode?.sourceUrls ?? [];
      if (sources.length === 0) {
        return { sources: null, error: "tobeparsed decrypted but no sourceUrls" };
      }
      setCached(cacheKey, sources);
      return { sources, cached: false, error: null };
    }

    if (json.data?.episode?.sourceUrls) {
      const sources = json.data.episode.sourceUrls;
      setCached(cacheKey, sources);
      return { sources, cached: false, error: null };
    }

    return { sources: null, error: "No sourceUrls in response" };
  } catch (err) {
    return { sources: null, error: `Direct crypto failed: ${errToString(err)}` };
  }
}

// ─── Path B: Browser Rendering episode resolver ───────────────────────────
// Loads mkissa.to in managed Chrome, lets the SPA handle all crypto + Turnstile,
// intercepts the episode GraphQL response.
async function fetchAllAnimeEpisodeViaBrowser(showId, episodeString, translationType, env) {
  console.log(`[browser] resolving episode ${showId}/${episodeString}/${translationType} via Browser Rendering`);

  if (typeof BROWSER === "undefined" && !(env && env.BROWSER)) {
    throw new Error("Browser Rendering not configured. Add the BROWSER binding to wrangler.toml.");
  }

  const { launch } = await import("@cloudflare/puppeteer");
  const browser = await launch(env.BROWSER);
  const page = await browser.newPage();

  await page.setUserAgent(MKISSA_UA);

  // Intercept the episode GraphQL response
  let episodeData = null;
  let bootstrapData = null;
  page.on("response", async (response) => {
    try {
      const url = response.url();
      // Bootstrap response
      if (url.includes("client-crypto/v1/bootstrap") && response.ok()) {
        const json = await response.json();
        if (json.partB && json.epoch) {
          bootstrapData = json;
          console.log(`[browser] intercepted bootstrap: epoch=${json.epoch}`);
        }
      }
      // Episode GraphQL response — look for the POST to api.allanime.day/api or api.mkissa.net/api
      // that returns sourceUrls
      if ((url.includes("api.allanime.day/api") || url.includes("api.mkissa.net/api")) && response.ok()) {
        const text = await response.text();
        // Check if this response contains episode data (sourceUrls)
        if (text.includes("sourceUrls") || text.includes("tobeparsed")) {
          try {
            const json = JSON.parse(text);
            if (json.data?.episode?.sourceUrls || json.data?.tobeparsed) {
              episodeData = json;
              console.log(`[browser] intercepted episode response with ${json.data?.episode?.sourceUrls?.length || "encrypted"} sources`);
            }
          } catch {}
        }
      }
    } catch {}
  });

  try {
    // ─── Step 1: Navigate to home page first to pass Cloudflare's challenge ───
    // Direct navigation to /anime/<id>/p-<ep>-<mode> gets stuck on Cloudflare's
    // "Just a moment..." challenge (HTTP 403). The home page loads without a
    // challenge, and once the SPA is hydrated + cf_clearance cookie is set,
    // we can SPA-navigate to the episode page without triggering a fresh challenge.
    console.log("[browser] navigating to mkissa.to home page first");
    await page.goto("https://mkissa.to/", { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for Cloudflare challenge to pass on home page
    for (let i = 0; i < 15; i++) {
      const title = await page.title();
      if (!title.includes("Just a moment")) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(`[browser] home page loaded — title: ${await page.title()}`);

    // Wait for SPA to hydrate (SvelteKit needs time to load + render)
    await new Promise((r) => setTimeout(r, 3000));

    // ─── Step 2: SPA-navigate to the episode page ───
    // The SPA route is /anime/[showId]/[episodeSlug] where episodeSlug = p-<ep>-<mode>
    // (NOT /watch/ — that's a different route that doesn't trigger the episode GraphQL)
    const episodeUrl = `https://mkissa.to/anime/${showId}/p-${episodeString}-${translationType}`;
    console.log(`[browser] SPA-navigating to ${episodeUrl}`);
    await page.goto(episodeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for any Cloudflare challenge to pass
    for (let i = 0; i < 15; i++) {
      const title = await page.title();
      if (!title.includes("Just a moment")) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(`[browser] episode page loaded — title: ${await page.title()}`);

    // Wait for the episode response (up to 45s — Turnstile can take time)
    console.log("[browser] waiting for episode GraphQL response...");
    for (let i = 0; i < 45 && !episodeData; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!episodeData) {
      throw new Error("episode response not intercepted within 45s");
    }

    // If we got cleartext sourceUrls, return them
    if (episodeData.data?.episode?.sourceUrls) {
      const sources = episodeData.data.episode.sourceUrls;
      console.log(`[browser] got ${sources.length} cleartext sources`);
      return { sources, cached: false, error: null };
    }

    // If we got tobeparsed, decrypt it
    if (episodeData.data?.tobeparsed) {
      if (!bootstrapData) {
        throw new Error("got tobeparsed but no bootstrap data intercepted");
      }
      const { mask } = await getMaskAndBuildId();
      const aesKey = await deriveAesKey(bootstrapData.partB, mask);
      const decrypted = await decryptTobeparsed(episodeData.data.tobeparsed, aesKey);
      const sources = decrypted?.episode?.sourceUrls ?? [];
      if (sources.length === 0) {
        return { sources: null, error: "tobeparsed decrypted but no sourceUrls" };
      }
      console.log(`[browser] decrypted ${sources.length} sources`);
      return { sources, cached: false, error: null };
    }

    return { sources: null, error: "episode response had no sourceUrls or tobeparsed" };
  } finally {
    await browser.close();
  }
}

// ─── Combined episode resolver: try Path A, fall back to Path B ────────────
async function fetchAllAnimeEpisode(showId, episodeString, translationType, env) {
  const cacheKey = `${showId}:${episodeString}:${translationType}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[worker] cache hit for ${cacheKey} (${cached.length} sources)`);
    return { sources: cached, cached: true, error: null };
  }

  // Path A: Direct crypto
  const directResult = await fetchAllAnimeEpisodeDirect(showId, episodeString, translationType, env);

  if (directResult.sources && directResult.sources.length > 0) {
    setCached(cacheKey, directResult.sources);
    return directResult;
  }

  // If Path A failed for ANY reason (NEED_CAPTCHA, chunk not found, crypto
  // error, etc.), fall back to Path B (Browser Rendering). The browser
  // handles all crypto + Turnstile automatically.
  if (directResult.needBrowser || directResult.error) {
    console.log(`[worker] Path A failed (${directResult.error?.slice(0, 80)}), falling back to Browser Rendering...`);
    try {
      const browserResult = await fetchAllAnimeEpisodeViaBrowser(showId, episodeString, translationType, env);
      if (browserResult.sources && browserResult.sources.length > 0) {
        setCached(cacheKey, browserResult.sources);
        return browserResult;
      }
      return { sources: null, error: `Both paths failed. Direct: ${directResult.error}. Browser: ${browserResult.error}` };
    } catch (e) {
      return { sources: null, error: `Direct: ${directResult.error}. Browser threw: ${errToString(e)}` };
    }
  }

  return directResult;
}

// ─── Stream proxy (unchanged) ──────────────────────────────────────────────

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

// ─── Main entry point ──────────────────────────────────────────────────────

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

    // ─── AllAnime episode resolver ───
    if (url.pathname === "/allanime/episode") {
      if (request.method !== "GET") return jsonError("Method not allowed - use GET", 405);

      const showId = url.searchParams.get("showId");
      const episodeString = url.searchParams.get("episodeString");
      const translationType = url.searchParams.get("translationType") || "sub";

      if (!showId || !episodeString) return jsonError("Missing showId or episodeString", 400);
      if (translationType !== "sub" && translationType !== "dub") {
        return jsonError("translationType must be 'sub' or 'dub'", 400);
      }

      const result = await fetchAllAnimeEpisode(showId, episodeString, translationType, env);

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
        },
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
          version: 6,
          mode: "bootstrap-direct-crypto + browser-fallback",
          endpoints: {
            "/": "Stream proxy. Pass ?url=<stream_url>&h_Referer=... to proxy a request.",
            "/allanime/episode":
              "AllAnime episode resolver. Pass ?showId=...&episodeString=...&translationType=sub|dub. Tries direct crypto first, falls back to Browser Rendering if NEED_CAPTCHA.",
          },
          cacheSize: responseCache.size,
          allowedHosts: ALLOWED_HOSTS.length,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        },
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
