import type { WorkDailyData, WorkWeeklyData } from "../types/index.js";

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
    .map(([weekLabel, days]) => buildWorkWeeklyData(weekLabel, days));
}

function buildWorkWeeklyData(
  weekLabel: string,
  days: WorkDailyData[],
): WorkWeeklyData {
  const startDate = days.length > 0 ? days[0].date : weekLabel;
  const endDate = days.length > 0 ? days[days.length - 1].date : weekLabel;
  const totalSessions = days.reduce((sum, d) => sum + d.sessionCount, 0);

  return {
    weekLabel,
    startDate,
    endDate,
    days,
    totalSessions,
  };
}

/**
 * Get ISO week number and year for a date string (YYYY-MM-DD).
 * Uses the standard nearest-Thursday algorithm.
 */
function getISOWeek(dateStr: string): { year: number; week: number } {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: d.getUTCFullYear(), week };
}
