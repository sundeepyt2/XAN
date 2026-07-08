"use client";

// app/(app)/list/page.tsx
// ✅ Unified "My Library" page — combines Bookmarks + MAL-style status lists
//    (Watching / Completed / Planning / On Hold / Dropped) into one page
//    with tabbed navigation.

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  Library,
  Trash2,
  Eye,
  CheckCircle2,
  CalendarClock,
  XCircle,
  PauseCircle,
  Star,
  Play,
  Bookmark,
  X,
} from "lucide-react";
import {
  useAnimeList,
  STATUS_LABELS,
  type AnimeStatus,
} from "@/hooks/useAnimeList";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type TabId = "BOOKMARKS" | AnimeStatus;

const STATUS_ORDER: AnimeStatus[] = [
  "WATCHING",
  "COMPLETED",
  "PLANNING",
  "ON_HOLD",
  "DROPPED",
];

const STATUS_ICONS: Record<AnimeStatus, typeof Eye> = {
  WATCHING: Eye,
  COMPLETED: CheckCircle2,
  PLANNING: CalendarClock,
  DROPPED: XCircle,
  ON_HOLD: PauseCircle,
};

const STATUS_ACCENT: Record<AnimeStatus, string> = {
  WATCHING: "text-xan-crimson",
  COMPLETED: "text-emerald-400",
  PLANNING: "text-xan-violet",
  DROPPED: "text-zinc-400",
  ON_HOLD: "text-amber-400",
};

const SORT_LABELS: Record<string, string> = {
  POPULARITY_DESC: "Popularity",
  TRENDING_DESC: "Trending",
  SCORE_DESC: "Score",
  START_DATE_DESC: "Newest",
  START_DATE_ASC: "Oldest",
  TITLE_ROMAJI_ASC: "Title (A-Z)",
};

export default function LibraryPage() {
  const {
    list,
    isLoaded: listLoaded,
    removeEntry,
    clearAll: clearList,
    updateScore,
  } = useAnimeList();
  const {
    bookmarks,
    isLoaded: bookmarksLoaded,
    removeBookmark,
    clearBookmarks,
  } = useBookmarks();

  const [activeTab, setActiveTab] = useState<TabId>("BOOKMARKS");

  const isLoaded = listLoaded && bookmarksLoaded;

  const statusCounts = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = list.filter((e) => e.status === status).length;
      return acc;
    },
    {} as Record<AnimeStatus, number>,
  );

  const handleClear = () => {
    if (activeTab === "BOOKMARKS") {
      if (bookmarks.length > 0 && confirm("Clear all bookmarks? This cannot be undone.")) {
        clearBookmarks();
      }
    } else {
      if (list.length > 0 && confirm(`Clear all ${STATUS_LABELS[activeTab]} entries? This cannot be undone.`)) {
        // Remove all entries with the active status
        list
          .filter((e) => e.status === activeTab)
          .forEach((e) => removeEntry(e.animeId));
      }
    }
  };

  const activeCount =
    activeTab === "BOOKMARKS" ? bookmarks.length : statusCounts[activeTab];
  const showClearButton = activeCount > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <Library className="h-6 w-6 text-xan-crimson" />
            My Library
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLoaded
              ? `${bookmarks.length} bookmark${bookmarks.length !== 1 ? "s" : ""} · ${list.length} anime in your list`
              : "Loading your library…"}
          </p>
        </div>
        {showClearButton && (
          <Button
            variant="secondary"
            onClick={handleClear}
            className="bg-xan-card border-xan-border hover:bg-xan-card-hover text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Clear {activeTab === "BOOKMARKS" ? "Bookmarks" : STATUS_LABELS[activeTab]}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {/* Bookmarks tab (first) */}
        <button
          onClick={() => setActiveTab("BOOKMARKS")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-all flex items-center gap-1.5 ${
            activeTab === "BOOKMARKS"
              ? "bg-gradient-to-r from-xan-crimson to-xan-violet text-white border-transparent"
              : "bg-xan-card text-muted-foreground hover:text-foreground border-xan-border"
          }`}
        >
          <Bookmark className="h-3.5 w-3.5" />
          Bookmarks ({bookmarks.length})
        </button>

        {/* Status tabs */}
        {STATUS_ORDER.map((status) => {
          const Icon = STATUS_ICONS[status];
          return (
            <button
              key={status}
              onClick={() => setActiveTab(status)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-all flex items-center gap-1.5 ${
                activeTab === status
                  ? "bg-gradient-to-r from-xan-crimson to-xan-violet text-white border-transparent"
                  : "bg-xan-card text-muted-foreground hover:text-foreground border-xan-border"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {STATUS_LABELS[status]} ({statusCounts[status]})
            </button>
          );
        })}
      </div>

      {/* Content */}
      {!isLoaded ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full bg-xan-card rounded-xl" />
          ))}
        </div>
      ) : activeTab === "BOOKMARKS" ? (
        /* ─── Bookmarks grid ─── */
        bookmarks.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="No bookmarks yet"
            message='Tap the bookmark icon on any anime card or detail page to save it here for quick access later.'
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {bookmarks.map((entry) => (
              <div key={entry.animeId} className="group relative">
                <Link href={`/anime/${entry.animeId}`} className="block">
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-xan-card border border-xan-border transition-all duration-300 group-hover:border-xan-crimson/40 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                    <Image
                      src={entry.coverImage || "/placeholder-card.png"}
                      alt={entry.title}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="font-medium text-sm text-white line-clamp-2 leading-snug">
                        {entry.title}
                      </h3>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-11 h-11 rounded-full bg-xan-crimson/90 flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
                        <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBookmark(entry.animeId)}
                  className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 backdrop-blur-sm hover:bg-xan-crimson text-white border-0"
                  aria-label="Remove bookmark"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ─── Status list ─── */
        (() => {
          const filtered = list.filter((e) => e.status === activeTab);
          if (filtered.length === 0) {
            return (
              <EmptyState
                icon={STATUS_ICONS[activeTab]}
                title={`Nothing in ${STATUS_LABELS[activeTab]}`}
                message={`Open any anime and use the "Add to List" dropdown to mark it as ${STATUS_LABELS[activeTab]}.`}
              />
            );
          }
          return (
            <div className="space-y-3">
              {filtered.map((entry) => {
                const Icon = STATUS_ICONS[entry.status];
                return (
                  <div
                    key={entry.animeId}
                    className="flex items-center gap-3 p-3 rounded-xl border border-xan-border bg-xan-card hover:bg-xan-card-hover hover:border-xan-crimson/30 transition-all"
                  >
                    <Link
                      href={`/anime/${entry.animeId}`}
                      className="relative w-12 h-16 rounded overflow-hidden flex-shrink-0 bg-xan-card-hover"
                    >
                      <Image
                        src={entry.coverImage || "/placeholder-card.png"}
                        alt={entry.title}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </Link>

                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/anime/${entry.animeId}`}
                        className="text-sm md:text-base font-semibold text-foreground line-clamp-1 hover:text-xan-crimson transition-colors"
                      >
                        {entry.title}
                      </Link>
                      <p className="text-xs mt-0.5 flex items-center gap-1.5">
                        <Icon className={`h-3.5 w-3.5 ${STATUS_ACCENT[entry.status]}`} />
                        <span className={STATUS_ACCENT[entry.status]}>
                          {STATUS_LABELS[entry.status]}
                        </span>
                        {entry.progress > 0 && (
                          <span className="text-muted-foreground/70">
                            · {entry.progress} eps
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Score selector */}
                    <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                      <Star className="h-3.5 w-3.5 text-yellow-400" />
                      <select
                        value={entry.score ?? 0}
                        onChange={(e) =>
                          updateScore(
                            entry.animeId,
                            e.target.value === "0" ? null : parseInt(e.target.value, 10),
                          )
                        }
                        className="bg-xan-card border border-xan-border rounded text-xs px-1.5 py-1 text-foreground"
                        title="Your score"
                      >
                        <option value="0">—</option>
                        {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Link href={`/watch/${entry.animeId}?ep=${Math.max(1, entry.progress + 1)}`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-xan-crimson"
                        aria-label="Continue watching"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </Link>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEntry(entry.animeId)}
                      className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-xan-crimson"
                      aria-label="Remove from list"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        })()
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: typeof Bookmark;
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-xan-border bg-xan-card/50 py-16 text-center">
      <Icon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-foreground mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
        {message}
      </p>
      <Button asChild className="bg-gradient-to-r from-xan-crimson to-xan-violet hover:opacity-90 text-white border-0">
        <Link href="/discover">Discover Anime</Link>
      </Button>
    </div>
  );
}
