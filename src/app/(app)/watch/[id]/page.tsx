export const runtime = "edge";

// app/(app)/watch/[id]/page.tsx
// ✅ Cloudflare Pages compat: split into Server Component (edge) + Client Component.
// The Server Component reads params + searchParams and passes them as props,
// avoiding useSearchParams in the edge runtime (which Cloudflare doesn't support).

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { WatchPageClient } from "./WatchPageClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ep?: string; type?: string }>;
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { ep, type } = await searchParams;

  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-4">
          <Skeleton className="w-full aspect-video rounded-lg bg-xan-card" />
          <Skeleton className="h-8 w-2/3 bg-xan-card" />
          <Skeleton className="h-4 w-1/2 bg-xan-card" />
        </div>
      }
    >
      <WatchPageClient animeId={id} episodeStr={ep} typeStr={type} />
    </Suspense>
  );
}
