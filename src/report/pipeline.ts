/**
 * Shared report pipeline — single entry point for CLI and TUI.
 *
 * Logic copied verbatim from CLI `runWorkDaily` / `runWorkWeekly` to guarantee
 * identical output. Both consumers call these functions instead of
 * re-implementing the aggregation → LLM summarization → markdown pipeline.
 */

import { aggregateWorkByDate } from "../aggregator/work-by-date.js";
import {
  aggregateWorkByWeek,
  aggregateWorkByProject,
} from "../aggregator/work-by-week.js";
import {
  aggregateWorkByRange,
  buildMonthlyReportData,
  buildQuarterlyReportData,
} from "../aggregator/work-by-range.js";
import {
  summarizeSessions,
  summarizeProjectWeekly,
  summarizeProjectMonthly,
  summarizeProjectQuarterly,
} from "../summarize/index.js";
import type { SummarizeOptions } from "../summarize/index.js";
import type { DayIndexedWorkSession, SessionWorkSummary } from "../types/index.js";
import { generateWorkDailyReport } from "./work-daily.js";
import { generateWorkWeeklyReport } from "./work-weekly.js";
import { generateWorkMonthlyReport } from "./work-monthly.js";
import { generateWorkQuarterlyReport } from "./work-quarterly.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  summarizeOptions?: SummarizeOptions | null;
  claudeDir?: string;
  onProgress?: (msg: string) => void;
}

export interface PipelineResult {
  markdown: string;
  /** Sessions used to generate the report, available for CSV/JSON export. */
  sessions?: SessionWorkSummary[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortName(projectPath: string): string {
  const parts = projectPath.split("/");
  return parts[parts.length - 1] || projectPath;
}

async function runSummarize(
  sessions: SessionWorkSummary[],
  options: SummarizeOptions | null | undefined,
  claudeDir: string | undefined,
  onProgress?: (msg: string) => void,
): Promise<void> {
  if (!options || sessions.length === 0) return;

  onProgress?.(
    `Summarizing ${sessions.length} session(s) with ${options.provider} (${options.config.model})...`,
  );
  await summarizeSessions(sessions, options, claudeDir);
}

// ---------------------------------------------------------------------------
// Daily report pipeline
// ---------------------------------------------------------------------------

/**
 * Build a work-daily report markdown string.
 *
 * Pipeline: date-filtered aggregation → LLM summarization → markdown generation.
 * Returns `null` when no sessions exist for the target date.
 */
export async function buildWorkDailyMarkdown(
  indexed: DayIndexedWorkSession[],
  date: string,
  options?: PipelineOptions,
): Promise<PipelineResult | null> {
  // Aggregate FIRST — filter to the target date range before summarizing.
  // This avoids wasting LLM calls on sessions outside the report scope.
  const dailyData = aggregateWorkByDate(indexed, { start: date, end: date });
  const data = dailyData.length > 0
    ? dailyData[0]
    : { date, projects: [], sessionCount: 0 };

  // Only summarize sessions that will actually appear in the report
  const reportSessions = data.projects.flatMap((p) => p.sessions);
  await runSummarize(
    reportSessions,
    options?.summarizeOptions,
    options?.claudeDir,
    options?.onProgress,
  );

  // If no sessions at all, return null (no data for this date)
  if (data.sessionCount === 0 && data.projects.length === 0) {
    return null;
  }

  const markdown = generateWorkDailyReport(data);
  return { markdown, sessions: reportSessions };
}

// ---------------------------------------------------------------------------
// Weekly report pipeline
// ---------------------------------------------------------------------------

/**
 * Build a work-weekly report markdown string.
 *
 * Pipeline: week-filtered aggregation → LLM session summarization →
 * project aggregation → per-project LLM summarization → markdown generation.
 * Returns `null` when no sessions exist for the target week.
 */
export async function buildWorkWeeklyMarkdown(
  indexed: DayIndexedWorkSession[],
  year: number,
  week: number,
  options?: PipelineOptions,
): Promise<PipelineResult | null> {
  // Aggregate FIRST — filter to the target week before summarizing.
  // This avoids wasting LLM calls on sessions outside the report scope.
  const dailyData = aggregateWorkByDate(indexed);
  const weekData = aggregateWorkByWeek(dailyData, { year, week });

  if (weekData.length === 0) {
    return null;
  }

  // Only summarize sessions that will actually appear in the report
  const reportSessions = weekData[0].days.flatMap((d) =>
    d.projects.flatMap((p) => p.sessions),
  );
  await runSummarize(
    reportSessions,
    options?.summarizeOptions,
    options?.claudeDir,
    options?.onProgress,
  );

  // Aggregate by project for the project-centric weekly report
  const projectData = aggregateWorkByProject(weekData[0]);

  // Per-project LLM summarization (uses per-session summaries as input)
  if (options?.summarizeOptions) {
    for (const project of projectData.projects) {
      if (project.sessions.length === 0) continue;
      options.onProgress?.(
        `Project summary: ${shortName(project.projectName)} (${project.sessions.length} sessions)...`,
      );
      project.projectSummary = await summarizeProjectWeekly(
        project.projectName,
        project.sessions,
        options.summarizeOptions,
      );
    }
  }

  const markdown = generateWorkWeeklyReport(projectData);
  return { markdown, sessions: reportSessions };
}

// ---------------------------------------------------------------------------
// Monthly report pipeline
// ---------------------------------------------------------------------------

/**
 * Build a work-monthly report markdown string.
 *
 * Pipeline: range-filtered aggregation → LLM session summarization →
 * per-project LLM summarization → markdown generation.
 * Returns `null` when no sessions exist for the target month.
 */
export async function buildWorkMonthlyMarkdown(
  indexed: DayIndexedWorkSession[],
  year: number,
  month: number,
  options?: PipelineOptions,
): Promise<PipelineResult | null> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  // Compute last day of month
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const projects = aggregateWorkByRange(
    indexed,
    { start: startDate, end: endDate },
    "weekly",
  );

  if (!projects) {
    return null;
  }

  // Summarize all sessions across all projects
  const allSessions = projects.flatMap((p) => p.sessions);
  await runSummarize(
    allSessions,
    options?.summarizeOptions,
    options?.claudeDir,
    options?.onProgress,
  );

  // Per-project LLM summarization
  if (options?.summarizeOptions) {
    for (const project of projects) {
      if (project.sessions.length === 0) continue;
      options.onProgress?.(
        `Project monthly summary: ${shortName(project.projectName)} (${project.sessions.length} sessions)...`,
      );
      project.projectSummary = await summarizeProjectMonthly(
        project.projectName,
        project.sessions,
        options.summarizeOptions,
      );
    }
  }

  const reportData = buildMonthlyReportData(year, month, projects);
  const markdown = generateWorkMonthlyReport(reportData);
  return { markdown, sessions: allSessions };
}

// ---------------------------------------------------------------------------
// Quarterly report pipeline
// ---------------------------------------------------------------------------

/**
 * Build a work-quarterly report markdown string.
 *
 * Pipeline: range-filtered aggregation → LLM session summarization →
 * per-project LLM summarization → markdown generation.
 * Returns `null` when no sessions exist for the target quarter.
 */
export async function buildWorkQuarterlyMarkdown(
  indexed: DayIndexedWorkSession[],
  year: number,
  quarter: number,
  options?: PipelineOptions,
): Promise<PipelineResult | null> {
  const startMonth = (quarter - 1) * 3 + 1;
  const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, startMonth + 2, 0).getDate();
  const endDate = `${year}-${String(startMonth + 2).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const projects = aggregateWorkByRange(
    indexed,
    { start: startDate, end: endDate },
    "monthly",
  );

  if (!projects) {
    return null;
  }

  // Summarize all sessions across all projects
  const allSessions = projects.flatMap((p) => p.sessions);
  await runSummarize(
    allSessions,
    options?.summarizeOptions,
    options?.claudeDir,
    options?.onProgress,
  );

  // Per-project LLM summarization
  if (options?.summarizeOptions) {
    for (const project of projects) {
      if (project.sessions.length === 0) continue;
      options.onProgress?.(
        `Project quarterly summary: ${shortName(project.projectName)} (${project.sessions.length} sessions)...`,
      );
      project.projectSummary = await summarizeProjectQuarterly(
        project.projectName,
        project.sessions,
        options.summarizeOptions,
      );
    }
  }

  const reportData = buildQuarterlyReportData(year, quarter, projects);
  const markdown = generateWorkQuarterlyReport(reportData);
  return { markdown, sessions: allSessions };
}
