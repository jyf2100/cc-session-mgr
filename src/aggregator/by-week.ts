import type { WeekGroup, DateGroup, DayIndexedSession } from "../types/index.js";
import { aggregateByDate } from "./by-date.js";
import { getISOWeekForDate } from "../cli/tz-utils.js";

/**
 * Group sessions by ISO week (Monday–Sunday) and compute per-week statistics.
 *
 * Session counts are deduplicated: a session appearing in multiple days
 * within the same week is counted only once.
 */
export function aggregateByWeek(
  indexed: DayIndexedSession[],
  weekRange?: { year: number; week: number },
): WeekGroup[] {
  // Get daily groups first, then bucket into weeks
  const dailyGroups = aggregateByDate(indexed);
  const weekMap = new Map<string, DateGroup[]>();

  for (const day of dailyGroups) {
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
    .map(([weekLabel, days]) => buildWeekGroup(weekLabel, days));
}

function buildWeekGroup(weekLabel: string, days: DateGroup[]): WeekGroup {
  const startDate = days.length > 0 ? days[0].date : weekLabel;
  const endDate = days.length > 0 ? days[days.length - 1].date : weekLabel;

  // Deduplicate: a session can appear in multiple days within a week
  const uniqueSessionIds = new Set<string>();
  for (const d of days) {
    for (const s of d.sessions) {
      uniqueSessionIds.add(s.sessionId);
    }
  }
  const totalSessions = uniqueSessionIds.size;

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
