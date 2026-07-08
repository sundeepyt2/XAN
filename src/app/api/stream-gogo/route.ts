// app/api/stream-gogo/route.ts
// ✅ Server-side gogoanime scraper
// ✅ Searches gogoanime.fi for the anime, finds the episode, extracts stream URL
// ✅ Tries multiple gogoanime domains (gogoanime.fi, gogoanime.vc, gogoanime.dk)

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const GOGO_DOMAINS = [
  "https://gogoanime.fi",
  "https://gogoanime.vc",
  "https://gogoanime.dk",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FETCH_HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://gogoanime.fi/",
};

interface GogoEpisodeLink {
  title: string;
  url: string;
}

// Step 1: Search for the anime on gogoanime
async function searchAnime(title: string, baseUrl: string): Promise<string | null> {
  try {
    const searchUrl = `${baseUrl}/search.html?keyword=${encodeURIComponent(title)}`;
    const res = await fetch(searchUrl, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for anime links in the search results
    // Pattern: <p class="name"><a href="/category/anime-name" title="...">
    const match = html.match(/href="(\/category\/[^"]+)"/);
    if (match && match[1]) {
      return `${baseUrl}${match[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

// Step 2: Get the episode page URL from the anime category page
async function getEpisodeUrl(
  categoryUrl: string,
  episode: number,
  baseUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(categoryUrl, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for episode links: <a href="/anime-name-episode-N"
    // Build the episode slug from the category URL
    const categoryMatch = categoryUrl.match(/\/category\/(.+)$/);
    if (!categoryMatch || !categoryMatch[1]) return null;
    const slug = categoryMatch[1];
    const epUrl = `${baseUrl}/${slug}-episode-${episode}`;

    // Verify the episode exists by checking the category page for a link to it
    const epLinkPattern = `href="[^"]*${slug}-episode-${episode}[^"]*"`;
    const epRegex = new RegExp(epLinkPattern);
    if (epRegex.test(html)) {
      return epUrl;
    }

    // If not found in the page, try the URL directly
    return epUrl;
  } catch {
    return null;
  }
}

// Step 3: Extract stream URL from the episode page
async function extractStreamUrl(
  episodeUrl: string,
): Promise<{ sources: Array<{ url: string; quality: string }>; headers?: Record<string, string> } | null> {
  try {
    const res = await fetch(episodeUrl, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for the "Load Server" / iframe embed URL
    // Gogoanime episode pages have: <a rel="100" href="..."> or <iframe src="..."
    // The stream URL is typically in a <a> tag with rel="1" (server 1)
    const iframeMatch = html.match(/<iframe[^>]*src="([^"]+)"/);
    if (iframeMatch && iframeMatch[1]) {
      const embedUrl = iframeMatch[1].startsWith("http")
        ? iframeMatch[1]
        : `https:${iframeMatch[1]}`;

      // Fetch the embed page to get the actual stream URL
      const embedRes = await fetch(embedUrl, {
        headers: { ...FETCH_HEADERS, Referer: episodeUrl },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      if (embedRes.ok) {
        const embedHtml = await embedRes.text();

        // Look for the source URL in the embed page
        // Common patterns: sources:[{file:"...",label:"..."}] or var src = "..."
        const sourceMatches = embedHtml.matchAll(
          /(?:file|src)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/g,
        );
        const sources: Array<{ url: string; quality: string }> = [];
        for (const m of sourceMatches) {
          if (m[1]) {
            sources.push({ url: m[1], quality: "Auto" });
          }
        }

        // Also look for MP4 sources
        const mp4Matches = embedHtml.matchAll(
          /(?:file|src)\s*[:=]\s*["']([^"']+\.mp4[^"']*)["']/g,
        );
        for (const m of mp4Matches) {
          if (m[1]) {
            sources.push({ url: m[1], quality: "Auto" });
          }
        }

        if (sources.length > 0) {
          return {
            sources,
            headers: { Referer: embedUrl },
          };
        }
      }
    }

    // Fallback: look for direct stream URLs in the episode page HTML
    const directStreamMatch = html.match(
      /https?:\/\/[^\s"']+\.m3u8[^\s"']*/,
    );
    if (directStreamMatch) {
      return {
        sources: [{ url: directStreamMatch[0], quality: "Auto" }],
        headers: { Referer: episodeUrl },
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const title = u.searchParams.get("title");
  const episode = u.searchParams.get("episode");

  if (!title || !episode) {
    return NextResponse.json(
      { error: "Missing title or episode parameter" },
      { status: 400 },
    );
  }

  // Try each gogoanime domain until one works
  for (const baseUrl of GOGO_DOMAINS) {
    try {
      // Step 1: Search for the anime
      const categoryUrl = await searchAnime(title, baseUrl);
      if (!categoryUrl) continue;

      // Step 2: Get the episode URL
      const epUrl = await getEpisodeUrl(categoryUrl, parseInt(episode, 10), baseUrl);
      if (!epUrl) continue;

      // Step 3: Extract stream URL
      const result = await extractStreamUrl(epUrl);
      if (result && result.sources.length > 0) {
        return NextResponse.json(result, {
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "cache-control": "no-store, max-age=0",
          },
        });
      }
    } catch {
      // Try next domain
      continue;
    }
  }

  return NextResponse.json(
    { error: "No gogoanime sources found", sources: [] },
    {
      status: 404,
      headers: { "access-control-allow-origin": "*" },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}
