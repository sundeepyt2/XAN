// app/(app)/schedule/page.tsx
// ✅ Anime Schedule / Airing Calendar — server component

import { fetchAiringSchedule, type AiringScheduleEntry } from "@/lib/anilist";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { ErrorCard } from "@/components/ErrorCard";
import { Calendar } from "lucide-react";

export const revalidate = 1800; // 30 min ISR

// Get current week boundaries (Mon 00:00 → Sun 23:59 UTC)
function getWeekBoundaries(): { start: number; end: number } {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  return {
    start: Math.floor(monday.getTime() / 1000),
    end: Math.floor(sunday.getTime() / 1000),
  };
}

export default async function SchedulePage() {
  const { start, end } = getWeekBoundaries();

  // Fetch all airing schedules for the week (paginate if needed)
  let allEntries: AiringScheduleEntry[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext && page <= 3) {
    const result = await fetchAiringSchedule(start, end, page, 50);
    if (!result) break;
    allEntries = [...allEntries, ...result.data];
    hasNext = result.hasNextPage;
    page++;
  }

  // Deduplicate by schedule ID (AniList can return duplicates across pages)
  const seen = new Set<number>();
  const deduped = allEntries.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Week label
  const weekStart = new Date(start * 1000).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const weekEnd = new Date(end * 1000).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-6 w-6 text-xan-crimson" />
          Airing Schedule
        </h1>
        <p className="text-sm text-muted-foreground">
          {deduped.length} episodes airing this week ({weekStart} – {weekEnd})
        </p>
      </div>

      {/* Schedule */}
      {deduped.length === 0 ? (
        <ErrorCard message="No airing anime found for this week" />
      ) : (
        <ScheduleView schedule={deduped} />
      )}
    </div>
  );
}
