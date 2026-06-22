// lib/cf-cookie-store.ts
// ✅ Persistent server-side storage for the Cloudflare cf_clearance cookie.
// The user manually solves the CF challenge in their browser, copies the cookie,
// and pastes it into the /settings page. We store it here and use it for all
// subsequent AllAnime API requests.

import { promises as fs } from "fs";
import path from "path";

const COOKIE_FILE = path.join(process.cwd(), ".cf-cookie.json");

export interface StoredCookie {
  value: string;
  savedAt: number; // Date.now()
  expiresAt: number | null; // epoch ms, or null if unknown
  userAgent: string; // UA must match the one used to solve the challenge
}

let cached: StoredCookie | null = null;
let cacheLoadedAt = 0;

async function readFromDisk(): Promise<StoredCookie | null> {
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
  // Reload from disk at most every 5 seconds
  const now = Date.now();
  if (cached && now - cacheLoadedAt < 5000) {
    return cached;
  }
  cached = await readFromDisk();
  cacheLoadedAt = now;
  return cached;
}

export async function saveCookie(
  value: string,
  userAgent: string,
  expiresAt: number | null = null,
): Promise<StoredCookie> {
  const cookie: StoredCookie = {
    value,
    savedAt: Date.now(),
    expiresAt,
    userAgent,
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
