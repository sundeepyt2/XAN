// components/anime/CharacterList.tsx
// Server Component

import Image from "next/image";
import type { CharacterEdge } from "@/types/anime";

interface CharacterListProps {
  characters: CharacterEdge[];
}

export function CharacterList({ characters }: CharacterListProps) {
  if (characters.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold font-display text-foreground">
        Characters
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {characters.map((edge) => {
          const name = edge.node.name.full ?? "Unknown";
          const image = edge.node.image?.medium || "/placeholder-card.png";
          const role = edge.role ?? "—";
          return (
            <div
              key={edge.node.id}
              className="flex items-center gap-3 p-2 rounded-lg bg-xan-card border border-xan-border hover:border-xan-crimson/30 transition-colors"
            >
              <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-xan-card-hover">
                <Image
                  src={image}
                  alt={name}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground line-clamp-1">
                  {name}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {role}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
