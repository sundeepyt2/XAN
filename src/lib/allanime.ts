// lib/allanime.ts
// ✅ AllAnime streaming engine — ported from SNI's proven approach.
//
// Key insight: AllAnime has a PERSISTED GraphQL query endpoint at
// api.allanime.day/api that is NOT behind Cloudflare. The response
// contains an AES-256-CTR encrypted `tobeparsed` field which, when
// decrypted, yields the episode's sourceUrls array.
//
// Algorithm (from ani-cli master):
//   - Key: sha256("Xot36i3lK3:v1")  (32 bytes)
//   - Skip byte 0 (version flag 0x01)
//   - IV = bytes[1..13]  (12 bytes)
//   - Counter = IV + 00000002  (4 bytes, big-endian = 2)
//   - Ciphertext = bytes[13..(length-16)]
//   - Last 16 bytes = MAC (ignored in CTR mode)
//   - Decrypted: {"episode":{"sourceUrls":[...]}}
//
// Source URL deobfuscation:
//   - "--" prefix → XOR each byte with 56
//   - "ap/" prefix → hex decode
//
// Source dispatch by sourceName:
//   Yt-mp4 → direct MP4 (tools.fast4speed.rsvp), needs Referer: youtu-chan.com
//   Default/Sak/Wixmp/Luf-Mp4/S-mp4 → fetch internal /apivtwo/clock.json
//   Mp4/Fm-Hls/Vn-Hls → scrape embed page (Megacloud/Vixcloud)
//   Ok/Uni → direct

import { z } from "zod";
import {
  createHash,
  createDecipheriv,
  type CipherCCMTypes,
  type CipherGCMTypes,
} from "node:crypto";
import { extractMegacloud, extractVixcloud } from "./extractors";

// ─── Constants (from SNI / ani-cli) ───
const ALLANIME_API = "https://api.allanime.day/api";
const AES_KEY_PASSPHRASE = "Xot36i3lK3:v1";
const EPISODE_QUERY_HASH =
  "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";
const REFERER = "https://youtu-chan.com";
const ORIGIN = "https://youtu-chan.com";
const REQUEST_TIMEOUT_MS = 15000;

// Pre-compute the AES key (SHA-256 of the passphrase → 32 bytes)
const AES_KEY = createHash("sha256").update(AES_KEY_PASSPHRASE).digest();

// ─── Types ───
export interface SourceUrl {
  sourceName: string;
  sourceUrl: string;
  priority: number;
  type: string;
}

export interface StreamResult {
  url: string;
  type: "hls" | "mp4";
  quality: string | null;
  sourceName: string;
  headers?: Record<string, string>;
}

// ─── Existing schemas (for metadata, unchanged) ───
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

// ─── AES-256-CTR decryption of tobeparsed ───
/**
 * Decrypt the `tobeparsed` field from AllAnime's persisted GraphQL response.
 *
 * Format (from ani-cli master):
 *   byte 0: version flag (0x01) — skip
 *   bytes 1..13: IV (12 bytes)
 *   bytes 13..(length-16): ciphertext
 *   last 16 bytes: MAC (ignored in CTR mode)
 *
 * Cipher: AES-256-CTR
 *   Key: sha256("Xot36i3lK3:v1")
 *   Counter: IV (12 bytes) + 00000002 (4 bytes, big-endian)
 */
export function decryptTobeparsed(blobB64: string): unknown {
  try {
    // Decode base64 → bytes
    const buf = Buffer.from(blobB64, "base64");
    if (buf.length < 29) {
      // Need at least: 1 (flag) + 12 (IV) + 16 (MAC) = 29 bytes minimum
      console.warn("[AllAnime] tobeparsed too short:", buf.length);
      return null;
    }

    // Skip byte 0 (version flag)
    const iv = buf.subarray(1, 13); // 12 bytes
    const ct = buf.subarray(13, buf.length - 16); // ciphertext (minus MAC)
    // Last 16 bytes = MAC, ignored in CTR mode

    // AES-256-CTR with 12-byte IV + 4-byte counter (= 2)
    // Node's createDecipheriv expects a 16-byte IV for CTR
    // The counter value of 2 is embedded in the last 4 bytes
    const fullIv = Buffer.alloc(16);
    iv.copy(fullIv, 0);
    // Counter = 2 (big-endian, 4 bytes)
    fullIv.writeUInt32BE(2, 12);

    const decipher = createDecipheriv("aes-256-ctr", AES_KEY, fullIv);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    const json = decrypted.toString("utf-8");

    return JSON.parse(json);
  } catch (err) {
    console.error("[AllAnime] decryptTobeparsed failed:", err);
    return null;
  }
}

// ─── GraphQL fetch helper (for metadata, unchanged) ───
async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ALLANIME_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131",
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

// ─── Public metadata API (unchanged) ───

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

// ─── NEW: Episode source fetching via persisted GraphQL query ───

/**
 * Fetch episode source URLs using AllAnime's persisted GraphQL query.
 * This endpoint is NOT behind Cloudflare — no cf_clearance cookie needed!
 *
 * @param showId AllAnime show ID (e.g. "PGcK4wGnqDoeihT6n")
 * @param episodeStr Episode string (e.g. "1", "2", "12.5")
 * @param mode "sub" or "dub"
 * @returns Array of SourceUrl objects, or null if fetch/decrypt fails
 */
export async function getEpisodeSources(
  showId: string,
  episodeStr: string,
  mode: "sub" | "dub" = "sub",
): Promise<SourceUrl[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // The episode query needs `show{_id name}` to avoid a server-side error
    // ("Cannot set property 'countryOfOrigin' of undefined").
    // sourceUrls is a scalar Object type — no subfields allowed.
    // The response contains data.tobeparsed (AES-encrypted) with the sourceUrls.
    const query = `query($showId:String!,$episodeString:String!,$translationType:VaildTranslationTypeEnumType!){episode(showId:$showId,episodeString:$episodeString,translationType:$translationType){sourceUrls show{_id name}}}`;

    const res = await fetch(ALLANIME_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: REFERER,
        Origin: ORIGIN,
      },
      body: JSON.stringify({
        query,
        variables: {
          showId,
          episodeString: episodeStr,
          translationType: mode,
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[AllAnime] episode query HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();

    // The response may contain:
    // 1. data.episode.sourceUrls (direct, unencrypted — sourceUrls is scalar Object)
    // 2. data.tobeparsed (AES-encrypted blob with the full episode data)
    // Even if there are GraphQL errors, tobeparsed may still be present.
    let sourceUrls: SourceUrl[] = [];

    if (json?.data?.episode?.sourceUrls) {
      const raw = json.data.episode.sourceUrls;
      if (Array.isArray(raw)) {
        sourceUrls = raw.map((s: unknown) => {
          const src = s as Record<string, unknown>;
          return {
            sourceUrl: String(src.sourceUrl ?? ""),
            sourceName: String(src.sourceName ?? ""),
            priority: Number(src.priority ?? 0),
            type: String(src.type ?? ""),
          };
        });
      }
    }

    // Always try tobeparsed (even if there are errors — it may still contain data)
    if (sourceUrls.length === 0 && json?.data?.tobeparsed) {
      const decrypted = decryptTobeparsed(json.data.tobeparsed);
      if (decrypted && typeof decrypted === "object") {
        const episode = (decrypted as { episode?: { sourceUrls?: unknown[] } })
          .episode;
        if (episode?.sourceUrls && Array.isArray(episode.sourceUrls)) {
          sourceUrls = episode.sourceUrls.map((s: unknown) => {
            const src = s as Record<string, unknown>;
            return {
              sourceUrl: String(src.sourceUrl ?? ""),
              sourceName: String(src.sourceName ?? ""),
              priority: Number(src.priority ?? 0),
              type: String(src.type ?? ""),
            };
          });
        }
      }
    }

    if (sourceUrls.length === 0) {
      console.warn("[AllAnime] No sourceUrls found in episode response");
      return null;
    }

    // Sort by priority (lower = higher priority)
    sourceUrls.sort((a, b) => a.priority - b.priority);

    return sourceUrls;
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

// ─── URL deobfuscation ───

/**
 * Deobfuscate a source URL from AllAnime.
 * - "--" prefix → hex decode, then XOR each byte with 56
 *   (yields internal paths like /apivtwo/clock?id=...)
 * - "ap/" prefix → hex decode
 * - Otherwise → return as-is (direct URL)
 */
function deobfuscateUrl(url: string): string {
  if (url.startsWith("--")) {
    // Hex decode, then XOR each byte with 56
    const hexStr = url.slice(2);
    try {
      const bytes = Buffer.from(hexStr, "hex");
      const decrypted = bytes.map((b) => b ^ 56);
      return Buffer.from(decrypted).toString("utf-8");
    } catch {
      return url;
    }
  }
  if (url.startsWith("ap/")) {
    // Hex decode
    try {
      return Buffer.from(url.slice(3), "hex").toString("utf-8");
    } catch {
      return url;
    }
  }
  return url;
}

// ─── Source extraction (dispatch by sourceName) ───

/**
 * Extract a playable stream URL from a SourceUrl entry.
 * Dispatches to the appropriate handler based on sourceName.
 *
 * Priority order (most playable first):
 *   Yt-mp4 → direct MP4 (tools.fast4speed.rsvp), needs Referer header
 *   S-mp4 / Uv-mp4 / Default / Sak / Wixmp / Luf-Mp4 → fetch /apivtwo/clock.json
 *   Ok / Uni → direct URLs (if http)
 *   Sl-mp4 / Mp4 / Fm-Hls / Vn-Hls → embed pages (skip — not directly playable)
 *
 * @param source The SourceUrl entry from AllAnime
 * @returns StreamResult with playable URL + headers, or null
 */
export async function extractStreamUrl(
  source: SourceUrl,
): Promise<StreamResult | null> {
  const rawUrl = source.sourceUrl;
  const deobfuscated = deobfuscateUrl(rawUrl);
  const name = source.sourceName;

  // Yt-mp4: direct MP4 from tools.fast4speed.rsvp — THE BEST SOURCE
  // The URL already contains an Authorization token
  if (name === "Yt-mp4") {
    if (deobfuscated.startsWith("http")) {
      return {
        url: deobfuscated,
        type: "mp4",
        quality: null,
        sourceName: name,
        headers: {
          Referer: REFERER,
          Origin: ORIGIN,
        },
      };
    }
    return null;
  }

  // S-mp4 / Uv-mp4 / Default / Sak / Wixmp / Luf-Mp4: internal /apivtwo/clock path
  if (
    name === "S-mp4" ||
    name === "Uv-mp4" ||
    name === "Default" ||
    name === "Sak" ||
    name === "Wixmp" ||
    name === "Luf-Mp4"
  ) {
    // If it starts with /apivtwo/clock, fetch the clock.json endpoint
    if (deobfuscated.startsWith("/apivtwo/clock")) {
      const clockUrl = `https://api.allanime.day${deobfuscated}`;
      const streamUrl = await fetchClockJson(clockUrl);
      if (streamUrl) {
        return {
          url: streamUrl.url,
          type: streamUrl.type,
          quality: streamUrl.quality,
          sourceName: name,
          headers: streamUrl.headers,
        };
      }
    }
    // If it's a direct URL, use it
    if (deobfuscated.startsWith("http") && !isEmbedUrl(deobfuscated)) {
      return {
        url: deobfuscated,
        type: deobfuscated.includes(".m3u8") ? "hls" : "mp4",
        quality: null,
        sourceName: name,
      };
    }
    return null;
  }

  // Ok / Uni: direct URLs (if not embeds)
  if (name === "Ok" || name === "Uni") {
    if (deobfuscated.startsWith("http") && !isEmbedUrl(deobfuscated)) {
      return {
        url: deobfuscated,
        type: deobfuscated.includes(".m3u8") ? "hls" : "mp4",
        quality: null,
        sourceName: name,
      };
    }
    return null;
  }

  // Skip embed pages (Sl-mp4, Mp4, Fm-Hls, Vn-Hls) — not directly playable
  // These would need iframe extraction which we don't support yet
  if (
    name === "Sl-mp4" ||
    name === "Mp4" ||
    name === "Fm-Hls" ||
    name === "Vn-Hls" ||
    name === "mp4upload"
  ) {
    return null;
  }

  // Unknown source type — try as direct URL if it's not an embed
  if (deobfuscated.startsWith("http") && !isEmbedUrl(deobfuscated)) {
    return {
      url: deobfuscated,
      type: deobfuscated.includes(".m3u8") ? "hls" : "mp4",
      quality: null,
      sourceName: name,
    };
  }

  console.warn(`[AllAnime] Could not extract stream for source: ${name}`);
  return null;
}

/**
 * Check if a URL is an iframe embed page (not directly playable).
 */
function isEmbedUrl(url: string): boolean {
  const embedPatterns = [
    "ok.ru/videoembed",
    "streamlare.com/e/",
    "mp4upload.com/embed",
    "doodstream.com/e/",
    "mixdrop.co/e/",
    "streamtape.com/e/",
    "vizcloud",
    "vixcloud",
    "megacloud.tv/embed",
    "/embed-",
  ];
  return embedPatterns.some((p) => url.includes(p));
}

/**
 * Fetch the internal /apivtwo/clock.json endpoint to get a playable URL.
 * This is used by Default/Sak/Wixmp/Luf-Mp4 source types.
 */
async function fetchClockJson(clockUrl: string): Promise<{
  url: string;
  type: "hls" | "mp4";
  quality: string | null;
  headers?: Record<string, string>;
} | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(clockUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: REFERER,
        Origin: ORIGIN,
      },
    });

    if (!res.ok) {
      console.warn(`[AllAnime] clock.json HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    // clock.json returns { links: [{ url, quality, ... }] } or { link: "..." }
    const links = json?.links ?? json?.link;
    if (Array.isArray(links) && links.length > 0) {
      const first = links[0];
      if (first?.url || first?.link) {
        const url = first.url || first.link;
        return {
          url,
          type: url.includes(".m3u8") ? "hls" : "mp4",
          quality: first.resolution ?? first.quality ?? null,
        };
      }
    }
    if (typeof links === "string") {
      return {
        url: links,
        type: links.includes(".m3u8") ? "hls" : "mp4",
        quality: null,
      };
    }
    return null;
  } catch (err) {
    console.error("[AllAnime] clock.json fetch failed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Combined helper: get all playable streams for an episode ───

/**
 * Get all playable stream URLs for an episode.
 * This is the main entry point — combines getEpisodeSources + extractStreamUrl.
 *
 * @param showId AllAnime show ID
 * @param episodeStr Episode string (e.g. "1")
 * @param mode "sub" or "dub"
 * @returns Array of StreamResult objects (playable URLs with headers)
 */
export async function getEpisodeStreams(
  showId: string,
  episodeStr: string,
  mode: "sub" | "dub" = "sub",
): Promise<StreamResult[]> {
  const sources = await getEpisodeSources(showId, episodeStr, mode);
  if (!sources || sources.length === 0) {
    return [];
  }

  // Bug 20 fix: parallelize extraction instead of sequential — much faster
  // when there are 15+ sources. Use Promise.allSettled to handle failures gracefully.
  const settled = await Promise.allSettled(sources.map((s) => extractStreamUrl(s)));
  const results: StreamResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) {
      results.push(r.value);
    }
  }

  return results;
}

// ─── Helpers (unchanged) ───

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

// ─── Legacy: CF cookie test (deprecated — no longer needed) ───
// Kept for backward compatibility with /api/cf/* routes.
export async function testStoredCookie(): Promise<{
  status: number;
  ok: boolean;
  bodySnippet: string;
  hasCookie: boolean;
  diagnostics?: Record<string, unknown>;
}> {
  return {
    status: 200,
    ok: true,
    bodySnippet:
      "CF cookie no longer needed — using persisted GraphQL query approach.",
    hasCookie: false,
    diagnostics: {
      note: "Deprecated. The new streaming engine uses persisted GraphQL queries that bypass Cloudflare entirely.",
    },
  };
}

export async function fetchAllAnimeStreamSources(
  _allAnimeId: string,
  _episode: string,
  _type: "sub" | "dub" = "sub",
): Promise<{ url: string; quality: string | null }[] | null> {
  // Deprecated — use getEpisodeStreams() instead.
  // This stub exists for backward compatibility with old stream proxy code.
  return null;
}

// Suppress unused import warnings (the types are used via type inference)
export type { CipherCCMTypes, CipherGCMTypes };
