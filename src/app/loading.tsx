// app/loading.tsx
// Server Component — simple skeleton (no motion)

import { AnimeCardSkeleton } from "@/components/cards/AnimeCardSkeleton";

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-8">
      <div className="h-8 w-48 bg-xan-card rounded animate-shimmer" />
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
      <div className="h-8 w-40 bg-xan-card rounded animate-shimmer" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 15 }, (_, i) => (
          <AnimeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
