export const runtime = "edge";

// app/api/cf/client-test/route.ts
// Returns the target URL that the browser should fetch directly to test
// if its own cf_clearance cookie works client-side.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    targetUrl:
      "https://api.allanime.day/episodes?id=PGcK4wGnqDoeihT6n&episode=1&type=sub",
    note: "Fetch this URL directly from your browser using fetch() with credentials: 'include'. Your browser will send its own cf_clearance cookie automatically.",
  });
}
