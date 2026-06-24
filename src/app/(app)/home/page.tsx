// app/(app)/home/page.tsx
// Server Component (async) — fetches AniList, wraps sections in Suspense + ErrorBoundary

import { Suspense } from "react";
import { fetchTrending, fetchPopular } from "@/lib/anilist";
import { TrendingCarousel } from "@/components/home/TrendingCarousel";
import { PopularGrid } from "@/components/home/PopularGrid";
import { ContinueWatching } from "@/components/home/ContinueWatching";
import { CategoryTabs } from "@/components/home/CategoryTabs";
import { RecommendationsRow } from "@/components/home/RecommendationsRow";
import { AnimeCardSkeleton } from "@/components/cards/AnimeCardSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const revalidate = 300; // ISR — refresh every 5 minutes

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-12">
      {/* Continue Watching (client — localStorage) */}
      <ContinueWatching />

      {/* Recommended For You (client — analyzes watch history) */}
      <RecommendationsRow />

      {/* Trending */}
      <ErrorBoundary message="Couldn't load trending">
        <Suspense
          fallback={
            <section className="space-y-4">
              <div className="h-8 w-40 bg-xan-card rounded animate-shimmer" />
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-[150px] sm:w-[160px] md:w-[180px]"
                  >
                    <AnimeCardSkeleton />
                  </div>
                ))}
              </div>
            </section>
          }
        >
          <TrendingSection />
        </Suspense>
      </ErrorBoundary>

      {/* Popular */}
      <ErrorBoundary message="Couldn't load popular">
        <Suspense
          fallback={
            <section className="space-y-4">
              <div className="h-8 w-40 bg-xan-card rounded animate-shimmer" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 15 }, (_, i) => (
                  <AnimeCardSkeleton key={i} />
                ))}
              </div>
            </section>
          }
        >
          <PopularSection />
        </Suspense>
      </ErrorBoundary>

      {/* By Genre (client) */}
      <CategoryTabs />
    </div>
  );
}

// ─── Async Server Components — can use await directly ───
async function TrendingSection() {
  const result = await fetchTrending(1, 15);
  if (!result || result.data.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        No trending anime found.
      </p>
    );
  return <TrendingCarousel anime={result.data} />;
}

async function PopularSection() {
  const result = await fetchPopular(1, 15);
  if (!result || result.data.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        No popular anime found.
      </p>
    );
  return <PopularGrid anime={result.data} pageInfo={result.pageInfo} />;
}
