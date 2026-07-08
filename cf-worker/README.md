# XAN Cloudflare Worker v4 — Stream Proxy + AllAnime Episode Resolver

Single Cloudflare Worker that does both:
1. **Stream proxy** — proxies video segments with Referer/Origin headers (saves Vercel bandwidth)
2. **AllAnime episode resolver** — solves Turnstile captcha via Cloudflare Browser Rendering (free, no external service)

## Why this is the best option

| Feature | This Worker (v4) | Old v3 Worker | Free VPS solver |
|---------|------------------|---------------|-----------------|
| Cost | **$0** | $0.80-$3/1000 solves (2captcha) | $0 |
| Card needed | ❌ No | ❌ No | Depends on host |
| External service | ❌ None | ✓ 2captcha/CapSolver | ✓ VPS provider |
| Always-on | ✅ Yes | ✅ Yes | Depends on host |
| Setup time | ~5 min | ~10 min | 15-20 min |
| Reliability | ⭐⭐⭐⭐⭐ (Cloudflare infra) | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Single deploy | ✅ Worker does everything | ✅ | ❌ Need VPS + tunnel |

**This is the recommended path** if you already have a Cloudflare account.

## How the episode resolver works

```
XAN (Vercel) calls Worker /allanime/episode?showId=...&ep=...
                ↓
            Worker launches managed Chrome browser
            (Cloudflare Browser Rendering — env.BROWSER binding)
                ↓
            Browser navigates to allmanga.to/bangumi/<showId>/p-<ep>-<type>
                ↓
            Cloudflare "Just a moment..." challenge auto-passes
            (Chrome on CF infra is more trusted than random VPS IPs)
                ↓
            AllAnime's Vue app auto-renders Turnstile widget
                ↓
            Turnstile auto-solves (managed mode = no user interaction)
                ↓
            Vue app fetches episode sources with captcha token
                ↓
            Worker intercepts the GraphQL response
                ↓
            Worker decrypts tobeparsed (AES-GCM, key=SHA-256("Xot36i3lK3:v1"))
                ↓
            Worker returns sourceUrls to XAN as JSON
                ↓
            Worker caches sources for 5 min (subsequent calls are instant)
```

## Free tier limits

| Resource | Free tier limit | Notes |
|----------|-----------------|-------|
| Worker requests/day | 100,000 | Stream proxy + episode resolver combined |
| Browser CPU time/day | 10 minutes | ~20-60 uncached episode solves |
| Concurrent browser sessions | 10 | Should never hit this for personal use |
| Browser session length | 60 seconds max | Plenty for Turnstile (typical: 20-40s) |
| Worker script size | 1 MB | Ours is ~15 KB |

With 5-min caching, 10 min of browser CPU covers **~100-300 episode plays/day** — way more than enough for personal use. If you outgrow this, Workers Paid is $5/mo for 50M requests/day and unlimited browser time.

## Deploy (5 minutes)

### Step 1: Install wrangler (if not already installed)

```bash
npm install -g wrangler
# or: bun add -g wrangler
```

### Step 2: Log in to Cloudflare (if not already logged in)

```bash
wrangler login
# Opens browser → click "Allow"
```

If you already have a Cloudflare account from deploying the previous Worker, you're already logged in.

### Step 3: Install the new dependency

The Worker now uses `@cloudflare/puppeteer` for Browser Rendering. Install it:

```bash
cd cf-worker
npm install
```

This installs `@cloudflare/puppeteer` from `package.json`.

### Step 4: Deploy

```bash
wrangler deploy
```

Output:
```
Published xan-stream-proxy
  https://xan-stream-proxy.<your-subdomain>.workers.dev
```

**Note:** If you already had a Worker deployed at this URL (v2 or v3), this deploy will overwrite it with v4. That's expected — the URL stays the same, the Worker gets upgraded.

### Step 5: Verify

```bash
# Health check — should show version: 4 and browserRendering: true
curl https://xan-stream-proxy.<your-subdomain>.workers.dev/

# Test episode resolver (takes 20-40s on first call, instant cached)
curl "https://xan-stream-proxy.<your-subdomain>.workers.dev/allanime/episode?showId=srGrP23qJnjsHrRYD&episodeString=1&translationType=sub"
```

The episode resolver should return:
```json
{
  "sources": [
    {
      "sourceUrl": "--abcd1234...",
      "sourceName": "Yt-mp4",
      "priority": 1,
      "type": "mp4"
    },
    ...
  ],
  "durationMs": 28534,
  "graphQLCalls": 2
}
```

### Step 6: Set Vercel env var (if not already set)

If you already have `NEXT_PUBLIC_CF_WORKER_URL` set in Vercel → you're done. The URL didn't change, just the Worker behind it.

If not:
1. Vercel → your XAN project → Settings → Environment Variables
2. Add: `NEXT_PUBLIC_CF_WORKER_URL` = `https://xan-stream-proxy.<your-subdomain>.workers.dev`
3. Environments: ✓ Production, ✓ Preview, ✓ Development
4. Redeploy Vercel

## Endpoints

### `GET /` (stream proxy)

```
GET /?url=<stream_url>&h_Referer=<...>&h_Origin=<...>
```

Proxies a video segment/manifest request to an allowed anime CDN, adding the `Referer` / `Origin` headers that browsers can't set themselves.

The `h_` prefix is stripped and the rest becomes a request header on the upstream fetch.

### `GET /allanime/episode` (episode resolver)

```
GET /allanime/episode?showId=<allanime_id>&episodeString=<ep>&translationType=sub|dub
```

Returns:
```json
{
  "sources": [
    {
      "sourceUrl": "--abcd1234...",
      "sourceName": "Yt-mp4",
      "priority": 1,
      "type": "mp4"
    },
    ...
  ],
  "durationMs": 28534,
  "graphQLCalls": 2
}
```

The `sourceUrl` may be encoded (XOR with 56 if prefixed with `--`, hex-decoded if prefixed with `ap/`). XAN's existing `extractSource()` in `src/lib/allanime.ts` handles the decoding.

Cached responses include `"cached": true` and return in <100ms.

### `GET /` (health check)

Without `?url=`, returns service info:
```json
{
  "ok": true,
  "service": "xan-stream-proxy",
  "version": 4,
  "browserRendering": true,
  "endpoints": { ... },
  "cacheSize": 3,
  "allowedHosts": 26
}
```

If `browserRendering: false`, the `[[browser]]` binding isn't configured — re-check `wrangler.toml`.

## How XAN uses this Worker

XAN calls this Worker for two purposes:

### 1. Stream bandwidth offloading (existing)

When a user plays a video, XAN's player tries tiers in order:
- **direct** → browser fetches from CDN directly (0 Vercel BW)
- **manifest-proxy** → Vercel proxies just the .m3u8 manifest (~5KB)
- **cf-proxy** → **this Worker** proxies segments with Referer (0 Vercel BW) ← uses `?url=...` endpoint
- **full-proxy** → Vercel proxies everything (~200MB per episode, last resort)

The Worker's stream proxy tier is what saves your Vercel 10GB/mo bandwidth quota.

### 2. AllAnime episode source resolution (new)

When a user plays an episode, XAN's `/api/stream/[id]/[ep]` route:
1. Calls AllAnime's GraphQL directly → gets `AA_CRYPTO_MISSING`
2. Falls back to **this Worker's `/allanime/episode` endpoint** → Worker launches Chrome, solves captcha, returns sources
3. Sources are merged with Zen/Koto/Pahe/Gogoanime sources
4. Player picks the best source based on `providerPriority`

XAN code paths that call this endpoint:
- `src/lib/allanime.ts` → `getEpisodeSources()` AA_CRYPTO_MISSING fallback
- `src/lib/providers/isekai2nd.ts` → `fetchIsekai2ndSources()`
- Both use `NEXT_PUBLIC_CF_WORKER_URL` env var

## Security

- **Host allowlist** — the stream proxy only proxies requests to known anime provider CDNs. Prevents abuse as an open proxy.
- **No request body handling** — stream proxy is GET-only.
- **No cookies/credentials forwarded** — the Worker doesn't see or forward any user credentials.
- **No external API keys required** — unlike v3, no 2captcha/CapSolver key needed. Browser Rendering is built into Cloudflare's free tier.
- **CORS `*`** — allows any origin to use the Worker. Fine because the host allowlist prevents abuse. To lock down, replace `"*"` with your Vercel URL.

## Troubleshooting

### `browserRendering: false` in health check

The `[[browser]]` binding isn't configured. Make sure `wrangler.toml` contains:
```toml
[[browser]]
binding = "BROWSER"
```
Then `wrangler deploy` again.

### `/allanime/episode` returns `"Failed to launch browser"`

You've hit the 10 concurrent session limit. Wait a few seconds and retry. If it persists, check `wrangler tail` for errors — you may have a browser session leak (the Worker always closes browsers in `finally`, but a crash could leave one open).

### `/allanime/episode` returns `"Failed to capture sources"`

Cloudflare blocked the browser (rare on Cloudflare's own infra, but possible). Try:
1. Wait 5 minutes and retry — Cloudflare's bot detection resets periodically
2. Check `wrangler tail` for the page title — if it's still "Just a moment...", the challenge didn't pass
3. The Worker caches successful responses for 5 min, so once one request succeeds, subsequent requests for the same episode will be instant

### `/allanime/episode` is slow (>50s)

First call is always slow (browser cold-start + captcha solve). Subsequent calls within 5 min hit the cache and return in <100ms. If you need faster cold-starts, consider Workers Paid ($5/mo) which has higher browser time limits and warm browser pools.

### `wrangler deploy` fails with "browser binding requires Workers Paid plan"

Cloudflare occasionally changes which features are on the free tier. If this happens, you have two fallbacks:
1. **Use the free-solver** (Path A: local computer, or Path B: Render.com) — see `free-solver/README.md`
2. **Use the v3 Worker with paid 2captcha/CapSolver** — see git history for the old `worker.js`

### XAN still shows no "Isekai2nd" sources

1. Check `NEXT_PUBLIC_CF_WORKER_URL` is set in Vercel
2. Check Vercel redeployed after adding the env var
3. Check the Worker health check returns `version: 4` and `browserRendering: true`
4. Check Vercel function logs for `[isekai2nd] cf-worker returned HTTP 502` — if so, the Worker is erroring. Check `wrangler tail` for the actual error.

## Monitoring

### Real-time Worker logs

```bash
wrangler tail
```

Keep this running while testing — you'll see:
- `[worker] launching browser for <showId>:<ep>:<mode>`
- `[worker] GraphQL call #1: 200 https://api.allanime.day/api?...`
- `[worker] Cloudflare challenge passed — page title: ...`
- `[worker] success — 5 sources captured in 28534ms`

### Cloudflare dashboard

- Workers → xan-stream-proxy → Metrics: shows requests, CPU time, errors
- Workers → xan-stream-proxy → Browser sessions: shows browser session count and CPU time used

## Local development

You can run the Worker locally for testing the stream proxy, but **Browser Rendering doesn't work in `wrangler dev`** (it requires Cloudflare's production infrastructure). To test the episode resolver locally, deploy to production first.

```bash
cd cf-worker
npm install
wrangler dev
# → Local server at http://localhost:8787
# → Stream proxy works, /allanime/episode returns "Browser binding not configured"
```

## Files

- `worker.js` — the Worker code (single file, ~450 lines)
- `wrangler.toml` — Cloudflare Workers config with `[[browser]]` binding
- `package.json` — npm dependencies (`@cloudflare/puppeteer`, `wrangler`)
- `README.md` — this file

## Cost summary

| Item | Cost |
|------|------|
| Cloudflare Workers free tier | $0/month forever |
| Browser Rendering free tier (10 min CPU/day) | $0/month |
| Cloudflare account | $0 (no card needed) |
| XAN on Vercel Hobby | $0 (existing) |
| **Total** | **$0/month** |

If you outgrow the free tier (unlikely for personal use):
- Workers Paid: $5/month → 50M requests/day, unlimited browser time
- Or fall back to the free-solver (Path A or B from `free-solver/README.md`)
