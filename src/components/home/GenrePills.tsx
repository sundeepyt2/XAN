"use client";

// components/home/GenrePills.tsx
// ✅ "use client" — uses router for navigation

import { useRouter } from "next/navigation";
import { GENRES } from "@/lib/constants";
import { Sparkles } from "lucide-react";

/**
 * Quick genre shortcuts — horizontal-scroll pills.
 * Clicking a pill routes to /search?genres=<Genre>.
 */
export function GenrePills() {
  const router = useRouter();

  return (
    <section className="relative">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-xan-crimson/20 to-xan-violet/20 border border-xan-border flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-xan-crimson" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold font-display text-foreground">
              Jump In
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Quick genre shortcuts
            </p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2 mask-fade-r">
          {GENRES.map((g, i) => (
            <button
              key={g}
              onClick={() => router.push(`/search?genres=${encodeURIComponent(g)}`)}
              className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap glass text-foreground/80 hover:text-foreground hover:bg-white/10 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(233,69,96,0.2)]"
              style={{ transitionDuration: "200ms" }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
