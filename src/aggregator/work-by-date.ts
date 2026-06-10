import type { DayIndexedWorkSession, WorkDailyData, WorkProjectDay } from "../types/index.js";

/**
 * Group day-indexed work sessions by calendar date (from day slices),
 * then by project within each date.
 *
 * Produces one WorkDailyData per date that has activity.
 * A session that spans multiple days appears in each date's data.
 */
export function aggregateWorkByDate(
  indexed: DayIndexedWorkSession[],
  dateRange?: { start?: string; end?: string },
): WorkDailyData[] {
  const dateMap = new Map<string, DayIndexedWorkSession[]>();

  for (const item of indexed) {
    // Check if the session falls within the requested date range at all
    if (dateRange) {
      const hasRelevantSlice = item.daySlices.some((slice) => {
        if (dateRange.start && slice.date < dateRange.start) return false;
        if (dateRange.end && slice.date > dateRange.end) return false;
        return true;
      });
      if (!hasRelevantSlice) continue;
    }

    for (const slice of item.daySlices) {
      if (dateRange) {
        if (dateRange.start && slice.date < dateRange.start) continue;
        if (dateRange.end && slice.date > dateRange.end) continue;
      }

      if (!dateMap.has(slice.date)) {
        dateMap.set(slice.date, []);
      }
      dateMap.get(slice.date)!.push(item);
    }
  }

  return [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => buildWorkDailyData(date, items));
}

function buildWorkDailyData(
  date: string,
  items: DayIndexedWorkSession[],
): WorkDailyData {
  const projectMap = new Map<string, DayIndexedWorkSession[]>();

  for (const item of items) {
    const name = item.summary.projectPath || item.summary.encodedDir;
    if (!projectMap.has(name)) {
      projectMap.set(name, []);
    }
    // Deduplicate: same session may appear multiple times if it has
    // multiple slices on the same date (unlikely but defensive).
    const existing = projectMap.get(name)!;
    if (!existing.some((e) => e.summary.sessionId === item.summary.sessionId)) {
      existing.push(item);
    }
  }

  const projects: WorkProjectDay[] = [...projectMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([projectName, projItems]) => ({
      projectName,
      sessions: projItems.map((i) => i.summary),
    }));

  return {
    date,
    projects,
    sessionCount: items.length,
  };
}
