// app/api/cf/clear/route.ts
// Clears the stored cf_clearance cookie.

import { NextResponse } from "next/server";
import { clearCookie } from "@/lib/cf-cookie-store";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearCookie();
  return NextResponse.json({ ok: true, message: "Cookie cleared" });
}
