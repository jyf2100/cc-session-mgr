import type { SessionSummary, WeekGroup, DateGroup } from "../types/index.js";
import { aggregateByDate } from "./by-date.js";

/**
 * Group sessions by ISO week (Monday–Sunday) and compute per-week statistics.
 */
export function aggregateByWeek(
  summaries: SessionSummary[],
  weekRange?: { year: number; week: number },
): WeekGroup[] {
  // Get daily groups first, then bucket into weeks
  const dailyGroups = aggregateByDate(summaries);
  const weekMap = new Map<string, DateGroup[]>();

  for (const day of dailyGroups) {
    const { year, week } = getISOWeek(day.date);
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
    .map(([weekLabel, days]) => buildWeekGroup(weekLabel, days));
}

function buildWeekGroup(weekLabel: string, days: DateGroup[]): WeekGroup {
  const startDate = days.length > 0 ? days[0].date : weekLabel;
  const endDate = days.length > 0 ? days[days.length - 1].date : weekLabel;

  const totalSessions = days.reduce((sum, d) => sum + d.sessions.length, 0);
  const totalMessages = days.reduce((sum, d) => sum + d.totalMessages, 0);
  const totalCost = days.reduce((sum, d) => sum + d.totalCost, 0);

  const models: Record<string, number> = {};
  for (const d of days) {
    for (const [model, count] of Object.entries(d.models)) {
      models[model] = (models[model] ?? 0) + count;
    }
  }

  return {
    weekLabel,
    startDate,
    endDate,
    days,
    totalSessions,
    totalMessages,
    totalCost: Math.round(totalCost * 100) / 100,
    models,
  };
}

/**
 * Get ISO week number and year for a date string (YYYY-MM-DD).
 * Uses the standard nearest-Thursday algorithm.
 */
function getISOWeek(dateStr: string): { year: number; week: number } {
  const d = new Date(dateStr + "T00:00:00Z");
  // ISO day of week: Mon=1, Tue=2, ..., Sun=7
  const dayNum = d.getUTCDay() || 7;
  // Set to nearest Thursday (the ISO year's defining day)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: d.getUTCFullYear(), week };
}
