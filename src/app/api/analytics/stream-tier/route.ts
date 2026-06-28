// app/api/analytics/stream-tier/route.ts
//
// ✅ Server-side mirror of the client-side bandwidth-stats hook.
// ✅ Receives a POST with { provider, sourceName, streamType, tier } and
//    logs it to the server console so it shows up in Vercel function logs.
// ✅ No database — keeps the deployment stateless and free.
//
// Usage in Vercel:
//   - Go to your project → Functions → Logs
//   - Filter for "[stream-tier]" to see real-time tier distribution
//   - Each log line includes provider, source, type, and which tier won
//
// The client also keeps a local copy in localStorage (see useBandwidthStats.ts)
// so the user can see their own stats in the Settings → Bandwidth Analytics panel.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

const VALID_TIERS = ["direct", "manifest-proxy", "full-proxy", "failed"];

interface AnalyticsPayload {
  provider?: unknown;
  sourceName?: unknown;
  streamType?: unknown;
  tier?: unknown;
}

export async function POST(request: Request) {
  let body: AnalyticsPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = typeof body.provider === "string" ? body.provider : "unknown";
  const sourceName = typeof body.sourceName === "string" ? body.sourceName : "unknown";
  const streamType = typeof body.streamType === "string" ? body.streamType : "unknown";
  const tier = typeof body.tier === "string" && VALID_TIERS.includes(body.tier) ? body.tier : "unknown";

  // ✅ Single-line log so it's easy to grep in Vercel logs
  // Example: [stream-tier] provider=allanime source=Yt-mp4 type=mp4 tier=full-proxy
  console.log(
    `[stream-tier] provider=${provider} source=${sourceName} type=${streamType} tier=${tier}`,
  );

  return NextResponse.json({ ok: true }, { status: 202 });
}

// CORS preflight (not strictly needed for same-origin POST, but defensive)
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });
}
