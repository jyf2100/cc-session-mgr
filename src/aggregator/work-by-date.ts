import type { SessionWorkSummary, WorkDailyData, WorkProjectDay } from "../types/index.js";

/**
 * Group work summaries by calendar date, then by project within each date.
 *
 * Produces one WorkDailyData per date that has sessions.
 */
export function aggregateWorkByDate(
  summaries: SessionWorkSummary[],
  dateRange?: { start?: string; end?: string },
): WorkDailyData[] {
  const filtered = filterByDateRange(summaries, dateRange);
  const dateMap = new Map<string, SessionWorkSummary[]>();

  for (const s of filtered) {
    const date = toDateString(s.startTime);
    if (!date) continue;

    if (!dateMap.has(date)) {
      dateMap.set(date, []);
    }
    dateMap.get(date)!.push(s);
  }

  return [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => buildWorkDailyData(date, sessions));
}

function filterByDateRange(
  summaries: SessionWorkSummary[],
  range?: { start?: string; end?: string },
): SessionWorkSummary[] {
  if (!range) return summaries;

  return summaries.filter((s) => {
    if (!s.startTime) return false;
    const date = toDateString(s.startTime)!;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  });
}

function buildWorkDailyData(
  date: string,
  sessions: SessionWorkSummary[],
): WorkDailyData {
  const projectMap = new Map<string, SessionWorkSummary[]>();

  for (const s of sessions) {
    const name = s.projectPath || s.encodedDir;
    if (!projectMap.has(name)) {
      projectMap.set(name, []);
    }
    projectMap.get(name)!.push(s);
  }

  const projects: WorkProjectDay[] = [...projectMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([projectName, projSessions]) => ({
      projectName,
      sessions: projSessions,
    }));

  return {
    date,
    projects,
    sessionCount: sessions.length,
  };
}

function toDateString(ts: string | null): string | null {
  if (!ts) return null;
  return ts.slice(0, 10);
}
