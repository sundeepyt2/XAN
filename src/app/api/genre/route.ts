// app/api/genre/route.ts
// Server-side proxy to AniList — keeps client-side fetching simple

import { NextResponse } from "next/server";
import { fetchByGenre } from "@/lib/anilist";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const genre = searchParams.get("genre") || "Action";
  const perPage = Math.min(Number(searchParams.get("perPage") || "15"), 50);
  const page = Math.max(Number(searchParams.get("page") || "1"), 1);

  try {
    const result = await fetchByGenre(genre, page, perPage);
    if (!result) {
      return NextResponse.json(
        { error: "Failed to fetch from AniList" },
        { status: 502 },
      );
    }
    return NextResponse.json({
      data: result.data,
      pageInfo: result.pageInfo,
    });
  } catch (err) {
    console.error("[API /genre]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
