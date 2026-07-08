"use client";

// components/home/BookmarksRow.tsx
// ✅ Horizontal scroller of bookmarked anime — appears on home page.
// ✅ Side scroll buttons on all screen sizes.

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, ChevronRight, ChevronLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookmarks } from "@/hooks/useBookmarks";

export function BookmarksRow() {
  const { bookmarks, isLoaded } = useBookmarks();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.8, 900);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (!isLoaded || bookmarks.length === 0) return null;

  const recent = bookmarks.slice(0, 12);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-xan-card border border-xan-border flex items-center justify-center">
            <Bookmark className="h-4 w-4 text-xan-crimson fill-xan-crimson" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold font-display text-foreground">
              My Bookmarks
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Saved for later
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("left")}
            aria-label="Scroll left"
            className="rounded-full glass border-xan-border hover:bg-white/10 h-8 w-8 md:h-9 md:w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => scrollBy("right")}
            aria-label="Scroll right"
            className="rounded-full glass border-xan-border hover:bg-white/10 h-8 w-8 md:h-9 md:w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2 mask-fade-r"
      >
        {recent.map((entry) => (
          <Link
            key={entry.animeId}
            href={`/anime/${entry.animeId}`}
            className="group flex-shrink-0 w-[140px] sm:w-[150px] snap-start"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-xan-card border border-xan-border hover:border-xan-crimson/40 transition-colors">
              <Image
                src={entry.coverImage || "/placeholder-card.png"}
                alt={entry.title}
                fill
                sizes="(max-width: 640px) 140px, 150px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />
              {/* Hover play button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-9 h-9 rounded-full bg-xan-crimson/95 flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
                  <Play className="h-4 w-4 text-white fill-white ml-0.5" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <p className="text-[11px] font-medium text-white line-clamp-1 leading-tight">
                  {entry.title}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
