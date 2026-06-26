export const runtime = "edge";

// app/api/cf/test/route.ts
// Tests whether the stored cf_clearance cookie works against AllAnime.

import { NextResponse } from "next/server";
import { testStoredCookie } from "@/lib/allanime";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST() {
  const result = await testStoredCookie();
  return NextResponse.json(result);
}
