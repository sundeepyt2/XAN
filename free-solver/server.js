// free-solver/server.js
//
// Free AllAnime episode source resolver — uses Puppeteer + Stealth plugin
// to bypass Cloudflare's "Just a moment..." challenge and solve the Turnstile
// captcha automatically (managed mode = no user interaction needed).
//
// This server replaces the paid 2captcha/CapSolver approach. It runs on any
// free VPS (Oracle Cloud Free Tier recommended — always free, 1GB RAM).
//
// How it works:
//   1. XAN calls: GET /allanime/episode?showId=...&episodeString=...&translationType=sub
//   2. Server launches Chrome (or reuses existing instance) with stealth flags
//   3. Navigates to https://allmanga.to/bangumi/<showId>/p-<ep>-<type>
//   4. Cloudflare challenge auto-passes (stealth plugin evades bot detection)
//   5. AllAnime's Vue app loads, calls GraphQL → gets AA_CRYPTO_MISSING
//   6. Vue app renders Turnstile widget → auto-solves (managed mode)
//   7. Vue app retries GraphQL with captcha token → gets sourceUrls
//   8. Server intercepts the network response, decrypts tobeparsed (AES-GCM)
//   9. Returns sourceUrls to XAN as JSON
//
// Cost: $0 (Oracle Cloud Free Tier = always free, 1GB RAM, 1 OCPU)
// Performance: ~20-40s per request (first call), ~10s cached
// Reliability: ~80-90% (Cloudflare may occasionally block — retry handles this)

const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const crypto = require("crypto");

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
// Optional shared secret — if set, XAN must send matching ?secret= or header
const SOLVER_SECRET = process.env.SOLVER_SECRET || "";

// ─── Browser pool ─────────────────────────────────────────────────────────
// Reuse a single browser instance across requests (launching is expensive).
// Each request gets a fresh incognito context (isolated cookies/state).
let browser = null;
let browserLaunchPromise = null;

async function getBrowser() {
  // If browser is alive, reuse it
  if (browser && browser.connected) {
    try {
      // Quick health check
      const pages = await browser.pages();
      return browser;
    } catch {
      browser = null;
    }
  }

  // If a launch is already in progress, wait for it
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  // Launch new browser
  browserLaunchPromise = (async () => {
    console.log("[solver] launching browser...");
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // critical for low-RAM VPS (uses /tmp instead of /dev/shm)
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--disable-ipc-spike",
        "--mute-audio",
        "--no-first-run",
        "--no-default-browser-check",
        // Realistic window size
        "--window-size=1280,800",
      ],
      // Don't share default profile
      defaultViewport: { width: 1280, height: 800 },
    });

    // Auto-restart if browser crashes
    browser.on("disconnected", () => {
      console.warn("[solver] browser disconnected — will relaunch on next request");
      browser = null;
      browserLaunchPromise = null;
    });

    console.log("[solver] browser ready");
    browserLaunchPromise = null;
    return browser;
  })();

  return browserLaunchPromise;
}

// ─── AES-GCM decryption for AllAnime's tobeparsed field ──────────────────
// Mirrors the decryption in src/lib/allanime.ts and cf-worker/worker.js.
// Key: SHA-256("Xot36i3lK3:v1") — derived from char-code constants in AllAnime's bundle.
function decryptTobeparsed(b64) {
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 32 || buf[0] !== 1) return null;

    const iv = buf.subarray(1, 13);
    const ctWithTag = buf.subarray(13); // ciphertext + 16-byte GCM tag

    const key = crypto.createHash("sha256").update("Xot36i3lK3:v1").digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

    // GCM auth tag is the last 16 bytes
    const tag = ctWithTag.subarray(ctWithTag.length - 16);
    const ciphertext = ctWithTag.subarray(0, ctWithTag.length - 16);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf-8"));
  } catch (err) {
    console.error("[solver] decryptTobeparsed failed:", err.message);
    return null;
  }
}

// ─── In-memory response cache ────────────────────────────────────────────
// Episode sources don't change often — cache for 5 min to avoid re-solving
// the captcha for repeat requests.
const responseCache = new Map(); // key: `${showId}:${ep}:${mode}` → { sources, expiresAt }
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

// ─── Main endpoint ────────────────────────────────────────────────────────

app.get("/allanime/episode", async (req, res) => {
  // Optional shared-secret check
  if (SOLVER_SECRET) {
    const provided = req.query.secret || req.headers["x-solver-secret"];
    if (provided !== SOLVER_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { showId, episodeString, translationType } = req.query;
  if (!showId || !episodeString) {
    return res.status(400).json({ error: "Missing showId or episodeString" });
  }
  const mode = translationType === "dub" ? "dub" : "sub";

  // Check cache first
  const cacheKey = `${showId}:${episodeString}:${mode}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[solver] cache hit for ${cacheKey} (${cached.length} sources)`);
    return res.json({ sources: cached, cached: true });
  }

  console.log(`[solver] fetching sources for ${cacheKey}`);

  let page;
  let context;
  try {
    const br = await getBrowser();
    context = await br.createIncognitoBrowserContext();
    page = await context.newPage();

    // Realistic User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    let sources = null;
    let capturedToken = null;
    let graphQLCallCount = 0;

    // Intercept AllAnime API responses
    page.on("response", async (response) => {
      const url = response.url();
      // Match both /api?variables=... (GET) and /api/graphql (POST)
      if (!url.includes("api.allanime.day")) return;
      if (!url.includes("/api?") && !url.includes("/api/graphql")) return;

      graphQLCallCount++;
      console.log(`[solver] intercepted GraphQL call #${graphQLCallCount}: ${response.status()} ${url.slice(0, 100)}...`);

      try {
        const text = await response.text();
        const json = JSON.parse(text);

        // Capture the captcha token from the request URL (for debugging)
        const reqUrl = response.request().url();
        const extensionsMatch = reqUrl.match(/extensions=([^&]+)/);
        if (extensionsMatch) {
          try {
            const extensions = JSON.parse(decodeURIComponent(extensionsMatch[1]));
            if (extensions.captcha?.token) {
              capturedToken = extensions.captcha.token;
              console.log("[solver] captured captcha token (length:", capturedToken.length, ")");
            }
          } catch {}
        }

        // Extract sourceUrls
        if (json.data?.tobeparsed) {
          const decrypted = decryptTobeparsed(json.data.tobeparsed);
          if (decrypted?.episode?.sourceUrls) {
            sources = decrypted.episode.sourceUrls;
            console.log(`[solver] decrypted tobeparsed — ${sources.length} sources`);
          }
        } else if (json.data?.episode?.sourceUrls) {
          sources = json.data.episode.sourceUrls;
          console.log(`[solver] got cleartext sourceUrls — ${sources.length} sources`);
        }
      } catch (e) {
        // Not JSON or parse error — ignore
      }
    });

    // Navigate to the episode page
    // Cloudflare's "Just a moment..." challenge will appear first, then auto-pass
    const episodeUrl = `https://allmanga.to/bangumi/${showId}/p-${episodeString}-${mode}`;
    console.log(`[solver] navigating to ${episodeUrl}`);

    try {
      await page.goto(episodeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    } catch (err) {
      console.warn(`[solver] initial goto error (may still be on CF challenge): ${err.message}`);
    }

    // Wait for Cloudflare challenge to resolve (title changes from "Just a moment...")
    try {
      await page.waitForFunction(
        () => document.title !== "Just a moment..." && !document.title.includes("Just a moment"),
        { timeout: 30000 },
      );
      console.log("[solver] Cloudflare challenge passed — page title:", await page.title());
    } catch (err) {
      console.warn("[solver] Cloudflare challenge may not have passed — title:", await page.title());
    }

    // Wait for sourceUrls to be captured (Vue app auto-fetches them after Turnstile solves)
    const maxWaitMs = 25000;
    const startWait = Date.now();
    while (!sources && Date.now() - startWait < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (sources && sources.length > 0) {
      console.log(`[solver] success — ${sources.length} sources captured in ${Date.now() - startWait}ms`);
      setCached(cacheKey, sources);
      res.json({
        sources,
        token: capturedToken,
        graphQLCalls: graphQLCallCount,
        durationMs: Date.now() - startWait,
      });
    } else {
      console.warn(`[solver] no sources captured after ${maxWaitMs}ms (${graphQLCallCount} GraphQL calls seen)`);
      res.status(502).json({
        error: "Failed to capture sources — Cloudflare may have blocked the browser or Turnstile didn't auto-solve",
        graphQLCalls: graphQLCallCount,
        pageTitle: await page.title().catch(() => "unknown"),
      });
    }
  } catch (err) {
    console.error("[solver] unexpected error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    // Always close the incognito context to free memory
    if (context) {
      try {
        await context.close();
      } catch {}
    }
  }
});

// ─── Health check ─────────────────────────────────────────────────────────

app.get("/health", async (req, res) => {
  res.json({
    ok: true,
    browser: browser?.connected ?? false,
    cacheSize: responseCache.size,
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────

process.on("SIGTERM", async () => {
  console.log("[solver] SIGTERM — closing browser...");
  if (browser) await browser.close();
  process.exit(0);
});
process.on("SIGINT", async () => {
  console.log("[solver] SIGINT — closing browser...");
  if (browser) await browser.close();
  process.exit(0);
});

// ─── Start ────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`[solver] XAN free-solver listening on port ${PORT}`);
  console.log(`[solver] endpoint: GET /allanime/episode?showId=...&episodeString=...&translationType=sub|dub`);
  if (SOLVER_SECRET) {
    console.log("[solver] SOLVER_SECRET set — requests must include ?secret= or x-solver-secret header");
  }
  // Pre-launch browser so first request is faster
  getBrowser().catch((err) => {
    console.error("[solver] initial browser launch failed:", err.message);
    console.error("[solver] install Chrome with: npx puppeteer browsers install chrome");
  });
});
