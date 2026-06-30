#!/usr/bin/env node

import { Command, type OptionValues } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildSessionSummaries } from "../aggregator/build-summaries.js";
import { buildDayIndexedSummaries } from "../aggregator/build-day-indexed.js";
import { mergeCostData } from "../aggregator/merge-cost.js";
import { aggregateByDate } from "../aggregator/by-date.js";
import { aggregateByWeek } from "../aggregator/by-week.js";
import { aggregateByProject } from "../aggregator/by-project.js";
import { buildWorkSummaries } from "../aggregator/work-summaries.js";
import { buildDayIndexedWorkSummaries } from "../aggregator/build-day-indexed-work.js";
import { generateDailyReport } from "../report/daily.js";
import { generateWeeklyReport } from "../report/weekly.js";
import { generateProjectReport } from "../report/project-report.js";
import { writeReport } from "../report/output.js";
import { buildWorkDailyMarkdown, buildWorkWeeklyMarkdown, buildWorkMonthlyMarkdown, buildWorkQuarterlyMarkdown } from "../report/pipeline.js";
import { todayStr, parseWeekArg, getISOWeek } from "./helpers.js";
import { setTimezone } from "./tz-utils.js";
import { runList, runShow } from "./session-handlers.js";
import { startServer } from "../web/index.js";
import {
  detectProvider,
} from "../summarize/index.js";
import type { SummarizeOptions } from "../summarize/index.js";
import {
  generateInsights,
  detectCostAnomalies,
  compareModels,
  auditCostData,
} from "../analytics/index.js";
import { generateInsightsReport } from "../report/insights-report.js";
import { renderHtml, renderJson, renderCsv } from "../export/index.js";
import {
  detectPhases,
  lintSession,
  generateStandup,
  buildTimeline,
  analyzePostmortem,
  diffSessions,
} from "../analysis/index.js";
import {
  formatSessionReport,
  formatLintReport,
  formatStandupReport,
  formatDiffReport,
} from "../report/session-report.js";
import { loadSessionEntries } from "./entry-loader.js";
import { runMineAndWrite } from "../mining/run.js";
import type { MineConfig } from "../mining/types.js";
import type {
  DailyReportData,
  WeeklyReportData,
  ProjectReportData,
  SessionWorkSummary,
} from "../types/index.js";

const VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// LLM summarization helpers
// ---------------------------------------------------------------------------

interface LlmFlags {
  llm?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  noLlm?: boolean;
}

interface FormatFlags {
  format?: string;
}

type OutputFormat = "md" | "html" | "json" | "csv";

/**
 * Apply output format conversion to a markdown report.
 *
 * - md:    pass through markdown unchanged
 * - html:  convert markdown to self-contained HTML
 * - json:  serialize sessions (or fallback object) as JSON
 * - csv:   render sessions as CSV rows
 */
function applyFormat(
  markdown: string,
  format: OutputFormat,
  sessions?: SessionWorkSummary[],
): string {
  switch (format) {
    case "html":
      return renderHtml(markdown);
    case "json":
      return renderJson(sessions ?? { markdown });
    case "csv":
      return sessions ? renderCsv(sessions) : markdown;
    default:
      return markdown;
  }
}

/**
 * Resolve format flag from a subcommand's options, defaulting to "md".
 */
function resolveFormat(opts: OptionValues): OutputFormat {
  const f = (opts.format as string) ?? "md";
  if (f === "html" || f === "json" || f === "csv") return f;
  return "md";
}

/**
 * Resolve LLM summarization options from CLI flags and auto-detection.
 *
 * Returns null when LLM is disabled (--no-llm) or no provider is available.
 */
async function resolveSummarizeOptions(
  flags: LlmFlags,
): Promise<SummarizeOptions | null> {
  if (flags.noLlm) return null;

  // Explicit provider via flag
  if (flags.llm) {
    const provider = flags.llm as "anthropic" | "ollama";
    if (provider === "ollama" && !flags.llmModel && !process.env["LLM_MODEL"]) {
      process.stderr.write(
        "Ollama selected but no model specified. Use --llm-model <name>.\n",
      );
      return null;
    }
    const defaults: Record<string, { baseUrl: string; model: string; apiKey?: string }> = {
      anthropic: {
        baseUrl: "https://api.anthropic.com",
        model: "claude-haiku-4-5-20251001",
        apiKey: process.env["ANTHROPIC_API_KEY"],
      },
      ollama: {
        baseUrl: "http://localhost:11434",
        model: "",
      },
    };
    const d = defaults[provider];
    return {
      provider,
      config: {
        model: flags.llmModel ?? process.env["LLM_MODEL"] ?? d.model,
        baseUrl: flags.llmBaseUrl ?? process.env["LLM_BASE_URL"] ?? d.baseUrl,
        apiKey: d.apiKey,
      },
    };
  }

  // Auto-detect
  const detected = await detectProvider();
  return detected ?? null;
}

function resolveClaudeDir(opts: OptionValues): string {
  const explicit = opts.claudeDir as string | undefined;
  if (explicit) return explicit;
  return join(homedir(), ".claude");
}

// ---------------------------------------------------------------------------
// Daily report
// ---------------------------------------------------------------------------

async function runDaily(
  dateArg: string | undefined,
): Promise<void> {
  const opts = program.opts();
  const claudeDir = resolveClaudeDir(opts);
  const date = dateArg ?? todayStr();

  const indexed = await buildDayIndexedSummaries(claudeDir);
  const summaries = indexed.map((i) => i.summary);
  const enriched = await mergeCostData(summaries, claudeDir);
  const enrichedIndexed = indexed.map((item, i) => ({
    ...item,
    summary: enriched[i],
  }));

  const dateGroups = aggregateByDate(enrichedIndexed, { start: date, end: date });
  const dayGroup = dateGroups.length > 0 ? dateGroups[0] : null;

  const projectGroups = aggregateByProject(enriched);

  // Filter project groups to only sessions on the target date
  const daySessions = dayGroup ? dayGroup.sessions : [];
  const dayProjectGroups = projectGroups
    .filter((pg) => pg.sessions.some((s) => daySessions.includes(s)))
    .map((pg) => ({
      ...pg,
      sessions: pg.sessions.filter((s) => daySessions.includes(s)),
      totalMessages: pg.sessions
        .filter((s) => daySessions.includes(s))
        .reduce((sum, s) => sum + s.messageCounts.user + s.messageCounts.assistant, 0),
      totalCost: Math.round(
        pg.sessions
          .filter((s) => daySessions.includes(s))
          .reduce((sum, s) => sum + s.cost.totalUSD, 0) * 100,
      ) / 100,
    }));

  const models: Record<string, number> = {};
  for (const s of daySessions) {
    for (const model of s.models) {
      models[model] = (models[model] ?? 0) + 1;
    }
  }

  const inputTokens = daySessions.reduce((sum, s) => sum + s.cost.inputTokens, 0);
  const outputTokens = daySessions.reduce((sum, s) => sum + s.cost.outputTokens, 0);

  const data: DailyReportData = {
    date,
    groups: dayProjectGroups,
    total: {
      sessions: daySessions.length,
      messages: dayGroup?.totalMessages ?? 0,
      cost: dayGroup?.totalCost ?? 0,
      inputTokens,
      outputTokens,
      models,
    },
  };

  const markdown = generateDailyReport(data);
  await writeReport(markdown, opts.output as string | undefined);
}

// ---------------------------------------------------------------------------
// Weekly report
// ---------------------------------------------------------------------------

async function runWeekly(
  weekArg: string | undefined,
): Promise<void> {
  const opts = program.opts();
  const claudeDir = resolveClaudeDir(opts);

  let year: number;
  let week: number;

  if (weekArg) {
    const parsed = parseWeekArg(weekArg);
    if (!parsed) {
      process.stderr.write(
        `Invalid week format: "${weekArg}". Use YYYY-WNN (e.g. 2026-W23).\n`,
      );
      process.exit(1);
    }
    year = parsed.year;
    week = parsed.week;
  } else {
    const iso = getISOWeek();
    year = iso.year;
    week = iso.week;
  }

  const indexed = await buildDayIndexedSummaries(claudeDir);
  const summaries = indexed.map((i) => i.summary);
  const enriched = await mergeCostData(summaries, claudeDir);
  const enrichedIndexed = indexed.map((item, i) => ({
    ...item,
    summary: enriched[i],
  }));

  const weekGroups = aggregateByWeek(enrichedIndexed, { year, week });

  if (weekGroups.length === 0) {
    const weekLabel = `${year}-W${String(week).padStart(2, "0")}`;
    await writeReport(
      `# Weekly Report: ${weekLabel}\n\nNo sessions found for this week.\n`,
      opts.output as string | undefined,
    );
    return;
  }

  const wg = weekGroups[0];

  // Project ranking across the week
  const weekSessions = wg.days.flatMap((d) => d.sessions);
  const projectGroups = aggregateByProject(enriched).filter((pg) =>
    pg.sessions.some((s) => weekSessions.includes(s)),
  );

  const models: Record<string, number> = {};
  for (const d of wg.days) {
    for (const [model, count] of Object.entries(d.models)) {
      models[model] = (models[model] ?? 0) + count;
    }
  }

  const inputTokens = weekSessions.reduce((sum, s) => sum + s.cost.inputTokens, 0);
  const outputTokens = weekSessions.reduce((sum, s) => sum + s.cost.outputTokens, 0);

  const data: WeeklyReportData = {
    weekLabel: wg.weekLabel,
    startDate: wg.startDate,
    endDate: wg.endDate,
    days: wg.days,
    projectRanking: projectGroups,
    total: {
      sessions: wg.totalSessions,
      messages: wg.totalMessages,
      cost: wg.totalCost,
      inputTokens,
      outputTokens,
      models,
    },
  };

  const markdown = generateWeeklyReport(data);
  await writeReport(markdown, opts.output as string | undefined);
}

// ---------------------------------------------------------------------------
// Project report
// ---------------------------------------------------------------------------

async function runProject(
  nameArg: string,
): Promise<void> {
  const opts = program.opts();
  const claudeDir = resolveClaudeDir(opts);

  const summaries = await buildSessionSummaries(claudeDir);
  const enriched = await mergeCostData(summaries, claudeDir);

  const projectGroups = aggregateByProject(enriched, nameArg);

  if (projectGroups.length === 0) {
    await writeReport(
      `# Project Report\n\nNo sessions found matching "${nameArg}".\n`,
      opts.output as string | undefined,
    );
    return;
  }

  // Use the best-matching project (most sessions)
  const pg = projectGroups[0];

  const modelEntries = Object.entries(pg.models);
  const topModel =
    modelEntries.length > 0
      ? modelEntries.sort(([, a], [, b]) => b - a)[0][0]
      : "unknown";

  const recentSessions = [...pg.sessions]
    .sort((a, b) => {
      const ta = a.startTime ?? "";
      const tb = b.startTime ?? "";
      return tb.localeCompare(ta);
    })
    .slice(0, 5);

  const data: ProjectReportData = {
    projectPath: pg.projectPath,
    totalSessions: pg.sessions.length,
    dateRange: pg.dateRange,
    totalCost: pg.totalCost,
    totalInputTokens: pg.totalInputTokens,
    totalOutputTokens: pg.totalOutputTokens,
    topModel,
    models: pg.models,
    topFiles: pg.topFiles,
    recentSessions,
  };

  const markdown = generateProjectReport(data);
  await writeReport(markdown, opts.output as string | undefined);
}

// ---------------------------------------------------------------------------
// Work-daily report
// ---------------------------------------------------------------------------

async function runWorkDaily(
  dateArg: string | undefined,
): Promise<void> {
  const cmdOpts = program.commands
    .find((c) => c.name() === "report")
    ?.commands.find((c) => c.name() === "work-daily")
    ?.opts() as (LlmFlags & FormatFlags) | undefined;
  const globalOpts = program.opts();
  const claudeDir = resolveClaudeDir(globalOpts);
  const date = dateArg ?? todayStr();

  const indexed = await buildDayIndexedWorkSummaries(claudeDir);
  const summarizeOptions = await resolveSummarizeOptions({
    llm: cmdOpts?.llm,
    llmModel: cmdOpts?.llmModel,
    llmBaseUrl: cmdOpts?.llmBaseUrl,
    noLlm: cmdOpts?.noLlm,
  });

  const result = await buildWorkDailyMarkdown(indexed, date, {
    summarizeOptions,
    claudeDir,
  });

  const markdown = result?.markdown ?? `# 工作日报: ${date}\n\nNo work sessions found for ${date}.\n`;
  const format = resolveFormat({ format: cmdOpts?.format } as OptionValues);
  const output = applyFormat(markdown, format, result?.sessions);
  await writeReport(output, globalOpts.output as string | undefined);
}

// ---------------------------------------------------------------------------
// Work-weekly report
// ---------------------------------------------------------------------------

async function runWorkWeekly(
  weekArg: string | undefined,
): Promise<void> {
  const cmdOpts = program.commands
    .find((c) => c.name() === "report")
    ?.commands.find((c) => c.name() === "work-weekly")
    ?.opts() as (LlmFlags & FormatFlags) | undefined;
  const globalOpts = program.opts();
  const claudeDir = resolveClaudeDir(globalOpts);

  let year: number;
  let week: number;

  if (weekArg) {
    const parsed = parseWeekArg(weekArg);
    if (!parsed) {
      process.stderr.write(
        `Invalid week format: "${weekArg}". Use YYYY-WNN (e.g. 2026-W23).\n`,
      );
      process.exit(1);
    }
    year = parsed.year;
    week = parsed.week;
  } else {
    const iso = getISOWeek();
    year = iso.year;
    week = iso.week;
  }

  const indexed = await buildDayIndexedWorkSummaries(claudeDir);
  const summarizeOptions = await resolveSummarizeOptions({
    llm: cmdOpts?.llm,
    llmModel: cmdOpts?.llmModel,
    llmBaseUrl: cmdOpts?.llmBaseUrl,
    noLlm: cmdOpts?.noLlm,
  });

  const result = await buildWorkWeeklyMarkdown(indexed, year, week, {
    summarizeOptions,
    claudeDir,
  });

  if (!result) {
    const weekLabel = `${year}-W${String(week).padStart(2, "0")}`;
    const fallback = `# 工作周报: ${weekLabel}\n\nNo work sessions found for week ${weekLabel}.\n`;
    const format = resolveFormat({ format: cmdOpts?.format } as OptionValues);
    await writeReport(applyFormat(fallback, format), globalOpts.output as string | undefined);
    return;
  }

  const format = resolveFormat({ format: cmdOpts?.format } as OptionValues);
  const output = applyFormat(result.markdown, format, result.sessions);
  await writeReport(output, globalOpts.output as string | undefined);
}

// ---------------------------------------------------------------------------
// Work-monthly report
// ---------------------------------------------------------------------------

async function runWorkMonthly(
  monthArg: string | undefined,
): Promise<void> {
  const cmdOpts = program.commands
    .find((c) => c.name() === "report")
    ?.commands.find((c) => c.name() === "work-monthly")
    ?.opts() as (LlmFlags & FormatFlags) | undefined;
  const globalOpts = program.opts();
  const claudeDir = resolveClaudeDir(globalOpts);

  let year: number;
  let month: number;

  if (monthArg) {
    const match = /^(\d{4})-(\d{2})$/.exec(monthArg);
    if (!match) {
      process.stderr.write(
        `Invalid month format: "${monthArg}". Use YYYY-MM (e.g. 2026-06).\n`,
      );
      process.exit(1);
    }
    year = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    if (month < 1 || month > 12) {
      process.stderr.write(`Invalid month: ${month}. Must be 01-12.\n`);
      process.exit(1);
    }
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const indexed = await buildDayIndexedWorkSummaries(claudeDir);
  const summarizeOptions = await resolveSummarizeOptions({
    llm: cmdOpts?.llm,
    llmModel: cmdOpts?.llmModel,
    llmBaseUrl: cmdOpts?.llmBaseUrl,
    noLlm: cmdOpts?.noLlm,
  });

  const result = await buildWorkMonthlyMarkdown(indexed, year, month, {
    summarizeOptions,
    claudeDir,
  });

  if (!result) {
    const label = `${year}-${String(month).padStart(2, "0")}`;
    const fallback = `# 工作月报: ${label}\n\nNo work sessions found for ${label}.\n`;
    const format = resolveFormat({ format: cmdOpts?.format } as OptionValues);
    await writeReport(applyFormat(fallback, format), globalOpts.output as string | undefined);
    return;
  }

  const format = resolveFormat({ format: cmdOpts?.format } as OptionValues);
  const output = applyFormat(result.markdown, format, result.sessions);
  await writeReport(output, globalOpts.output as string | undefined);
}

// ---------------------------------------------------------------------------
// Work-quarterly report
// ---------------------------------------------------------------------------

async function runWorkQuarterly(
  quarterArg: string | undefined,
): Promise<void> {
  const cmdOpts = program.commands
    .find((c) => c.name() === "report")
    ?.commands.find((c) => c.name() === "work-quarterly")
    ?.opts() as (LlmFlags & FormatFlags) | undefined;
  const globalOpts = program.opts();
  const claudeDir = resolveClaudeDir(globalOpts);

  let year: number;
  let quarter: number;

  if (quarterArg) {
    const match = /^(\d{4})-Q(\d)$/.exec(quarterArg);
    if (!match) {
      process.stderr.write(
        `Invalid quarter format: "${quarterArg}". Use YYYY-QN (e.g. 2026-Q2).\n`,
      );
      process.exit(1);
    }
    year = parseInt(match[1], 10);
    quarter = parseInt(match[2], 10);
    if (quarter < 1 || quarter > 4) {
      process.stderr.write(`Invalid quarter: ${quarter}. Must be 1-4.\n`);
      process.exit(1);
    }
  } else {
    const now = new Date();
    year = now.getFullYear();
    quarter = Math.floor(now.getMonth() / 3) + 1;
  }

  const indexed = await buildDayIndexedWorkSummaries(claudeDir);
  const summarizeOptions = await resolveSummarizeOptions({
    llm: cmdOpts?.llm,
    llmModel: cmdOpts?.llmModel,
    llmBaseUrl: cmdOpts?.llmBaseUrl,
    noLlm: cmdOpts?.noLlm,
  });

  const result = await buildWorkQuarterlyMarkdown(indexed, year, quarter, {
    summarizeOptions,
    claudeDir,
  });

  if (!result) {
    const label = `${year}-Q${quarter}`;
    const fallback = `# 工作季报: ${label}\n\nNo work sessions found for ${label}.\n`;
    const format = resolveFormat({ format: cmdOpts?.format } as OptionValues);
    await writeReport(applyFormat(fallback, format), globalOpts.output as string | undefined);
    return;
  }

  const format = resolveFormat({ format: cmdOpts?.format } as OptionValues);
  const output = applyFormat(result.markdown, format, result.sessions);
  await writeReport(output, globalOpts.output as string | undefined);
}

// ---------------------------------------------------------------------------
// Insights report
// ---------------------------------------------------------------------------

/**
 * Compute a date N days before the given date string (YYYY-MM-DD).
 * Returns YYYY-MM-DD format.
 */
function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function runInsights(opts: OptionValues): Promise<void> {
  const globalOpts = program.opts();
  const claudeDir = resolveClaudeDir(globalOpts);

  const today = todayStr();
  const from = (opts.from as string) ?? subtractDays(today, 6);
  const to = (opts.to as string) ?? today;

  // Load & enrich work summaries
  const indexed = await buildDayIndexedWorkSummaries(claudeDir);
  const summaries = indexed.map((i) => i.summary);
  const enriched = await mergeCostData(summaries, claudeDir);

  // Patch indexed with enriched summaries (mergeCostData preserves workContent at runtime)
  const enrichedIndexed = indexed.map((item, i) => ({
    ...item,
    summary: { ...item.summary, cost: enriched[i].cost } as SessionWorkSummary,
  }));

  // Filter to sessions active in the date range
  const sessions = enrichedIndexed
    .filter(({ daySlices }) => daySlices.some((s) => s.date >= from && s.date <= to))
    .map(({ summary }) => summary);

  if (sessions.length === 0) {
    const fallback = `# Insights Report\n\nNo sessions found from ${from} to ${to}.\n`;
    const format = resolveFormat(opts);
    await writeReport(applyFormat(fallback, format), globalOpts.output as string | undefined);
    return;
  }

  // Build DateGroup[] for anomaly detection (accepts DayIndexedSession-compatible input)
  const dateGroups = aggregateByDate(
    enrichedIndexed as unknown as Parameters<typeof aggregateByDate>[0],
    { start: from, end: to },
  );

  // Run all analytics
  const insights = generateInsights(sessions);
  const anomalyResult = detectCostAnomalies(dateGroups);
  const modelComparisons = compareModels(sessions);
  const auditReport = auditCostData(sessions);

  const markdown = generateInsightsReport({
    insights,
    anomalyResult,
    modelComparisons,
    auditReport,
  });

  const header = `# Insights Report\n\n> ${from} — ${to} · ${sessions.length} sessions\n\n`;
  const fullMarkdown = markdown ? header + markdown : header + "_No insights for this period._\n";
  const format = resolveFormat(opts);
  const output = applyFormat(fullMarkdown, format, sessions);
  await writeReport(output, globalOpts.output as string | undefined);
}

// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("session-mgr")
  .description("Analyze Claude Code session data and generate reports")
  .version(VERSION)
  .option("--claude-dir <path>", "Path to ~/.claude directory")
  .option("--output <path>", "Write report to file instead of stdout")
  .option("--tz <timezone>", "IANA timezone for date grouping (e.g. Asia/Shanghai, UTC)");

const reportCmd = program
  .command("report")
  .description("Generate session reports");

reportCmd
  .command("daily")
  .description("Generate a daily report (defaults to today)")
  .argument("[date]", "Date in YYYY-MM-DD format", undefined)
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(runDaily);

reportCmd
  .command("weekly")
  .description("Generate a weekly report (defaults to current week)")
  .argument("[week]", "Week in YYYY-WNN format (e.g. 2026-W23)", undefined)
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(runWeekly);

reportCmd
  .command("project")
  .description("Generate a project analysis report")
  .argument("<name>", "Project name or path substring to match")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(runProject);

reportCmd
  .command("work-daily")
  .description("Generate a work-content daily report (defaults to today)")
  .argument("[date]", "Date in YYYY-MM-DD format", undefined)
  .option("--llm <provider>", "LLM provider: anthropic | ollama (default: auto-detect)")
  .option("--llm-model <name>", "LLM model name (required for ollama)")
  .option("--llm-base-url <url>", "LLM API base URL (overrides default)")
  .option("--no-llm", "Disable LLM summarization")
  .option("--format <fmt>", "Output format: md | html | json | csv (default: md)")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(runWorkDaily);

reportCmd
  .command("work-weekly")
  .description("Generate a work-content weekly report (defaults to current week)")
  .argument("[week]", "Week in YYYY-WNN format (e.g. 2026-W23)", undefined)
  .option("--llm <provider>", "LLM provider: anthropic | ollama (default: auto-detect)")
  .option("--llm-model <name>", "LLM model name (required for ollama)")
  .option("--llm-base-url <url>", "LLM API base URL (overrides default)")
  .option("--no-llm", "Disable LLM summarization")
  .option("--format <fmt>", "Output format: md | html | json | csv (default: md)")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(runWorkWeekly);

reportCmd
  .command("work-monthly")
  .description("Generate a work-content monthly report (defaults to current month)")
  .argument("[month]", "Month in YYYY-MM format (e.g. 2026-06)", undefined)
  .option("--llm <provider>", "LLM provider: anthropic | ollama (default: auto-detect)")
  .option("--llm-model <name>", "LLM model name (required for ollama)")
  .option("--llm-base-url <url>", "LLM API base URL (overrides default)")
  .option("--no-llm", "Disable LLM summarization")
  .option("--format <fmt>", "Output format: md | html | json | csv (default: md)")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(runWorkMonthly);

reportCmd
  .command("work-quarterly")
  .description("Generate a work-content quarterly report (defaults to current quarter)")
  .argument("[quarter]", "Quarter in YYYY-QN format (e.g. 2026-Q2)", undefined)
  .option("--llm <provider>", "LLM provider: anthropic | ollama (default: auto-detect)")
  .option("--llm-model <name>", "LLM model name (required for ollama)")
  .option("--llm-base-url <url>", "LLM API base URL (overrides default)")
  .option("--no-llm", "Disable LLM summarization")
  .option("--format <fmt>", "Output format: md | html | json | csv (default: md)")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(runWorkQuarterly);

reportCmd
  .command("insights")
  .description("Generate an analytics insights report (defaults to last 7 days)")
  .option("--from <date>", "Start date (YYYY-MM-DD, default: 7 days ago)")
  .option("--to <date>", "End date (YYYY-MM-DD, default: today)")
  .option("--format <fmt>", "Output format: md | html | json | csv (default: md)")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(runInsights);

// ---------------------------------------------------------------------------
// Deep session analysis report handlers
// ---------------------------------------------------------------------------

async function runSessionReport(
  sessionId: string,
  opts: { claudeDir?: string; output?: string },
): Promise<void> {
  const claudeDir = resolveClaudeDir({ claudeDir: opts.claudeDir } as OptionValues);
  const { entries } = await loadSessionEntries(sessionId, claudeDir);

  const phases = detectPhases(entries);
  const lintFindings = lintSession(entries);
  const timeline = buildTimeline(entries);
  const postmortem = analyzePostmortem(entries);

  const markdown = formatSessionReport({
    phases,
    lintFindings,
    timeline,
    postmortem,
  });
  await writeReport(markdown, opts.output);
}

async function runLintReport(
  sessionId: string | undefined,
  opts: { claudeDir?: string; output?: string },
): Promise<void> {
  const claudeDir = resolveClaudeDir({ claudeDir: opts.claudeDir } as OptionValues);

  // If no session ID, lint the most recent session
  let id = sessionId;
  if (!id) {
    const summaries = await mergeCostData(
      await buildSessionSummaries(claudeDir),
      claudeDir,
    );
    if (summaries.length === 0) throw new Error("No sessions found.");
    const sorted = [...summaries].sort((a, b) =>
      (b.startTime ?? "").localeCompare(a.startTime ?? ""),
    );
    id = sorted[0].sessionId;
  }

  const { entries } = await loadSessionEntries(id, claudeDir);
  const findings = lintSession(entries);
  const markdown = formatLintReport(findings);
  await writeReport(markdown, opts.output);
}

async function runStandupReport(
  sessionId: string | undefined,
  opts: { claudeDir?: string; output?: string },
): Promise<void> {
  const claudeDir = resolveClaudeDir({ claudeDir: opts.claudeDir } as OptionValues);

  let id = sessionId;
  if (!id) {
    const summaries = await mergeCostData(
      await buildSessionSummaries(claudeDir),
      claudeDir,
    );
    if (summaries.length === 0) throw new Error("No sessions found.");
    const sorted = [...summaries].sort((a, b) =>
      (b.startTime ?? "").localeCompare(a.startTime ?? ""),
    );
    id = sorted[0].sessionId;
  }

  const { entries } = await loadSessionEntries(id, claudeDir);
  const report = generateStandup(entries);
  const markdown = formatStandupReport(report);
  await writeReport(markdown, opts.output);
}

async function runDiffReport(
  idA: string,
  idB: string,
  opts: { claudeDir?: string; output?: string },
): Promise<void> {
  const claudeDir = resolveClaudeDir({ claudeDir: opts.claudeDir } as OptionValues);
  const { entries: entriesA } = await loadSessionEntries(idA, claudeDir);
  const { entries: entriesB } = await loadSessionEntries(idB, claudeDir);

  const diff = diffSessions(entriesA, entriesB);
  const markdown = formatDiffReport(diff);
  await writeReport(markdown, opts.output);
}

// ---------------------------------------------------------------------------
// Deep session analysis commands
// ---------------------------------------------------------------------------

reportCmd
  .command("session")
  .description("Deep analysis of a single session (phases, lint, timeline, postmortem)")
  .argument("<sessionId>", "Session ID (supports prefix matching)")
  .action(async (sessionId: string) => {
    const globalOpts = program.opts();
    await runSessionReport(sessionId, {
      claudeDir: globalOpts.claudeDir,
      output: globalOpts.output,
    });
  });

reportCmd
  .command("lint")
  .description("Lint a session for anti-patterns (defaults to most recent)")
  .argument("[sessionId]", "Session ID (supports prefix matching)")
  .action(async (sessionId: string | undefined) => {
    const globalOpts = program.opts();
    await runLintReport(sessionId, {
      claudeDir: globalOpts.claudeDir,
      output: globalOpts.output,
    });
  });

reportCmd
  .command("standup")
  .description("Generate a standup report from a session (defaults to most recent)")
  .argument("[sessionId]", "Session ID (supports prefix matching)")
  .action(async (sessionId: string | undefined) => {
    const globalOpts = program.opts();
    await runStandupReport(sessionId, {
      claudeDir: globalOpts.claudeDir,
      output: globalOpts.output,
    });
  });

reportCmd
  .command("diff")
  .description("Compare two sessions side-by-side")
  .argument("<sessionIdA>", "First session ID (supports prefix matching)")
  .argument("<sessionIdB>", "Second session ID (supports prefix matching)")
  .action(async (idA: string, idB: string) => {
    const globalOpts = program.opts();
    await runDiffReport(idA, idB, {
      claudeDir: globalOpts.claudeDir,
      output: globalOpts.output,
    });
  });

// ---------------------------------------------------------------------------
// Session browsing
// ---------------------------------------------------------------------------

const sessionCmd = program
  .command("session")
  .description("Browse individual sessions");

sessionCmd
  .command("list")
  .description("List sessions with optional filters")
  .option("--project <name>", "Filter by project path substring")
  .option("--from <date>", "Filter from date (YYYY-MM-DD, inclusive)")
  .option("--to <date>", "Filter to date (YYYY-MM-DD, inclusive)")
  .option("--limit <n>", "Max sessions to show (0 = unlimited)", "20")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(async (opts) => {
    const globalOpts = program.opts();
    await runList({
      project: opts.project,
      from: opts.from,
      to: opts.to,
      limit: parseInt(opts.limit, 10),
      claudeDir: globalOpts.claudeDir,
      output: globalOpts.output,
    });
  });

sessionCmd
  .command("show")
  .description("Show details for a single session")
  .argument("<sessionId>", "Session ID (supports prefix matching)")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .option("--analysis", "Include deep session analysis (phases, lint, timeline, postmortem)")
  .action(async (sessionId: string, opts) => {
    const globalOpts = program.opts();
    await runShow(sessionId, {
      claudeDir: globalOpts.claudeDir,
      output: globalOpts.output,
      analysis: opts.analysis === true,
    });
  });

// ---------------------------------------------------------------------------
// Web UI
// ---------------------------------------------------------------------------

program
  .command("web")
  .description("Start an interactive web UI for browsing sessions")
  .option("--port <number>", "Port to listen on", "3456")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .action(async (opts) => {
    const globalOpts = program.opts();
    const claudeDir = resolveClaudeDir(globalOpts);
    const port = parseInt(opts.port, 10);
    const tz = (opts.tz as string | undefined) || (globalOpts.tz as string | undefined);

    const summaries = await buildSessionSummaries(claudeDir);
    const enriched = await mergeCostData(summaries, claudeDir);

    startServer(enriched, port, claudeDir, tz);
  });

// ---------------------------------------------------------------------------
// TUI (Interactive Terminal UI)
// ---------------------------------------------------------------------------

program
  .command("tui")
  .description("Launch interactive terminal UI")
  .option("--tz <timezone>", "IANA timezone (e.g. Asia/Shanghai, UTC)")
  .option("--report-dir <path>", "Directory for exported reports (default: $HOME)")
  .option("--llm <provider>", "LLM provider: anthropic | ollama (default: auto-detect)")
  .option("--llm-model <name>", "LLM model name (required for ollama)")
  .option("--llm-base-url <url>", "LLM API base URL (overrides default)")
  .option("--no-llm", "Disable LLM summarization")
  .action(async (opts) => {
    const globalOpts = program.opts();
    const claudeDir = resolveClaudeDir(globalOpts);
    const tz = (opts.tz as string | undefined) || (globalOpts.tz as string | undefined);
    if (tz) setTimezone(tz);
    const summarizeOptions = await resolveSummarizeOptions({
      llm: opts.llm as string | undefined,
      llmModel: opts.llmModel as string | undefined,
      llmBaseUrl: opts.llmBaseUrl as string | undefined,
      noLlm: opts.noLlm as boolean | undefined,
    });
    const { startTui } = await import("../tui/index.js");
    await startTui(claudeDir, {
      reportDir: opts.reportDir as string | undefined,
      summarizeOptions,
    });
  });

// ---------------------------------------------------------------------------
// Mining(会话挖掘 agent —— session-mining-agent)
// ---------------------------------------------------------------------------

program
  .command("mine")
  .description("Mine lessons/signals from session history")
  .argument("[project]", "Project filter (substring); default = current cwd project")
  .option("--from <date>", "Start date YYYY-MM-DD")
  .option("--to <date>", "End date YYYY-MM-DD")
  .option("--output <dir>", "Output directory (default: ./mined)")
  .option("--min-turns <n>", "Triage threshold (human turns)", "3")
  .option("--dry-run", "Show triage split only, no LLM, no output")
  .option("--all-projects", "Mine all projects (prints cost warning)")
  .option("--interactive", "Interactive per-lesson approval")
  .option("--llm <provider>", "LLM provider: anthropic | ollama")
  .option("--llm-model <name>", "LLM model name (required for ollama)")
  .option("--llm-base-url <url>", "LLM API base URL")
  .option("--no-llm", "Disable LLM (deterministic digest/triage only)")
  .action(async (project: string | undefined, opts) => {
    const globalOpts = program.opts();
    const claudeDir = resolveClaudeDir(globalOpts);
    const dateStr = todayStr();
    const llm = await resolveSummarizeOptions({
      llm: opts.llm as string | undefined,
      llmModel: opts.llmModel as string | undefined,
      llmBaseUrl: opts.llmBaseUrl as string | undefined,
      noLlm: opts.noLlm as boolean | undefined,
    });
    const outputDir =
      (opts.output as string | undefined) ??
      (globalOpts.output as string | undefined) ??
      join(process.cwd(), "mined");
    const minTurns = parseInt(opts.minTurns as string, 10) || 3;
    const dateRange =
      opts.from && opts.to
        ? { start: opts.from as string, end: opts.to as string }
        : undefined;

    if (opts.allProjects) {
      const all = await buildWorkSummaries(claudeDir);
      process.stderr.write(
        `⚠️ --all-projects: 约 ${all.length} 个会话,可能产生 LLM 成本\n`,
      );
    }

    const config: MineConfig = {
      claudeDir,
      outputDir,
      projectFilter: project,
      allProjects: opts.allProjects === true,
      dateRange,
      minTurns,
      dryRun: opts.dryRun === true,
      interactive: opts.interactive === true,
      llm,
    };
    const result = await runMineAndWrite(config, dateStr);
    process.stdout.write(result.triageView + "\n");
    if (!config.dryRun && result.written > 0) {
      process.stdout.write(
        `\n✓ 写入 ${result.written} 条到 ${outputDir}/lessons/(项目: ${result.projects.join(", ")})\n` +
          `  INDEX: ${outputDir}/lessons/INDEX.md\n`,
      );
    }
  });

// Apply timezone before any action handler runs.
// Read from the leaf action command (subcommand --tz) first,
// fall back to the global program option (--tz before subcommand).
program.hook("preAction", (_thisCmd, actionCmd) => {
  const actionOpts = actionCmd.opts();
  const globalOpts = program.opts();
  const tz = (actionOpts.tz as string | undefined) || (globalOpts.tz as string | undefined);
  if (tz) {
    setTimezone(tz);
  }
});

program.parse();
