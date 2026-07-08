"use client";

// components/schedule/ScheduleView.tsx
// ✅ Groups airing episodes by anime within each day — multi-episode series
//    collapse into one expandable card instead of N duplicate cards.

import { useState, useMemo } from "react";
import { CalendarDays, Clock, ChevronDown, Film } from "lucide-react";
import type { AiringSchedule } from "@/types/anime";
import { ScheduleCard } from "./ScheduleCard";

interface ScheduleViewProps {
  byDay: Record<number, AiringSchedule[]>;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

interface SeriesGroup {
  animeId: number;
  title: string;
  coverImage: string;
  accentColor: string;
  episodes: AiringSchedule[];
}

function groupByAnime(items: AiringSchedule[]): SeriesGroup[] {
  const map = new Map<number, SeriesGroup>();
  for (const s of items) {
    if (!s.media) continue;
    const id = s.media.id;
    const existing = map.get(id);
    if (existing) {
      existing.episodes.push(s);
    } else {
      map.set(id, {
        animeId: id,
        title:
          s.media.title.english ??
          s.media.title.romaji ??
          s.media.title.native ??
          "Untitled",
        coverImage: s.media.coverImage?.large ?? "/placeholder-card.png",
        accentColor: s.media.coverImage?.color ?? "#e94560",
        episodes: [s],
      });
    }
  }
  // Sort groups by earliest airing time, then sort episodes within each group
  const groups = Array.from(map.values());
  groups.sort((a, b) => a.episodes[0].airingAt - b.episodes[0].airingAt);
  for (const g of groups) g.episodes.sort((a, b) => a.airingAt - b.airingAt);
  return groups;
}

export function ScheduleView({ byDay }: ScheduleViewProps) {
  const today = new Date().getDay();
  const [activeDay, setActiveDay] = useState<number>(today);

  // Track which series are expanded (by animeId). Multi-episode series start
  // collapsed; single-episode series always show their one card.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const entries = byDay[activeDay] ?? [];
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];

  const groups = useMemo(() => groupByAnime(entries), [entries]);

  const toggle = (animeId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(animeId)) next.delete(animeId);
      else next.add(animeId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {dayOrder.map((dayIdx) => {
          const isToday = dayIdx === today;
          const isActive = dayIdx === activeDay;
          const count = (byDay[dayIdx] ?? []).length;
          return (
            <button
              key={dayIdx}
              onClick={() => setActiveDay(dayIdx)}
              className={`relative px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border ${
                isActive
                  ? "bg-gradient-to-r from-xan-crimson to-xan-violet text-white border-transparent shadow-[0_0_20px_rgba(233,69,96,0.3)]"
                  : "bg-xan-card text-muted-foreground hover:text-foreground hover:bg-xan-card-hover border-xan-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{DAY_LABELS[dayIdx]}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? "bg-white/20 text-white" : "bg-white/5 text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
                {isToday && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-xan-crimson/20 text-xan-crimson border border-xan-crimson/40"
                    }`}
                  >
                    TODAY
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day header */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl md:text-2xl font-bold font-display text-foreground flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-xan-crimson" />
          {DAY_FULL[activeDay]}
          {activeDay === today && (
            <span className="text-xs font-normal text-muted-foreground ml-2">
              (today)
            </span>
          )}
        </h2>
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {entries.length} airing{entries.length !== 1 ? "s" : ""} · {groups.length} anime
        </span>
      </div>

      {/* List — grouped by anime */}
      {groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map((group) => {
            const isExpanded = expanded.has(group.animeId);
            const hasMultiple = group.episodes.length > 1;
            const first = group.episodes[0];

            // Single-episode series — render the plain ScheduleCard directly
            if (!hasMultiple) {
              return (
                <ScheduleCard key={`single-${group.animeId}`} schedule={first} />
              );
            }

            // Multi-episode series — render a collapsible group card
            return (
              <div
                key={`group-${group.animeId}`}
                className="rounded-lg border border-xan-border bg-xan-card/50 overflow-hidden"
              >
                {/* Header row — click to expand/collapse */}
                <button
                  onClick={() => toggle(group.animeId)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-xan-card transition-colors text-left"
                >
                  <div
                    className="relative flex-shrink-0 w-12 h-16 rounded overflow-hidden bg-zinc-900"
                    style={{ borderLeft: `2px solid ${group.accentColor}` }}
                  >
                    <img
                      src={group.coverImage}
                      alt={group.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-sm font-medium text-foreground truncate">
                      {group.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 bg-xan-crimson/15 text-xan-crimson border border-xan-crimson/30 px-1.5 py-0.5 rounded-full font-medium">
                        <Film className="h-3 w-3" />
                        {group.episodes.length} episodes
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Next: EP {first.episode} at{" "}
                        {new Date(first.airingAt * 1000).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Expanded episode list */}
                {isExpanded && (
                  <div className="border-t border-xan-border divide-y divide-xan-border/60">
                    {group.episodes.map((s) => (
                      <ScheduleCard key={`${s.id}-${s.episode}`} schedule={s} embedded />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-xan-border bg-xan-card/50 py-16 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">No airings scheduled</p>
          <p className="text-sm text-muted-foreground mt-1">
            Nothing airing on {DAY_FULL[activeDay]} this week.
          </p>
        </div>
      )}
    </div>
  );
}
