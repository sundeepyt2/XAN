// lib/allanime.ts
// ✅ Rewritten streaming engine — TypeScript port of:
//     - ani-cli's AllAnime provider (process_response + AES-CTR decryption)
//     - walterwhite-69/AllManga.to-API (decode_url + extractor dispatch)
//
// Pipeline:
//   1. Persisted GraphQL query (GET /api?...) returns either cleartext OR tobeparsed
//   2. If tobeparsed: decrypt with AES-256-CTR
//      - key  = sha256("Xot36i3lK3:v1")
//      - skip byte 0 (version flag 0x01)
//      - IV   = bytes[1..13] (12 bytes)
//      - ctr  = IV + "00000002" (16-byte counter, block counter starts at 2)
//      - ct   = bytes[13..(length-16)]
//      - MAC  = last 16 bytes (ignored in CTR mode)
//   3. Parse episode.sourceUrls[] — each entry has {sourceName, sourceUrl, priority, type}
//   4. For each sourceUrl:
//      - "--" prefix → XOR each byte with 56
//      - "ap/" prefix → hex decode
//      - else → use as-is
//   5. Dispatch based on sourceName:
//      - Yt-mp4 → direct MP4 (tools.fast4speed.rsvp, needs Referer)
//      - Default / Sak / Wixmp / Luf-Mp4 / S-mp4 → fetch internal /apivtwo/clock.json
//      - Mp4 (mp4upload) → scrape embed page for MP4
//      - Fm-Hls (filemoon) / Vn-Hls (vidnest) → scrape embed page for HLS
//      - Viz-Cloud / MyCloud → vizcloud extractor
//      - Ok / Uni → iframe (return as-is)
//
// No cf_clearance cookie required.

import { createHash, createDecipheriv } from "crypto";
import { z } from "zod";
import { getStoredCookie } from "./cf-cookie-store";

const ALLANIME_GRAPHQL = "https://api.allanime.day/api/graphql";
const ALLANIME_API = "https://api.allanime.day/api";
const ALLANIME_BASE = "https://allanime.day";
const EPISODE_QUERY_HASH =
  "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";

const AES_KEY_PASSPHRASE = "Xot36i3lK3:v1";
const AES_KEY = createHash("sha256").update(AES_KEY_PASSPHRASE).digest();

const REFERER = "https://youtu-chan.com";
const ORIGIN = "https://youtu-chan.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0";

const REQUEST_TIMEOUT_MS = 12000;
const CLOCK_TIMEOUT_MS = 20000;
const LEGACY_EPISODES_ENDPOINT = "https://api.allanime.day/episodes";

export const AllAnimeShowSchema = z.object({
  _id: z.string(),
  name: z.string(),
  englishName: z.string().nullable().default(null),
  nativeName: z.string().nullable().default(null),
  aniListId: z.string().nullable().default(null),
  malId: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  thumbnail: z.string().nullable().default(null),
  banner: z.string().nullable().default(null),
  score: z.number().nullable().default(null),
  type: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
  season: z.unknown().nullable().default(null),
  airedStart: z.unknown().nullable().default(null),
  genres: z.array(z.string()).default([]),
  studios: z.array(z.string()).default([]),
  episodeCount: z.string().nullable().default(null),
  episodeDuration: z.string().nullable().default(null),
  availableEpisodes: z
    .object({
      sub: z.number().default(0),
      dub: z.number().default(0),
      raw: z.number().default(0),
    })
    .nullable()
    .default(null),
  availableEpisodesDetail: z
    .object({
      sub: z.array(z.string()).default([]),
      dub: z.array(z.string()).default([]),
      raw: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  countryOfOrigin: z.string().nullable().default(null),
});
export type AllAnimeShow = z.infer<typeof AllAnimeShowSchema>;

const ShowsResponseSchema = z.object({
  data: z.object({
    shows: z.object({
      edges: z.array(AllAnimeShowSchema).default([]),
    }),
  }),
});

const ShowResponseSchema = z.object({
  data: z.object({
    show: AllAnimeShowSchema.nullable(),
  }),
});

export interface SourceUrl {
  sourceUrl: string;
  sourceName: string;
  priority: number;
  type: string;
}

export interface StreamResult {
  url: string;
  /**
   * "hls" — HLS .m3u8 stream (loaded via hls.js)
   * "mp4" — direct MP4 file (loaded via <video src>)
   * "iframe" — embed page (Ok.ru, Uni, etc.) loaded directly as <video src>;
   *            these don't need Referer/Origin headers — they're public embeds
   */
  type: "hls" | "mp4" | "iframe";
  quality: string | null;
  sourceName: string;
  headers?: Record<string, string>;
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ALLANIME_GRAPHQL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        Referer: REFERER,
        Origin: ORIGIN,
      },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`[AllAnime] HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    if (json?.errors) {
      console.error("[AllAnime] GraphQL errors:", json.errors[0]?.message);
      return null;
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      console.error("[AllAnime] invalid response:", parsed.error.issues.slice(0, 3));
      return null;
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[AllAnime] timed out");
    } else {
      console.error("[AllAnime] fetch failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface AllAnimeSearchResult {
  edges: AllAnimeShow[];
}

export async function searchAllAnime(
  query: string,
  limit = 10,
): Promise<AllAnimeSearchResult | null> {
  if (!query.trim()) return null;
  const result = await gql(
    `query($s:SearchInput,$limit:Int){shows(search:$s,limit:$limit){edges{_id name englishName aniListId malId thumbnail score type episodeCount availableEpisodes}}}`,
    { s: { query }, limit },
    ShowsResponseSchema,
  );
  if (!result) return null;
  return { edges: result.data.shows.edges };
}

export async function fetchAllAnimeById(
  allAnimeId: string,
): Promise<AllAnimeShow | null> {
  const result = await gql(
    `query($id:String!){show(_id:$id){_id name englishName nativeName aniListId malId description thumbnail banner score type status season airedStart genres studios episodeCount episodeDuration availableEpisodes availableEpisodesDetail countryOfOrigin}}`,
    { id: allAnimeId },
    ShowResponseSchema,
  );
  return result?.data.show ?? null;
}

export async function findShowByAniListId(
  anilistId: number,
  anilistTitle: string,
): Promise<AllAnimeShow | null> {
  const search = await searchAllAnime(anilistTitle, 10);
  if (!search) return null;

  const exact = search.edges.find((s) => s.aniListId === String(anilistId));
  if (exact) return exact;

  for (const candidate of search.edges.slice(0, 3)) {
    const full = await fetchAllAnimeById(candidate._id);
    if (full?.aniListId === String(anilistId)) return full;
  }

  return search.edges[0] ?? null;
}

function decryptTobeparsed(blobB64: string): unknown {
  try {
    const buf = Buffer.from(blobB64, "base64");
    if (buf.length < 32) return null;

    const iv12 = buf.subarray(1, 13);
    const counter = Buffer.concat([iv12, Buffer.from([0, 0, 0, 0x02])]);
    const ciphertext = buf.subarray(13, buf.length - 16);

    const decipher = createDecipheriv("aes-256-ctr", AES_KEY, counter);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf-8"));
  } catch (err) {
    console.error("[AllAnime] decryptTobeparsed failed:", err);
    return null;
  }
}

export function decodeUrl(raw: string): string {
  if (!raw) return raw;
  if (raw.startsWith("--")) {
    try {
      const hex = raw.slice(2);
      const bytes = Buffer.from(hex, "hex");
      const out = Buffer.allocUnsafe(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ 56;
      return out.toString("utf-8");
    } catch {
      return raw;
    }
  }
  if (raw.startsWith("ap/")) {
    try {
      return Buffer.from(raw.slice(3), "hex").toString("utf-8");
    } catch {
      return raw;
    }
  }
  return raw;
}

export async function getEpisodeSources(
  showId: string,
  episodeStr: string,
  mode: "sub" | "dub" = "sub",
): Promise<SourceUrl[] | null> {
  const url =
    `${ALLANIME_API}?` +
    new URLSearchParams({
      variables: JSON.stringify({
        showId,
        episodeString: episodeStr,
        translationType: mode,
      }),
      extensions: JSON.stringify({
        persistedQuery: { version: 1, sha256Hash: EPISODE_QUERY_HASH },
      }),
    }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        Referer: REFERER,
        Origin: ORIGIN,
      },
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      console.warn(`[AllAnime] episode query HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    if (json?.errors) {
      console.warn("[AllAnime] episode query errors:", json.errors[0]?.message);
      return null;
    }

    if (json?.data?.tobeparsed) {
      const decrypted = decryptTobeparsed(json.data.tobeparsed) as
        | { episode?: { sourceUrls?: SourceUrl[] } | null }
        | null;
      const sourceUrls = decrypted?.episode?.sourceUrls ?? [];
      if (sourceUrls.length === 0) {
        console.warn("[AllAnime] tobeparsed decrypted but no sourceUrls");
        return null;
      }
      return sourceUrls;
    }

    if (json?.data?.episode?.sourceUrls) {
      return json.data.episode.sourceUrls as SourceUrl[];
    }

    console.warn("[AllAnime] episode query returned no recognizable sourceUrls");
    return null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[AllAnime] episode query timed out");
    } else {
      console.error("[AllAnime] episode query failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchClockJson(path: string): Promise<StreamResult[]> {
  const fullPath = path.replace("/clock", "/clock.json");
  const fullUrl = fullPath.startsWith("http")
    ? fullPath
    : `${ALLANIME_BASE}${fullPath}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOCK_TIMEOUT_MS);

  try {
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Referer: REFERER,
        Accept: "application/json, */*",
      },
    });

    if (!res.ok) {
      console.warn(`[AllAnime] clock.json HTTP ${res.status} for ${fullUrl}`);
      return [];
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      console.warn("[AllAnime] clock.json response is not JSON");
      return [];
    }

    const out: StreamResult[] = [];
    const obj = json as Record<string, unknown>;
    const links = (obj.links ?? obj.sources ?? []) as Array<Record<string, unknown>>;
    if (Array.isArray(links)) {
      for (const l of links) {
        const url =
          typeof l.link === "string"
            ? l.link
            : typeof l.src === "string"
              ? l.src
              : typeof l.url === "string"
                ? l.url
                : null;
        if (!url) continue;
        const isHls = url.includes(".m3u8") || l.hls === true || l.type === "hls";
        out.push({
          url,
          type: isHls ? "hls" : "mp4",
          quality:
            typeof l.resolutionStr === "string"
              ? l.resolutionStr
              : typeof l.quality === "string"
                ? l.quality
                : typeof l.label === "string"
                  ? l.label
                  : null,
          sourceName: "allanime-clock",
          headers: { Referer: REFERER, Origin: ORIGIN },
        });
      }
    }
    return out;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[AllAnime] clock.json timed out for ${fullUrl}`);
    } else {
      console.warn("[AllAnime] clock.json fetch failed:", err);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function scrapeEmbedPage(
  embedUrl: string,
  sourceName: string,
): Promise<StreamResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const ASSET_EXT = /\.(css|js|png|jpe?g|gif|svg|woff2?|ttf|ico|webp|json|map)(\?|$)/i;

  try {
    const res = await fetch(embedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Referer: REFERER,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.warn(`[${sourceName}] HTTP ${res.status} on ${embedUrl}`);
      return [];
    }
    const html = await res.text();

    const out: StreamResult[] = [];
    const seen = new Set<string>();

    const cleanUrl = (u: string) =>
      u.replace(/\\\//g, "/").replace(/\\u002F/g, "/").replace(/&amp;/g, "&");

    const hlsMatches = html.matchAll(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/g);
    for (const m of hlsMatches) {
      const url = cleanUrl(m[0]);
      if (seen.has(url)) continue;
      if (ASSET_EXT.test(url)) continue;
      seen.add(url);
      out.push({
        url,
        type: "hls",
        quality: null,
        sourceName,
        headers: { Referer: REFERER, Origin: ORIGIN },
      });
    }

    const mp4Matches = html.matchAll(/https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?(?=["'\s<>]|$)/g);
    for (const m of mp4Matches) {
      const url = cleanUrl(m[0]);
      if (seen.has(url)) continue;
      if (ASSET_EXT.test(url)) continue;
      seen.add(url);
      out.push({
        url,
        type: "mp4",
        quality: null,
        sourceName,
        headers: { Referer: REFERER, Origin: ORIGIN },
      });
    }

    return out;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[${sourceName}] timed out`);
    } else {
      console.warn(`[${sourceName}] fetch failed:`, err);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractSource(
  rawUrl: string,
  sourceName: string,
): Promise<StreamResult[] | null> {
  const url = decodeUrl(rawUrl);
  const name = (sourceName || "").toLowerCase();

  if (name.includes("yt-mp4")) {
    if (!url.startsWith("http")) return null;
    return [
      {
        url,
        type: "mp4",
        quality: null,
        sourceName,
        headers: { Referer: REFERER, Origin: ORIGIN },
      },
    ];
  }

  if (
    name.includes("default") ||
    name.includes("sak") ||
    name.includes("wixmp") ||
    name.includes("luf-mp4") ||
    name.includes("s-mp4") ||
    url.startsWith("/apivtwo/")
  ) {
    const clockResults = await fetchClockJson(url);
    if (clockResults.length > 0) {
      return clockResults.map((r) => ({ ...r, sourceName }));
    }
    return null;
  }

  if (name === "mp4" || url.includes("mp4upload.com")) {
    return await scrapeEmbedPage(url, sourceName);
  }

  if (
    name.includes("fm-hls") ||
    name.includes("vn-hls") ||
    url.includes("filemoon") ||
    url.includes("vidnest") ||
    url.includes("bysekoze")
  ) {
    return await scrapeEmbedPage(url, sourceName);
  }

  if (name.includes("viz") || name.includes("mycloud")) {
    return await scrapeEmbedPage(url, sourceName);
  }

  if (name.includes("ok") && url.includes("ok.ru")) {
    // Ok.ru is an iframe embed URL — load directly, no Referer needed
    return [
      {
        url,
        type: "iframe",
        quality: null,
        sourceName,
      },
    ];
  }

  // ✅ Uni / other iframe-style sources (allanime.uns.bio/#... embeds)
  // These are iframe embeds — no headers needed, load directly
  if (name.includes("uni") || (url.includes("uns.bio") && url.includes("#"))) {
    return [
      {
        url,
        type: "iframe",
        quality: null,
        sourceName,
      },
    ];
  }

  if (url.startsWith("http")) {
    const isHls = url.includes(".m3u8");
    return [
      {
        url,
        type: isHls ? "hls" : "mp4",
        quality: null,
        sourceName,
        headers: { Referer: REFERER, Origin: ORIGIN },
      },
    ];
  }

  return null;
}

export async function extractStreamUrl(
  showId: string,
  episodeStr: string,
  mode: "sub" | "dub" = "sub",
): Promise<{
  sources: StreamResult[];
  provider: string;
  failures: { source: string; reason: string }[];
} | null> {
  const sourceUrls = await getEpisodeSources(showId, episodeStr, mode);
  if (!sourceUrls || sourceUrls.length === 0) return null;

  const priority = (name: string, declaredPriority: number): number => {
    const n = (name || "").toLowerCase();
    if (n.includes("yt-mp4")) return 1000 + declaredPriority;
    if (
      n.includes("default") ||
      n.includes("sak") ||
      n.includes("wixmp") ||
      n.includes("luf-mp4") ||
      n.includes("s-mp4")
    )
      return 500 + declaredPriority;
    if (n === "mp4") return 300 + declaredPriority;
    if (n.includes("fm-hls") || n.includes("vn-hls")) return 200 + declaredPriority;
    if (n.includes("viz") || n.includes("mycloud")) return 150 + declaredPriority;
    return declaredPriority;
  };
  const sorted = [...sourceUrls].sort(
    (a, b) => priority(b.sourceName, b.priority) - priority(a.sourceName, a.priority),
  );

  const sources: StreamResult[] = [];
  const failures: { source: string; reason: string }[] = [];

  const CONCURRENCY = 4;
  const queue = [...sorted];

  async function processOne(entry: SourceUrl) {
    if (!entry.sourceUrl) return;
    try {
      const extracted = await extractSource(entry.sourceUrl, entry.sourceName);
      if (extracted && extracted.length > 0) {
        sources.push(...extracted);
      } else {
        failures.push({ source: entry.sourceName, reason: "no sources extracted" });
      }
    } catch (err) {
      failures.push({
        source: entry.sourceName,
        reason: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    await Promise.all(batch.map(processOne));
  }

  if (sources.length === 0) {
    return { sources: [], provider: "allanime", failures };
  }
  return { sources, provider: "allanime", failures };
}

export async function testStoredCookie(): Promise<{
  status: number;
  ok: boolean;
  bodySnippet: string;
  hasCookie: boolean;
  diagnostics: {
    serverIp: string | null;
    savedFromIp: string | null;
    ipMismatch: boolean;
    userAgent: string | null;
    cookieLength: number;
    hasCfClearance: boolean;
    responseServer: string | null;
    cfMitigated: string | null;
  };
}> {
  const stored = await getStoredCookie();
  if (!stored) {
    return {
      status: 0,
      ok: false,
      bodySnippet: "",
      hasCookie: false,
      diagnostics: {
        serverIp: null,
        savedFromIp: null,
        ipMismatch: false,
        userAgent: null,
        cookieLength: 0,
        hasCfClearance: false,
        responseServer: null,
        cfMitigated: null,
      },
    };
  }

  const { getServerIp } = await import("./cf-cookie-store");
  const serverIp = await getServerIp();
  const ipMismatch =
    stored.savedFromIp != null && serverIp != null && stored.savedFromIp !== serverIp;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `${LEGACY_EPISODES_ENDPOINT}?id=PGcK4wGnqDoeihT6n&episode=1&type=sub`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": stored.userAgent,
        Accept: "application/json",
        Referer: "https://allmanga.to/",
        Origin: "https://allmanga.to",
        Cookie: stored.value,
      },
    });

    const body = await res.text();
    const cfMitigated = res.headers.get("cf-mitigated");

    return {
      status: res.status,
      ok: res.ok && !body.includes("Just a moment") && !cfMitigated,
      bodySnippet: body.substring(0, 500),
      hasCookie: true,
      diagnostics: {
        serverIp,
        savedFromIp: stored.savedFromIp,
        ipMismatch,
        userAgent: stored.userAgent,
        cookieLength: stored.value.length,
        hasCfClearance: stored.value.includes("cf_clearance="),
        responseServer: res.headers.get("server"),
        cfMitigated,
      },
    };
  } catch (err) {
    const baseDiag = {
      serverIp,
      savedFromIp: stored.savedFromIp,
      ipMismatch,
      userAgent: stored.userAgent,
      cookieLength: stored.value.length,
      hasCfClearance: stored.value.includes("cf_clearance="),
      responseServer: null,
      cfMitigated: null,
    };
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        status: 0,
        ok: false,
        bodySnippet: "Request timed out",
        hasCookie: true,
        diagnostics: baseDiag,
      };
    }
    return {
      status: 0,
      ok: false,
      bodySnippet: err instanceof Error ? err.message : "Unknown error",
      hasCookie: true,
      diagnostics: baseDiag,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function getAllAnimeTitle(show: AllAnimeShow): string {
  return show.englishName ?? show.name ?? show.nativeName ?? "Untitled";
}

export function getAllAnimeCover(show: AllAnimeShow): string {
  return show.thumbnail ?? "/placeholder-card.png";
}

export function formatAllAnimeScore(score: number | null): string {
  if (score == null) return "N/A";
  return score.toFixed(2);
}
