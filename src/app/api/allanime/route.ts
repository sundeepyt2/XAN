// app/api/allanime/route.ts
// Server-side proxy to AllAnime GraphQL API.
// Used by the anime detail page to cross-reference AniList ↔ AllAnime.

import { NextResponse } from "next/server";
import { searchAllAnime } from "@/lib/allanime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(Number(searchParams.get("limit") || "10"), 25);

  if (!q.trim()) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 },
    );
  }

  const result = await searchAllAnime(q, limit);
  if (!result) {
    return NextResponse.json(
      { error: "Failed to fetch from AllAnime" },
      { status: 502 },
    );
  }
  return NextResponse.json(result);
}
