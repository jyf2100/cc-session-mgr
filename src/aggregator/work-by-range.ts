/**
 * Range-based work aggregation for monthly and quarterly reports.
 *
 * Takes day-indexed work sessions and a date range, groups by project,
 * computes sub-period breakdowns (weekly or monthly), and extracts
 * top edited files per project.
 */

import type {
  DayIndexedWorkSession,
  SessionWorkSummary,
  FileEditEntry,
  WorkProjectRange,
  WorkMonthlyReportData,
  WorkQuarterlyReportData,
  RangeBreakdown,
  RangeBreakdownBucket,
} from "../types/index.js";
import { aggregateWorkByDate } from "./work-by-date.js";
import { getISOWeekForDate } from "../cli/tz-utils.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Aggregate work sessions across a date range into a project-centric view
 * with sub-period breakdowns.
 *
 * Returns `null` when no sessions exist in the range.
 */
export function aggregateWorkByRange(
  indexed: DayIndexedWorkSession[],
  dateRange: { start: string; end: string },
  breakdown: RangeBreakdown,
): WorkProjectRange[] | null {
  // Filter to date range first
  const dailyData = aggregateWorkByDate(indexed, dateRange);
  if (dailyData.length === 0) return null;

  // Flatten all sessions across all days, grouped by project
  const projectMap = new Map<string, SessionWorkSummary[]>();

  for (const day of dailyData) {
    for (const project of day.projects) {
      const existing = projectMap.get(project.projectName);
      if (existing) {
        // Deduplicate by sessionId
        for (const session of project.sessions) {
          if (!existing.some((s) => s.sessionId === session.sessionId)) {
            existing.push(session);
          }
        }
      } else {
        projectMap.set(project.projectName, [...project.sessions]);
      }
    }
  }

  if (projectMap.size === 0) return null;

  // Build per-project range data
  const projects = [...projectMap.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([projectName, sessions]) =>
      buildProjectRange(projectName, sessions, dailyData, breakdown),
    );

  return projects;
}

/**
 * Build a WorkMonthlyReportData from aggregated range data.
 */
export function buildMonthlyReportData(
  year: number,
  month: number,
  projects: WorkProjectRange[] | null,
): WorkMonthlyReportData {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = lastDayOfMonth(year, month);
  const label = `${year}-${String(month).padStart(2, "0")}`;

  const projectList = projects ?? [];
  const totalSessions = projectList.reduce(
    (sum, p) => sum + uniqueSessionCount(p.sessions),
    0,
  );
  const totalCost = projectList.reduce((sum, p) => sum + p.totalCost, 0);

  return {
    year,
    month,
    label,
    startDate,
    endDate,
    projects: projectList,
    totalSessions,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

/**
 * Build a WorkQuarterlyReportData from aggregated range data.
 */
export function buildQuarterlyReportData(
  year: number,
  quarter: number,
  projects: WorkProjectRange[] | null,
): WorkQuarterlyReportData {
  const startMonth = (quarter - 1) * 3 + 1;
  const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endDate = lastDayOfMonth(year, startMonth + 2);
  const label = `${year}-Q${quarter}`;

  const projectList = projects ?? [];
  const totalSessions = projectList.reduce(
    (sum, p) => sum + uniqueSessionCount(p.sessions),
    0,
  );
  const totalCost = projectList.reduce((sum, p) => sum + p.totalCost, 0);

  return {
    year,
    quarter,
    label,
    startDate,
    endDate,
    projects: projectList,
    totalSessions,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildProjectRange(
  projectName: string,
  sessions: SessionWorkSummary[],
  dailyData: { date: string; projects: { projectName: string; sessions: SessionWorkSummary[] }[] }[],
  breakdown: RangeBreakdown,
): WorkProjectRange {
  const breakdownBuckets = computeBreakdown(
    projectName,
    dailyData,
    breakdown,
  );

  const topFiles = extractTopFiles(sessions);
  const totalCost = sessions.reduce((sum, s) => sum + s.cost.totalUSD, 0);
  const totalInput = sessions.reduce((sum, s) => sum + s.cost.inputTokens, 0);
  const totalOutput = sessions.reduce((sum, s) => sum + s.cost.outputTokens, 0);

  return {
    projectName,
    sessions,
    projectSummary: null,
    breakdown: breakdownBuckets,
    topFiles,
    totalCost: Math.round(totalCost * 100) / 100,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
  };
}

/**
 * Compute sub-period breakdown buckets for a project.
 *
 * For weekly breakdown: groups by ISO week within the range.
 * For monthly breakdown: groups by calendar month within the range.
 */
function computeBreakdown(
  projectName: string,
  dailyData: { date: string; projects: { projectName: string; sessions: SessionWorkSummary[] }[] }[],
  breakdown: RangeBreakdown,
): RangeBreakdownBucket[] {
  // Collect dates where this project has sessions
  const activeDates = new Set<string>();
  for (const day of dailyData) {
    const proj = day.projects.find((p) => p.projectName === projectName);
    if (proj && proj.sessions.length > 0) {
      activeDates.add(day.date);
    }
  }

  if (activeDates.size === 0) return [];

  const sortedDates = [...activeDates].sort();

  if (breakdown === "weekly") {
    return computeWeeklyBuckets(sortedDates);
  }
  return computeMonthlyBuckets(sortedDates);
}

function computeWeeklyBuckets(
  dates: string[],
): RangeBreakdownBucket[] {
  const weekMap = new Map<string, string[]>();

  for (const date of dates) {
    const { year, week } = getISOWeekForDate(date);
    const label = `${year}-W${String(week).padStart(2, "0")}`;

    if (!weekMap.has(label)) {
      weekMap.set(label, []);
    }
    weekMap.get(label)!.push(date);
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, bucketDates]) => ({
      label,
      startDate: bucketDates[0],
      endDate: bucketDates[bucketDates.length - 1],
      sessionCount: bucketDates.length,
    }));
}

function computeMonthlyBuckets(
  dates: string[],
): RangeBreakdownBucket[] {
  const monthMap = new Map<string, string[]>();

  for (const date of dates) {
    const label = date.slice(0, 7); // "YYYY-MM"
    if (!monthMap.has(label)) {
      monthMap.set(label, []);
    }
    monthMap.get(label)!.push(date);
  }

  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, bucketDates]) => ({
      label,
      startDate: bucketDates[0],
      endDate: bucketDates[bucketDates.length - 1],
      sessionCount: bucketDates.length,
    }));
}

/**
 * Aggregate file edits across sessions, merge counts for same file,
 * sort by count descending, take top 10.
 */
function extractTopFiles(sessions: SessionWorkSummary[]): FileEditEntry[] {
  const fileMap = new Map<string, number>();

  for (const session of sessions) {
    for (const edit of session.fileEdits) {
      const existing = fileMap.get(edit.filePath) ?? 0;
      fileMap.set(edit.filePath, existing + edit.editCount);
    }
  }

  return [...fileMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([filePath, editCount]) => ({ filePath, editCount }));
}

function lastDayOfMonth(year: number, month: number): string {
  // day 0 of next month = last day of this month
  const d = new Date(year, month, 0);
  return `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function uniqueSessionCount(sessions: SessionWorkSummary[]): number {
  const ids = new Set(sessions.map((s) => s.sessionId));
  return ids.size;
}
