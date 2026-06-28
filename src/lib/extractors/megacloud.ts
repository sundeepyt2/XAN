// lib/extractors/megacloud.ts
const MEGACLOUD_HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Referer: "https://youtu-chan.com",
  Origin: "https://youtu-chan.com",
};

export interface ExtractedSource {
  url: string;
  quality: string | null;
  type: "hls" | "mp4" | "iframe";
}

export async function extractMegacloud(embedUrl: string): Promise<ExtractedSource[]> {
  try {
    const res = await fetch(embedUrl, {
      headers: MEGACLOUD_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const rcKeyMatch = html.match(/MD5\.of\("(.+?)"\)/);
    if (!rcKeyMatch?.[1]) return [];
    const rcKey = rcKeyMatch[1];

    const sourcesMatch =
      html.match(/sources\s*[:=]\s*(\[\s*\{[\s\S]*?\}\s*\])/) ??
      html.match(/window\.\w+\s*=\s*(\[\s*\{[\s\S]*?\}\s*\])/);
    if (!sourcesMatch?.[1]) return [];

    let sourcesRaw: unknown;
    try {
      sourcesRaw = JSON.parse(sourcesMatch[1]);
    } catch {
      const fixed = sourcesMatch[1].replace(
        /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,
        '$1"$2"$3',
      );
      try {
        sourcesRaw = JSON.parse(fixed);
      } catch {
        return [];
      }
    }

    if (!Array.isArray(sourcesRaw)) return [];

    const results: ExtractedSource[] = [];
    for (const entry of sourcesRaw as Array<Record<string, unknown>>) {
      const encFile = entry?.file;
      if (typeof encFile !== "string" || !encFile) continue;

      const decrypted = xorDecrypt(encFile, rcKey);
      if (!decrypted) continue;

      const isHls = decrypted.includes(".m3u8");
      results.push({
        url: decrypted,
        quality: typeof entry.label === "string" ? entry.label : null,
        type: isHls ? "hls" : "mp4",
      });
    }

    return results;
  } catch (err) {
    console.error("[megacloud] extract failed:", err);
    return [];
  }
}

function xorDecrypt(hexPayload: string, key: string): string | null {
  try {
    const isHex = /^[0-9a-fA-F]+$/.test(hexPayload) && hexPayload.length % 2 === 0;
    const bytes = isHex
      ? Buffer.from(hexPayload, "hex")
      : Buffer.from(hexPayload, "utf-8");

    const keyBytes = Buffer.from(key, "utf-8");
    const out = Buffer.allocUnsafe(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return out.toString("utf-8");
  } catch {
    return null;
  }
}
