import type { WorkDailyData, WorkWeeklyData, WorkWeeklyReportData, WorkProjectWeek } from "../types/index.js";
import { getISOWeekForDate } from "../cli/tz-utils.js";

/**
 * Group daily work data by ISO week (Monday–Sunday).
 *
 * Produces one WorkWeeklyData per ISO week that has daily data.
 */
export function aggregateWorkByWeek(
  dailyData: WorkDailyData[],
  weekRange?: { year: number; week: number },
): WorkWeeklyData[] {
  const weekMap = new Map<string, WorkDailyData[]>();

  for (const day of dailyData) {
    const { year, week } = getISOWeekForDate(day.date);
    const key = `${year}-W${String(week).padStart(2, "0")}`;

    if (weekRange && (year !== weekRange.year || week !== weekRange.week)) {
      continue;
    }

    if (!weekMap.has(key)) {
      weekMap.set(key, []);
    }
    weekMap.get(key)!.push(day);
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekLabel, days]) => buildWorkWeeklyData(weekLabel, days));
}

function buildWorkWeeklyData(
  weekLabel: string,
  days: WorkDailyData[],
): WorkWeeklyData {
  const startDate = days.length > 0 ? days[0].date : weekLabel;
  const endDate = days.length > 0 ? days[days.length - 1].date : weekLabel;

  // Deduplicate: a session may appear on multiple days (cross-midnight sessions).
  const uniqueIds = new Set<string>();
  for (const day of days) {
    for (const project of day.projects) {
      for (const session of project.sessions) {
        uniqueIds.add(session.sessionId);
      }
    }
  }

  return {
    weekLabel,
    startDate,
    endDate,
    days,
    totalSessions: uniqueIds.size,
  };
}

// ---------------------------------------------------------------------------
// Project-centric aggregation (for weekly report)
// ---------------------------------------------------------------------------

/**
 * Transform a day-by-day weekly view into a project-centric view.
 *
 * Flattens `days[].projects[].sessions[]` into `projects[].sessions[]`
 * where each project contains all its sessions across the whole week.
 * Projects are sorted by session count descending (most active first).
 */
export function aggregateWorkByProject(
  weekly: WorkWeeklyData,
): WorkWeeklyReportData {
  const projectMap = new Map<string, WorkProjectWeek>();

  for (const day of weekly.days) {
    for (const project of day.projects) {
      let existing = projectMap.get(project.projectName);
      if (!existing) {
        existing = {
          projectName: project.projectName,
          sessions: [],
          projectSummary: null,
          sessionDates: new Map(),
        };
        projectMap.set(project.projectName, existing);
      }

      for (const session of project.sessions) {
        // Track which dates this session is active on
        const dates = existing.sessionDates.get(session.sessionId) ?? [];
        if (!dates.includes(day.date)) {
          dates.push(day.date);
        }
        existing.sessionDates.set(session.sessionId, dates);

        // Deduplicate by sessionId — same session can appear in multiple days
        if (!existing.sessions.some((s) => s.sessionId === session.sessionId)) {
          existing.sessions.push(session);
        }
      }
    }
  }

  // Sort by session count descending (most active first)
  const projects = [...projectMap.values()].sort(
    (a, b) => b.sessions.length - a.sessions.length,
  );

  return {
    weekLabel: weekly.weekLabel,
    startDate: weekly.startDate,
    endDate: weekly.endDate,
    projects,
    totalSessions: weekly.totalSessions,
  };
}
