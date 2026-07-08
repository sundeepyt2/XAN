"use client";

// components/anime/AnimeStatusButton.tsx
// ✅ Dropdown to mark an anime as Watching / Completed / Planning / Dropped / On Hold
// ✅ Reads + writes via useAnimeList hook (localStorage)

import { useState, useRef, useEffect } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  Eye,
  CheckCircle2,
  CalendarClock,
  XCircle,
  PauseCircle,
  Trash2,
} from "lucide-react";
import { useAnimeList, STATUS_LABELS, type AnimeStatus } from "@/hooks/useAnimeList";

interface AnimeStatusButtonProps {
  animeId: number;
  title: string;
  coverImage: string;
  episodes: number | null;
  airingStatus?: string | null;
}

const STATUS_ICONS: Record<AnimeStatus, typeof Eye> = {
  WATCHING: Eye,
  COMPLETED: CheckCircle2,
  PLANNING: CalendarClock,
  DROPPED: XCircle,
  ON_HOLD: PauseCircle,
};

const STATUS_COLORS: Record<AnimeStatus | "none", string> = {
  none: "border-xan-border text-muted-foreground hover:text-foreground hover:bg-xan-card-hover",
  WATCHING: "border-xan-crimson/40 text-xan-crimson bg-xan-crimson/10",
  COMPLETED: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
  PLANNING: "border-xan-violet/40 text-xan-violet bg-xan-violet/10",
  DROPPED: "border-zinc-500/40 text-zinc-400 bg-zinc-500/10",
  ON_HOLD: "border-amber-500/40 text-amber-400 bg-amber-500/10",
};

export function AnimeStatusButton({
  animeId,
  title,
  coverImage,
  episodes,
  airingStatus,
}: AnimeStatusButtonProps) {
  const { getEntry, setStatus, removeEntry, updateProgress } = useAnimeList();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const entry = getEntry(animeId);
  const currentStatus = entry?.status;
  const progress = entry?.progress ?? 0;
  const totalEps = episodes ?? 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (status: AnimeStatus) => {
    setStatus(animeId, status, { title, coverImage, episodes, airingStatus });
    setOpen(false);
  };

  const handleRemove = () => {
    removeEntry(animeId);
    setOpen(false);
  };

  const handleIncrementProgress = () => {
    if (progress < totalEps) {
      updateProgress(animeId, progress + 1);
    }
  };

  const handleDecrementProgress = () => {
    if (progress > 0) {
      updateProgress(animeId, progress - 1);
    }
  };

  const statuses: AnimeStatus[] = ["WATCHING", "COMPLETED", "PLANNING", "ON_HOLD", "DROPPED"];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium border bg-xan-card transition-colors ${STATUS_COLORS[currentStatus ?? "none"]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {currentStatus ? (
          <>
            {(() => {
              const Icon = STATUS_ICONS[currentStatus];
              return <Icon className="h-4 w-4" />;
            })()}
            {STATUS_LABELS[currentStatus]}
            {(currentStatus === "WATCHING" || currentStatus === "ON_HOLD") && totalEps > 0 && (
              <span className="text-xs opacity-70 ml-1">
                {progress}/{totalEps}
              </span>
            )}
          </>
        ) : (
          <>
            <Bookmark className="h-4 w-4" />
            Add to List
          </>
        )}
        <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full mt-1 right-0 z-30 w-56 rounded-lg border border-xan-border bg-popover shadow-xl py-1 animate-panel-up"
        >
          {statuses.map((status) => {
            const Icon = STATUS_ICONS[status];
            const isActive = currentStatus === status;
            return (
              <button
                key={status}
                onClick={() => handleSelect(status)}
                role="option"
                aria-selected={isActive}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-foreground/90 hover:bg-xan-card-hover transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {STATUS_LABELS[status]}
                </span>
                {isActive && <Check className="h-3.5 w-3.5 text-xan-crimson" />}
              </button>
            );
          })}
          {currentStatus && (
            <>
              {/* ✅ Progress controls for WATCHING / ON_HOLD status */}
              {(currentStatus === "WATCHING" || currentStatus === "ON_HOLD") && totalEps > 0 && (
                <>
                  <div className="h-px bg-xan-border my-1" />
                  <div className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">Progress</span>
                      <span className="text-xs font-mono text-foreground">
                        {progress} / {totalEps}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleDecrementProgress}
                        disabled={progress <= 0}
                        className="w-7 h-7 rounded-md border border-xan-border bg-xan-card hover:bg-xan-card-hover disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-sm"
                        aria-label="Decrease progress"
                      >
                        −
                      </button>
                      <div className="flex-1 h-1.5 rounded-full bg-xan-card overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-xan-crimson to-xan-violet transition-all"
                          style={{ width: `${Math.min(100, (progress / totalEps) * 100)}%` }}
                        />
                      </div>
                      <button
                        onClick={handleIncrementProgress}
                        disabled={progress >= totalEps}
                        className="w-7 h-7 rounded-md border border-xan-border bg-xan-card hover:bg-xan-card-hover disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-sm"
                        aria-label="Increase progress"
                      >
                        +
                      </button>
                    </div>
                    {progress >= totalEps && (
                      <button
                        onClick={() => handleSelect("COMPLETED")}
                        className="w-full mt-2 text-xs text-emerald-400 hover:text-emerald-300 flex items-center justify-center gap-1 py-1"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Mark as Completed
                      </button>
                    )}
                  </div>
                </>
              )}
              <div className="h-px bg-xan-border my-1" />
              <button
                onClick={handleRemove}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-xan-crimson hover:bg-xan-card-hover transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Remove from list
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
