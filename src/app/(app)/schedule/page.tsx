export const runtime = "edge";

// app/(app)/schedule/page.tsx
import { fetchAiringSchedule } from "@/lib/anilist";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { CalendarDays, AlertCircle } from "lucide-react";
import type { AiringSchedule } from "@/types/anime";

export const dynamic = "force-dynamic";

function getCurrentWeekRange(): [number, number] {
  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
  monday.setUTCHours(0, 0, 0, 0);

  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  return [Math.floor(monday.getTime() / 1000), Math.floor(nextMonday.getTime() / 1000)];
}

export default async function SchedulePage() {
  const [start, end] = getCurrentWeekRange();

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
    const dayIdx = new Date(s.airingAt * 1000).getUTCDay();
    byDay[dayIdx].push(s);
  }

  for (const dayIdx of Object.keys(byDay)) {
    byDay[Number(dayIdx)].sort((a, b) => a.airingAt - b.airingAt);
  }

  const total = allSchedules.length;
  const fetchFailed = !page1 && !page2;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-xan-crimson" />
          Schedule
        </h1>
        <p className="text-sm text-muted-foreground">
          Airing times in your local timezone. {total} episode{total !== 1 ? "s" : ""} scheduled this week.
        </p>
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
              : "Nothing airing this week — check back soon."}
          </p>
        </div>
      ) : (
        <ScheduleView byDay={byDay} />
      )}
    </div>
  );
}
