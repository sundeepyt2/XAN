// components/anime/RelatedAnime.tsx
// Server Component

import Link from "next/link";
import Image from "next/image";
import { type RelationEdge, type Recommendation } from "@/types/anime";

interface RelatedAnimeProps {
  relations: RelationEdge[];
  recommendations: Recommendation[];
}

export function RelatedAnime({ relations, recommendations }: RelatedAnimeProps) {
  const validRelations = relations
    .filter((e) => e.relationType && e.relationType !== "CHARACTER")
    .slice(0, 8);

  const validRecs = recommendations
    .map((r) => r.mediaRecommendation)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, 8);

  if (validRelations.length === 0 && validRecs.length === 0) return null;

  return (
    <section className="space-y-6">
      {validRelations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold font-display text-foreground">
            Relations
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {validRelations.map((edge) => {
              const title =
                edge.node.title.english ?? edge.node.title.romaji ?? "Untitled";
              const image = edge.node.coverImage.large || "/placeholder-card.png";
              return (
                <Link
                  key={edge.node.id}
                  href={`/anime/${edge.node.id}`}
                  className="group flex items-center gap-3 p-2 rounded-lg bg-xan-card border border-xan-border hover:border-xan-crimson/40 transition-colors"
                >
                  <div className="relative w-10 h-14 rounded overflow-hidden flex-shrink-0">
                    <Image
                      src={image}
                      alt={title}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
                      {edge.relationType}
                    </p>
                    <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-xan-crimson transition-colors">
                      {title}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {validRecs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold font-display text-foreground">
            Recommendations
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {validRecs.map((rec) => {
              const title =
                rec.title.english ?? rec.title.romaji ?? "Untitled";
              const image = rec.coverImage.large || "/placeholder-card.png";
              return (
                <Link
                  key={rec.id}
                  href={`/anime/${rec.id}`}
                  className="group space-y-2"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-xan-border group-hover:border-xan-crimson/40 transition-colors">
                    <Image
                      src={image}
                      alt={title}
                      fill
                      sizes="(max-width: 768px) 50vw, 200px"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <p className="text-xs font-medium text-foreground line-clamp-1 group-hover:text-xan-crimson transition-colors">
                    {title}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
