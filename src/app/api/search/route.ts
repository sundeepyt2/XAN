// app/api/search/route.ts
import { NextResponse } from "next/server";
import { fetchSearch } from "@/lib/anilist";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const page = Math.max(Number(searchParams.get("page") || "1"), 1);
  const perPage = Math.min(Number(searchParams.get("perPage") || "20"), 50);
  const sort = searchParams.get("sort") || undefined;
  const genres = searchParams.get("genres")?.split(",").filter(Boolean);

  try {
    const result = await fetchSearch(q, page, perPage, genres, sort);
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
    console.error("[API /search]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
