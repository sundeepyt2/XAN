// lib/extractors/megacloud.ts
// ✅ TypeScript port of SNI's MegacloudExtractor.
// Scrapes the Megacloud embed page to find an encrypted source URL,
// then XOR-decrypts it with the rcKey extracted from the page.

const MEGACLOUD_EMBED_REGEX = /src="([^"]*megacloud\.tv[^"]*)"/;
const RCKEY_REGEX = /MD5\.of\("(.+?)"\)/;
const SOURCES_REGEX = /"sources":\s*\[(\{[^}]+\})\]/;
const ENCUR_REGEX = /"file":\s*"(.*?)"/;

export interface ExtractedStream {
  url: string;
  quality: string | null;
  type: "hls" | "mp4";
}

/**
 * Extract a playable stream URL from a Megacloud embed page.
 *
 * @param embedUrl The Megacloud embed URL (e.g. https://megacloud.tv/embed-...)
 * @returns ExtractedStream or null if extraction fails
 */
export async function extractMegacloud(
  embedUrl: string,
): Promise<ExtractedStream | null> {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: "https://youtu-chan.com",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Megacloud] HTTP ${res.status} for ${embedUrl}`);
      return null;
    }

    const html = await res.text();

    // Extract rcKey
    const rcKeyMatch = html.match(RCKEY_REGEX);
    if (!rcKeyMatch?.[1]) {
      console.warn("[Megacloud] rcKey not found in embed page");
      return null;
    }
    const rcKey = rcKeyMatch[1];

    // Extract encrypted file URL
    const encUrlMatch = html.match(ENCUR_REGEX);
    if (!encUrlMatch?.[1]) {
      // Try the sources array format
      const sourcesMatch = html.match(SOURCES_REGEX);
      if (!sourcesMatch?.[1]) {
        console.warn("[Megacloud] No source URL found in embed page");
        return null;
      }
      // Parse the sources JSON
      try {
        const sourceObj = JSON.parse(sourcesMatch[1]);
        if (sourceObj.file) {
          return {
            url: sourceObj.file,
            quality: sourceObj.label ?? null,
            type: sourceObj.file.includes(".m3u8") ? "hls" : "mp4",
          };
        }
      } catch {
        // Fall through to XOR decrypt
      }
    }

    const encUrl = encUrlMatch?.[1];
    if (!encUrl) {
      console.warn("[Megacloud] No encUrl found");
      return null;
    }

    // XOR-decrypt the encUrl with rcKey
    const decrypted = xorDecrypt(encUrl, rcKey);
    if (!decrypted) {
      console.warn("[Megacloud] XOR decryption failed");
      return null;
    }

    return {
      url: decrypted,
      quality: null,
      type: decrypted.includes(".m3u8") ? "hls" : "mp4",
    };
  } catch (err) {
    console.error("[Megacloud] Extraction failed:", err);
    return null;
  }
}

/**
 * XOR-decrypt a string with a key.
 * Each byte of the encrypted string is XOR'd with the corresponding byte of the key (cycling).
 */
function xorDecrypt(encrypted: string, key: string): string | null {
  try {
    // The encrypted string is typically hex-encoded
    let bytes: number[];
    if (/^[0-9a-fA-F]+$/.test(encrypted)) {
      // Hex decode
      bytes = [];
      for (let i = 0; i < encrypted.length; i += 2) {
        bytes.push(parseInt(encrypted.slice(i, i + 2), 16));
      }
    } else {
      // Treat as raw string
      bytes = Array.from(encrypted, (c) => c.charCodeAt(0));
    }

    const keyBytes = Array.from(key, (c) => c.charCodeAt(0));
    const decrypted = bytes.map(
      (b, i) => b ^ keyBytes[i % keyBytes.length],
    );

    return String.fromCharCode(...decrypted);
  } catch {
    return null;
  }
}

/**
 * Check if a URL is a Megacloud embed URL.
 */
export function isMegacloudUrl(url: string): boolean {
  return url.includes("megacloud.tv") || MEGACLOUD_EMBED_REGEX.test(url);
}
