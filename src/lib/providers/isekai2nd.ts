// lib/providers/isekai2nd.ts
// ✅ Isekai2nd provider — AllAnime's sister site for episode streaming
// ✅ Uses AllAnime's search (no captcha) to find the showId, then routes
//    episode-source queries through a Turnstile solver.
// ✅ Returns sources compatible with AllAnime's extractor pipeline — same
//    sourceUrl format, same CDN hostnames, same Referer header expectations.
//
// Why this exists:
//   As of mid-2026, AllAnime's `episode` GraphQL query requires a Cloudflare
//   Turnstile captcha token (`extensions.captcha = {token, provider}`) —
//   the server returns `AA_CRYPTO_MISSING` without one. The token is short-
//   lived (~5min), so a serverless function can't solve it directly.
//
// Two solver backends are supported (set ONE env var, not both):
//
//   1. FREE (recommended): NEXT_PUBLIC_FREE_SOLVER_URL
//      Points to a free VPS running free-solver/server.js (Puppeteer + stealth).
//      Cost: $0 (Oracle Cloud Free Tier = always free, 1GB RAM).
//      See free-solver/README.md for setup.
//
//   2. PAID (optional): NEXT_PUBLIC_CF_WORKER_URL
//      Points to the Cloudflare Worker in cf-worker/worker.js, which uses
//      2captcha or CapSolver to solve the captcha. Cost: ~$0.80-$3 per 1000
//      solves. See cf-worker/README.md for setup.
//
//   If BOTH env vars are set, the FREE solver takes precedence (no cost).
//
// "Isekai2nd" is named after the `stLinks.episode.link = "isekai2nd.com"`
// config from AllAnime's authconfigs — AllAnime's frontend uses
// isekai2nd.com as the Referer for episode stream CDN requests (instead
// of youtu-chan.com which is used for manga chapters). This provider
// honours that convention so streams load correctly.

import type { StreamResult } from "../allanime";

const ISEKAI2ND_REFERER = "https://isekai2nd.com";
const ISEKAI2ND_ORIGIN = "https://isekai2nd.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0";

export interface Isekai2ndSource extends StreamResult {
  provider: "isekai2nd";
}

/**
 * Fetch episode sources from AllAnime via a Turnstile solver (free VPS or
 * paid CF Worker). Returns sources that downstream extractors (in
 * `src/lib/allanime.ts`) can resolve into playable stream URLs.
 *
 * @param showId       AllAnime show ID (e.g. "srGrP23qJnjsHrRYD")
 * @param episodeStr   Episode string (e.g. "1", "12", "12.5")
 * @param mode         "sub" or "dub"
 * @returns            Array of stream sources, or empty array on failure
 */
export async function fetchIsekai2ndSources(
  showId: string,
  episodeStr: string,
  mode: "sub" | "dub" = "sub",
): Promise<Isekai2ndSource[]> {
  // Prefer the FREE solver (no cost), fall back to the paid CF Worker.
  const freeSolverUrl = process.env.NEXT_PUBLIC_FREE_SOLVER_URL;
  const workerUrl = process.env.NEXT_PUBLIC_CF_WORKER_URL;
  const solverUrl = freeSolverUrl || workerUrl;

  if (!solverUrl) {
    console.warn(
      "[isekai2nd] No solver configured. Set either:\n" +
        "  - NEXT_PUBLIC_FREE_SOLVER_URL (free — see free-solver/README.md), OR\n" +
        "  - NEXT_PUBLIC_CF_WORKER_URL (paid — see cf-worker/README.md)",
    );
    return [];
  }

  const backend = freeSolverUrl ? "free-solver" : "cf-worker";
  const endpoint = `${solverUrl}/allanime/episode`;
  const params = new URLSearchParams({
    showId,
    episodeString: episodeStr,
    translationType: mode,
  });

  // Optional shared secret for the free solver
  const solverSecret = process.env.SOLVER_SECRET;
  if (solverSecret) {
    params.set("secret", solverSecret);
  }

  const controller = new AbortController();
  // 150s timeout — first captcha solve can take 30-120s; cached calls <1s.
  // Both the free VPS solver and the CF Worker cache solved tokens/captchas
  // for 4-5 min, so most calls hit the cache and return immediately.
  const timeout = setTimeout(() => controller.abort(), 150_000);

  try {
    const res = await fetch(`${endpoint}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        Referer: ISEKAI2ND_REFERER,
        Origin: ISEKAI2ND_ORIGIN,
      },
      next: { revalidate: 300 }, // cache for 5 min — episodes don't change
    });

    if (!res.ok) {
      console.warn(
        `[isekai2nd] ${backend} returned HTTP ${res.status} for showId=${showId} ep=${episodeStr}`,
      );
      return [];
    }

    const json = (await res.json()) as {
      sources?: Array<{
        sourceUrl: string;
        sourceName: string;
        priority: number;
        type: string;
      }>;
      error?: string;
      cached?: boolean;
    };

    if (json.error) {
      console.warn(`[isekai2nd] ${backend} error: ${json.error}`);
      return [];
    }

    if (!json.sources || json.sources.length === 0) {
      console.warn(`[isekai2nd] No sources returned for showId=${showId} ep=${episodeStr}`);
      return [];
    }

    console.log(
      `[isekai2nd] ${backend} returned ${json.sources.length} sources${json.cached ? " (cached)" : ""} for showId=${showId} ep=${episodeStr}`,
    );

    // Map to the StreamResult shape that XAN's extractor pipeline expects.
    // We tag each source with provider: "isekai2nd" so the SourceSwitcher
    // can display them distinctly from regular AllAnime sources.
    return json.sources.map((s) => ({
      url: s.sourceUrl, // raw (possibly encoded) URL — extractSource() will decode
      type: "hls", // extractSource() will refine this based on sourceName
      quality: null,
      sourceName: s.sourceName,
      provider: "isekai2nd" as const,
      headers: { Referer: ISEKAI2ND_REFERER, Origin: ISEKAI2ND_ORIGIN },
    })) as Isekai2ndSource[];
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[isekai2nd] ${backend} request timed out`);
    } else {
      console.warn(`[isekai2nd] ${backend} fetch failed:`, err);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convenience: search AllAnime for a show by title (no captcha needed for
 * search) and return the AllAnime showId. Used by the watch page to map
 * an AniList ID → AllAnime showId before calling fetchIsekai2ndSources.
 *
 * This is a thin wrapper around the existing /api/allanime proxy.
 */
export async function findIsekai2ndShowId(
  anilistId: number,
  title: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      q: title,
      limit: "5",
    });
    const res = await fetch(`/api/allanime?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      edges?: Array<{
        _id: string;
        aniListId?: string | null;
        name?: string;
      }>;
    };

    if (!json.edges || json.edges.length === 0) return null;

    // Prefer exact aniListId match
    const exact = json.edges.find(
      (e) => e.aniListId && Number(e.aniListId) === anilistId,
    );
    if (exact) return exact._id;

    // Fall back to first result
    return json.edges[0]._id;
  } catch (err) {
    console.warn(`[isekai2nd] showId lookup failed:`, err);
    return null;
  }
}
