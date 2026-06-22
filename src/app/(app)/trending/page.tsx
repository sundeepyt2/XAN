// app/(app)/trending/page.tsx
// Server Component (async)

import { fetchTrending } from "@/lib/anilist";
import { AnimeCard } from "@/components/cards/AnimeCard";
import { AnimeCardSkeleton } from "@/components/cards/AnimeCardSkeleton";
import { ErrorCard } from "@/components/ErrorCard";
import { Flame } from "lucide-react";

export const revalidate = 300;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function TrendingPage({ searchParams }: PageProps) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
  const perPage = 24;

  let anime: Awaited<ReturnType<typeof fetchTrending>> = null;
  try {
    anime = await fetchTrending(page, perPage);
  } catch (err) {
    console.error("[TrendingPage]", err);
  }

  const data = anime?.data ?? [];
  const pageInfo = anime?.pageInfo;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2">
          <Flame className="h-6 w-6 text-xan-crimson" />
          Trending Anime
        </h1>
        <p className="text-sm text-muted-foreground">
          The hottest anime right now, updated every 5 minutes.
        </p>
      </div>

      {data.length === 0 ? (
        <ErrorCard message="Couldn't load trending anime" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {data.map((item, idx) => (
              <AnimeCard key={item.id} anime={item} index={idx} priority={idx < 6} />
            ))}
          </div>

          {pageInfo && (page > 1 || pageInfo.hasNextPage) && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <a
                href={page > 1 ? `/trending?page=${page - 1}` : "#"}
                aria-disabled={page <= 1}
                className={`inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-xan-border bg-xan-card hover:bg-xan-card-hover ${
                  page <= 1 ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                Previous
              </a>
              <span className="text-sm text-muted-foreground px-3">
                Page {page}
                {pageInfo.lastPage ? ` of ${pageInfo.lastPage}` : ""}
              </span>
              <a
                href={pageInfo.hasNextPage ? `/trending?page=${page + 1}` : "#"}
                aria-disabled={!pageInfo.hasNextPage}
                className={`inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-xan-border bg-xan-card hover:bg-xan-card-hover ${
                  !pageInfo.hasNextPage ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                Next
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
