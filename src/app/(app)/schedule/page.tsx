// app/(app)/schedule/page.tsx
// ✅ Schedule page — supports prev/next week navigation via ?week=YYYY-MM-DD
// ✅ Buckets airing episodes by LOCAL day (not UTC)
// ✅ Groups by anime within each day (collapse multi-episode series into one card)

import { fetchAiringSchedule } from "@/lib/anilist";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { CalendarDays, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { AiringSchedule } from "@/types/anime";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

/** Returns [mondayEpochSec, nextMondayEpochSec] for the week containing `refDate`. */
function getWeekRange(refDate: Date): [number, number] {
  const day = refDate.getDay(); // 0=Sun .. 6=Sat (local)
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return [Math.floor(monday.getTime() / 1000), Math.floor(nextMonday.getTime() / 1000)];
}

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString(undefined, opts);
  const endStr = end.toLocaleDateString(undefined, opts);
  return `${startStr} – ${endStr}`;
}

function toISODate(d: Date): string {
  // Local YYYY-MM-DD (not UTC) for URL params
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const { week: weekParam } = await searchParams;

  // Parse the week param (YYYY-MM-DD) → use as reference date, else today
  let refDate = new Date();
  if (weekParam) {
    const parsed = new Date(weekParam + "T00:00:00"); // local midnight
    if (!isNaN(parsed.getTime())) refDate = parsed;
  }

  const [start, end] = getWeekRange(refDate);
  const startDate = new Date(start * 1000);
  const endDate = new Date(end * 1000);

  // Compute prev/next week reference dates (center of prev/next week = ±7 days from refDate)
  const prevWeekDate = new Date(refDate);
  prevWeekDate.setDate(refDate.getDate() - 7);
  const nextWeekDate = new Date(refDate);
  nextWeekDate.setDate(refDate.getDate() + 7);

  const now = new Date();
  const isCurrentWeek =
    refDate.toDateString() === now.toDateString() ||
    (now >= startDate && now < endDate);
  const isFutureWeek = startDate > now;

  const [page1, page2] = await Promise.all([
    fetchAiringSchedule(start, end, 1, 50).catch(() => null),
    fetchAiringSchedule(start, end, 2, 50).catch(() => null),
  ]);

  const allSchedules: AiringSchedule[] = [
    ...(page1?.data ?? []),
    ...(page2?.data ?? []),
  ];

  const byDay: Record<number, AiringSchedule[]> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
  };

  for (const s of allSchedules) {
    if (!s.media) continue;
    const dayIdx = new Date(s.airingAt * 1000).getDay(); // local day
    byDay[dayIdx].push(s);
  }

  for (const dayIdx of Object.keys(byDay)) {
    byDay[Number(dayIdx)].sort((a, b) => a.airingAt - b.airingAt);
  }

  const total = allSchedules.length;
  const fetchFailed = !page1 && !page2;
  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone";

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-xan-crimson" />
          Schedule
        </h1>
        <p className="text-sm text-muted-foreground">
          Airing times in {tzLabel}. {total} episode{total !== 1 ? "s" : ""} scheduled{isCurrentWeek ? " this week" : ""}.
        </p>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-xan-border bg-xan-card/50 p-3">
        <Link
          href={`/schedule?week=${toISODate(prevWeekDate)}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium border border-xan-border bg-xan-card hover:bg-xan-card-hover transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Link>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {formatDateRange(startDate, new Date(end * 1000 - 86400000))}
          </p>
          {isCurrentWeek && (
            <p className="text-[10px] text-xan-crimson font-bold uppercase tracking-wider">
              This Week
            </p>
          )}
          {isFutureWeek && !isCurrentWeek && (
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Upcoming
            </p>
          )}
        </div>
        <Link
          href={`/schedule?week=${toISODate(nextWeekDate)}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium border border-xan-border bg-xan-card hover:bg-xan-card-hover transition-colors"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {fetchFailed || total === 0 ? (
        <div className="rounded-xl border border-xan-border bg-xan-card/50 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">
            {fetchFailed ? "Couldn't load schedule" : "No schedule available"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {fetchFailed
              ? "AniList API may be rate-limited or unreachable. Try again in a moment."
              : isFutureWeek
                ? "Nothing airing in this future week — AniList typically publishes schedules 1–2 weeks ahead."
                : "Nothing airing in this week."}
          </p>
        </div>
      ) : (
        <ScheduleView byDay={byDay} />
      )}
    </div>
  );
}
