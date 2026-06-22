// lib/backend.ts
// ✅ Backend client — MANDATORY for episode streaming.
// If NEXT_PUBLIC_BACKEND_URL is not set, the watch page will fail with a clear error.

import { z } from "zod";

// ─── Backend stream response schema ───
// Expected contract from the backend:
// GET {NEXT_PUBLIC_BACKEND_URL}/stream/{animeId}/{episode}
// → { stream: { url: string, type: "hls" | "mp4", quality?: string }, sources?: [...] }
export const StreamSourceSchema = z.object({
  url: z.string(),
  type: z.enum(["hls", "mp4", "dash"]).default("mp4"),
  quality: z.string().nullable().default(null),
});

export const StreamResponseSchema = z.object({
  stream: StreamSourceSchema,
  sources: z.array(StreamSourceSchema).default([]),
  duration: z.number().nullable().default(null),
  episodeTitle: z.string().nullable().default(null),
  thumbnail: z.string().nullable().default(null),
});

export type StreamSource = z.infer<typeof StreamSourceSchema>;
export type StreamResponse = z.infer<typeof StreamResponseSchema>;

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const REQUEST_TIMEOUT_MS = 10000;

export interface BackendConfig {
  configured: boolean;
  url: string;
}

export function getBackendConfig(): BackendConfig {
  return {
    configured: Boolean(BACKEND_URL),
    url: BACKEND_URL,
  };
}

/**
 * Fetch a streamable episode URL from the configured backend.
 *
 * Contract:
 *   GET {BACKEND_URL}/stream/{animeId}/{episode}
 *   → 200 StreamResponse
 *
 * Returns null on failure (caller should show fallback UI).
 */
export async function fetchEpisodeStream(
  animeId: number,
  episode: number,
): Promise<StreamResponse | null> {
  if (!BACKEND_URL) {
    console.error("[Backend] NEXT_PUBLIC_BACKEND_URL is not set");
    return null;
  }

  const url = `${BACKEND_URL.replace(/\/$/, "")}/stream/${animeId}/${episode}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 0 }, // streams are not cacheable
    });

    if (!res.ok) {
      console.error(
        `[Backend] HTTP ${res.status} ${res.statusText} for ${url}`,
      );
      return null;
    }

    const json = await res.json();
    const parsed = StreamResponseSchema.safeParse(json);
    if (!parsed.success) {
      console.error(
        "[Backend] Invalid response shape:",
        parsed.error.issues,
      );
      return null;
    }

    return parsed.data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[Backend] Request timed out");
    } else {
      console.error("[Backend] Fetch failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
