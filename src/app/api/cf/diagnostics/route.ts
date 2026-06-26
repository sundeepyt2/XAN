export const runtime = "edge";

// app/api/cf/diagnostics/route.ts
// Returns full diagnostic info about the stored cookie + server environment.

import { NextResponse } from "next/server";
import { getStoredCookie, getServerIp } from "@/lib/cf-cookie-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const stored = await getStoredCookie();
  const serverIp = await getServerIp();

  return NextResponse.json({
    hasCookie: !!stored,
    cookie: stored
      ? {
          savedAt: new Date(stored.savedAt).toISOString(),
          ageMinutes: Math.round((Date.now() - stored.savedAt) / 60000),
          savedFromIp: stored.savedFromIp,
          serverIp,
          ipMismatch:
            stored.savedFromIp != null &&
            serverIp != null &&
            stored.savedFromIp !== serverIp,
          userAgent: stored.userAgent,
          cookieLength: stored.value.length,
          hasCfClearance: stored.value.includes("cf_clearance="),
          cookiePreview: stored.value.substring(0, 40) + "...",
        }
      : null,
    explanation:
      stored?.savedFromIp != null &&
      serverIp != null &&
      stored.savedFromIp !== serverIp
        ? "IP MISMATCH: Your browser's IP and the server's IP are different. Cloudflare's cf_clearance cookie is IP-bound, so the server cannot use your browser's cookie. Use the client-side fetch option instead (your browser fetches directly from AllAnime)."
        : "IPs match or are unknown. If the test still fails, check: (1) User-Agent matches exactly, (2) Cookie hasn't expired (CF cookies expire in 30-60 min), (3) You copied the full cookie value.",
  });
}
