// app/api/cf/save/route.ts
// Saves the cf_clearance cookie value provided by the user.
// Also captures the client's IP address for IP-mismatch diagnostics.

import { NextResponse } from "next/server";
import { saveCookie } from "@/lib/cf-cookie-store";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SaveBodySchema = z.object({
  value: z.string().min(10, "Cookie value too short"),
  userAgent: z.string().default(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ),
});

function getClientIp(request: Request): string | null {
  // Check common proxy headers
  const headers = [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "x-client-ip",
    "x-forwarded",
    "forwarded-for",
  ];
  for (const h of headers) {
    const val = request.headers.get(h);
    if (val) {
      // x-forwarded-for can be a comma-separated list; take the first
      return val.split(",")[0].trim();
    }
  }
  return null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SaveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { value, userAgent } = parsed.data;
  const clientIp = getClientIp(request);
  await saveCookie(value, userAgent, clientIp);

  return NextResponse.json({
    ok: true,
    message: "Cookie saved. Use /api/cf/test to verify it works.",
    savedFromIp: clientIp,
  });
}
