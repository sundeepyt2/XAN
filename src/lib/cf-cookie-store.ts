// lib/cf-cookie-store.ts
// ✅ Persistent server-side storage for Cloudflare cookies.
// Stores the full cookie string (not just cf_clearance) so multiple CF cookies
// can be passed through. Also stores the user-agent and a client-side flag.
//
// ✅ Cloudflare Workers compat: fs/path not available on Workers.
// Since the new streaming pipeline doesn't need the CF cookie, these functions
// return null/empty on Workers. The file-based storage only works in Node.js.

import { promises as fs } from "node:fs";
import path from "node:path";

// ✅ Detect if we're on Cloudflare Workers (no fs support)
const isCloudflareWorker =
  typeof process !== "undefined" && process.env?.CF_PAGES === "1";

const COOKIE_FILE = isCloudflareWorker
  ? "" // No file system on Workers
  : path.join(process.cwd(), ".cf-cookie.json");

export interface StoredCookie {
  // The full cookie header value, e.g. "cf_clearance=abc123; __cf_bm=xyz789"
  value: string;
  savedAt: number; // Date.now()
  expiresAt: number | null; // epoch ms, or null if unknown
  userAgent: string; // UA must match the one used to solve the challenge
  // The IP address of the client that saved the cookie (for diagnostics)
  savedFromIp: string | null;
}

let cached: StoredCookie | null = null;
let cacheLoadedAt = 0;

async function readFromDisk(): Promise<StoredCookie | null> {
  if (isCloudflareWorker || !COOKIE_FILE) return null; // No fs on Workers
  try {
    const raw = await fs.readFile(COOKIE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.value === "string" && parsed.value.length > 0) {
      return parsed as StoredCookie;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeToDisk(cookie: StoredCookie | null): Promise<void> {
  if (isCloudflareWorker || !COOKIE_FILE) return; // No fs on Workers
  try {
    if (cookie) {
      await fs.writeFile(COOKIE_FILE, JSON.stringify(cookie, null, 2), "utf-8");
    } else {
      await fs.unlink(COOKIE_FILE).catch(() => {});
    }
  } catch (err) {
    console.error("[cf-cookie-store] Failed to write cookie file:", err);
  }
}

export async function getStoredCookie(): Promise<StoredCookie | null> {
  const now = Date.now();
  if (cached && now - cacheLoadedAt < 5000) {
    return cached;
  }
  cached = await readFromDisk();
  cacheLoadedAt = now;
  return cached;
}

/**
 * Sanitize the cookie value:
 * - Trim whitespace
 * - Strip surrounding quotes
 * - If the value contains "cf_clearance=", keep it as-is (full cookie string)
 * - If the value is just the raw cookie value (no "="), wrap it as cf_clearance=<value>
 * - Also handles the case where the user pasted "cf_clearance=value" with the name
 */
function sanitizeCookieValue(input: string): string {
  let v = input.trim();
  // Strip surrounding quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  v = v.trim();
  // If it already contains "cf_clearance=", it's a full cookie string — keep as-is
  if (v.includes("cf_clearance=")) {
    return v;
  }
  // Otherwise, wrap it as cf_clearance=<value>
  return `cf_clearance=${v}`;
}

export async function saveCookie(
  value: string,
  userAgent: string,
  savedFromIp: string | null = null,
  expiresAt: number | null = null,
): Promise<StoredCookie> {
  const sanitized = sanitizeCookieValue(value);
  const cookie: StoredCookie = {
    value: sanitized,
    savedAt: Date.now(),
    expiresAt,
    userAgent,
    savedFromIp,
  };
  cached = cookie;
  cacheLoadedAt = Date.now();
  await writeToDisk(cookie);
  return cookie;
}

export async function clearCookie(): Promise<void> {
  cached = null;
  cacheLoadedAt = Date.now();
  await writeToDisk(null);
}

export async function isCookieValid(): Promise<{
  hasCookie: boolean;
  isExpired: boolean;
  ageMinutes: number | null;
}> {
  const cookie = await getStoredCookie();
  if (!cookie) {
    return { hasCookie: false, isExpired: false, ageMinutes: null };
  }
  const now = Date.now();
  const ageMinutes = Math.round((now - cookie.savedAt) / 60000);
  const isExpired = cookie.expiresAt != null ? now > cookie.expiresAt : false;
  return { hasCookie: true, isExpired, ageMinutes };
}

/**
 * Get the server's outbound IP (for diagnostics — shows why CF might reject).
 */
export async function getServerIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    return json?.ip ?? null;
  } catch {
    return null;
  }
}
