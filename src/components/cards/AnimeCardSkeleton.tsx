// components/cards/AnimeCardSkeleton.tsx
// Server Component — CSS only shimmer

export function AnimeCardSkeleton() {
  return (
    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-xan-card border border-xan-border animate-shimmer">
      <div className="absolute top-2 left-2 w-12 h-5 bg-white/5 rounded-full" />
      <div className="absolute bottom-3 left-3 right-3 space-y-2">
        <div className="h-3 w-3/4 bg-white/5 rounded" />
        <div className="h-2.5 w-1/2 bg-white/5 rounded" />
      </div>
    </div>
  );
}
