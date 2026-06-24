"use client";

// components/schedule/ScheduleView.tsx
// ✅ Client component with day-tab state.

import { useState } from "react";
import { ScheduleCard } from "./ScheduleCard";
import type { Anime } from "@/types/anime";
import { Calendar } from "lucide-react";

export interface ScheduleEntry {
  id: number;
  airingAt: number;
  episode: number;
  media: Anime;
}

interface ScheduleViewProps {
  schedule: ScheduleEntry[];
}

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

export function ScheduleView({ schedule }: ScheduleViewProps) {
  const today = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(today);

  // Group by day of week
  const byDay: Record<number, ScheduleEntry[]> = {};
  for (const entry of schedule) {
    const day = new Date(entry.airingAt * 1000).getDay();
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(entry);
  }

  // Sort each day by time
  for (const day of Object.keys(byDay)) {
    byDay[Number(day)].sort((a, b) => a.airingAt - b.airingAt);
  }

  const todayEntries = byDay[selectedDay] ?? [];

  return (
    <div className="space-y-6">
      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {DAYS.map((day) => {
          const isToday = day.value === today;
          const isSelected = day.value === selectedDay;
          const count = byDay[day.value]?.length ?? 0;
          return (
            <button
              key={day.value}
              onClick={() => setSelectedDay(day.value)}
              className={`flex flex-col items-center px-4 py-2 rounded-xl transition-all border min-w-[64px] ${
                isSelected
                  ? "bg-gradient-to-r from-xan-crimson to-xan-violet text-white border-transparent shadow-lg"
                  : "bg-xan-card text-muted-foreground hover:text-foreground hover:bg-xan-card-hover border-xan-border"
              }`}
            >
              <span className="text-sm font-semibold">{day.label}</span>
              <span
                className={`text-[10px] mt-0.5 ${
                  isSelected ? "text-white/70" : "text-muted-foreground/60"
                }`}
              >
                {count} {count === 1 ? "ep" : "eps"}
              </span>
              {isToday && (
                <span
                  className={`w-1 h-1 rounded-full mt-1 ${
                    isSelected ? "bg-white" : "bg-xan-crimson"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Episodes for selected day */}
      <div className="space-y-3">
        {todayEntries.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-xan-border bg-xan-card/50">
            <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No episodes airing</p>
            <p className="text-sm text-muted-foreground mt-1">
              Check another day — anime schedules vary throughout the week.
            </p>
          </div>
        ) : (
          todayEntries.map((entry) => (
            <ScheduleCard
              key={entry.id}
              anime={entry.media}
              episode={entry.episode}
              airingAt={entry.airingAt}
            />
          ))
        )}
      </div>
    </div>
  );
}
