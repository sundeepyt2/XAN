"use client";

// components/cards/BookmarkButton.tsx
// ✅ Heart-style toggle button for "save for later" bookmarks
// ✅ Two sizes: default (for AnimeHero) and sm (for AnimeCard hover overlay)

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useBookmarks } from "@/hooks/useBookmarks";
import { cn } from "@/lib/utils";

interface BookmarkButtonProps {
  animeId: number;
  title: string;
  coverImage: string;
  size?: "default" | "sm";
  className?: string;
}

export function BookmarkButton({
  animeId,
  title,
  coverImage,
  size = "default",
  className,
}: BookmarkButtonProps) {
  const { isBookmarked, toggleBookmark, isLoaded } = useBookmarks();

  // Avoid hydration mismatch — render nothing until client loads
  if (!isLoaded) {
    return (
      <div
        className={cn(
          size === "sm" ? "w-7 h-7" : "w-9 h-9",
          "rounded-full bg-black/70 backdrop-blur-sm",
          className,
        )}
        aria-hidden
      />
    );
  }

  const active = isBookmarked(animeId);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleBookmark({ animeId, title, coverImage });
      }}
      className={cn(
        "flex items-center justify-center rounded-full border backdrop-blur-sm transition-all",
        size === "sm" ? "w-7 h-7" : "w-9 h-9",
        active
          ? "bg-xan-crimson/90 border-xan-crimson text-white shadow-[0_0_12px_rgba(233,69,96,0.4)]"
          : "bg-black/70 border-white/15 text-white hover:bg-black/90 hover:border-white/30",
        className,
      )}
      aria-label={active ? "Remove bookmark" : "Add bookmark"}
      aria-pressed={active}
      title={active ? "In bookmarks — click to remove" : "Add to bookmarks"}
    >
      {active ? (
        <BookmarkCheck className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : (
        <Bookmark className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      )}
    </button>
  );
}
