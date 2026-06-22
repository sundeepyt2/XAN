// app/api/cf/status/route.ts
// Returns whether a cf_clearance cookie is stored and valid.

import { NextResponse } from "next/server";
import { isCookieValid } from "@/lib/cf-cookie-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await isCookieValid();
  return NextResponse.json(status);
}
