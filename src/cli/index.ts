#!/usr/bin/env node

import { Command, type OptionValues } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildSessionSummaries } from "../aggregator/build-summaries.js";
import { mergeCostData } from "../aggregator/merge-cost.js";
import { aggregateByDate } from "../aggregator/by-date.js";
import { aggregateByWeek } from "../aggregator/by-week.js";
import { aggregateByProject } from "../aggregator/by-project.js";
import { buildWorkSummaries } from "../aggregator/work-summaries.js";
import { aggregateWorkByDate } from "../aggregator/work-by-date.js";
import { aggregateWorkByWeek } from "../aggregator/work-by-week.js";
import { generateDailyReport } from "../report/daily.js";
import { generateWeeklyReport } from "../report/weekly.js";
import { generateProjectReport } from "../report/project-report.js";
import { generateWorkDailyReport } from "../report/work-daily.js";
import { generateWorkWeeklyReport } from "../report/work-weekly.js";
import { writeReport } from "../report/output.js";
import { todayStr, parseWeekArg, getISOWeek } from "./helpers.js";
import { runList, runShow } from "./session-handlers.js";
import { startServer } from "../web/index.js";
import {
  detectProvider,
  summarizeSessions,
} from "../summarize/index.js";
import type { SummarizeOptions } from "../summarize/index.js";
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

/**
 * Run LLM summarization on work summaries if options are configured.
 */
async function maybeSummarize(
  summaries: SessionWorkSummary[],
  flags: LlmFlags,
): Promise<void> {
  const options = await resolveSummarizeOptions(flags);
  if (!options) return;

  const flat = summaries;
  if (flat.length === 0) return;

  process.stderr.write(
    `Summarizing ${flat.length} session(s) with ${options.provider} (${options.config.model})...\n`,
  );
  await summarizeSessions(flat, options);
  process.stderr.write("Summarization complete.\n");
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

  const summaries = await buildSessionSummaries(claudeDir);
  const enriched = await mergeCostData(summaries, claudeDir);

  const dateGroups = aggregateByDate(enriched, { start: date, end: date });
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
    const now = new Date();
    const iso = getISOWeek(now);
    year = iso.year;
    week = iso.week;
  }

  const summaries = await buildSessionSummaries(claudeDir);
  const enriched = await mergeCostData(summaries, claudeDir);

  const weekGroups = aggregateByWeek(enriched, { year, week });

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
    ?.opts() as LlmFlags | undefined;
  const globalOpts = program.opts();
  const claudeDir = resolveClaudeDir(globalOpts);
  const date = dateArg ?? todayStr();

  const summaries = await buildWorkSummaries(claudeDir);

  // Aggregate FIRST — filter to the target date range before summarizing.
  // This avoids wasting LLM calls on sessions outside the report scope.
  const dailyData = aggregateWorkByDate(summaries, { start: date, end: date });
  const data = dailyData.length > 0
    ? dailyData[0]
    : { date, projects: [], sessionCount: 0 };

  // Only summarize sessions that will actually appear in the report
  const reportSessions = data.projects.flatMap((p) => p.sessions);
  await maybeSummarize(reportSessions, {
    llm: cmdOpts?.llm,
    llmModel: cmdOpts?.llmModel,
    llmBaseUrl: cmdOpts?.llmBaseUrl,
    noLlm: cmdOpts?.noLlm,
  });

  const markdown = generateWorkDailyReport(data);
  await writeReport(markdown, globalOpts.output as string | undefined);
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
    ?.opts() as LlmFlags | undefined;
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
    const now = new Date();
    const iso = getISOWeek(now);
    year = iso.year;
    week = iso.week;
  }

  const summaries = await buildWorkSummaries(claudeDir);

  // Aggregate FIRST — filter to the target week before summarizing.
  // This avoids wasting LLM calls on sessions outside the report scope.
  const dailyData = aggregateWorkByDate(summaries);
  const weekData = aggregateWorkByWeek(dailyData, { year, week });

  if (weekData.length === 0) {
    const weekLabel = `${year}-W${String(week).padStart(2, "0")}`;
    await writeReport(
      `# 工作周报: ${weekLabel}\n\nNo work sessions found for week ${weekLabel}.\n`,
      globalOpts.output as string | undefined,
    );
    return;
  }

  // Only summarize sessions that will actually appear in the report
  const reportSessions = weekData[0].days.flatMap((d) =>
    d.projects.flatMap((p) => p.sessions),
  );
  await maybeSummarize(reportSessions, {
    llm: cmdOpts?.llm,
    llmModel: cmdOpts?.llmModel,
    llmBaseUrl: cmdOpts?.llmBaseUrl,
    noLlm: cmdOpts?.noLlm,
  });

  const markdown = generateWorkWeeklyReport(weekData[0]);
  await writeReport(markdown, globalOpts.output as string | undefined);
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("session-mgr")
  .description("Analyze Claude Code session data and generate reports")
  .version(VERSION)
  .option("--claude-dir <path>", "Path to ~/.claude directory")
  .option("--output <path>", "Write report to file instead of stdout");

const reportCmd = program
  .command("report")
  .description("Generate session reports");

reportCmd
  .command("daily")
  .description("Generate a daily report (defaults to today)")
  .argument("[date]", "Date in YYYY-MM-DD format", undefined)
  .action(runDaily);

reportCmd
  .command("weekly")
  .description("Generate a weekly report (defaults to current week)")
  .argument("[week]", "Week in YYYY-WNN format (e.g. 2026-W23)", undefined)
  .action(runWeekly);

reportCmd
  .command("project")
  .description("Generate a project analysis report")
  .argument("<name>", "Project name or path substring to match")
  .action(runProject);

reportCmd
  .command("work-daily")
  .description("Generate a work-content daily report (defaults to today)")
  .argument("[date]", "Date in YYYY-MM-DD format", undefined)
  .option("--llm <provider>", "LLM provider: anthropic | ollama (default: auto-detect)")
  .option("--llm-model <name>", "LLM model name (required for ollama)")
  .option("--llm-base-url <url>", "LLM API base URL (overrides default)")
  .option("--no-llm", "Disable LLM summarization")
  .action(runWorkDaily);

reportCmd
  .command("work-weekly")
  .description("Generate a work-content weekly report (defaults to current week)")
  .argument("[week]", "Week in YYYY-WNN format (e.g. 2026-W23)", undefined)
  .option("--llm <provider>", "LLM provider: anthropic | ollama (default: auto-detect)")
  .option("--llm-model <name>", "LLM model name (required for ollama)")
  .option("--llm-base-url <url>", "LLM API base URL (overrides default)")
  .option("--no-llm", "Disable LLM summarization")
  .action(runWorkWeekly);

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
  .action(async (sessionId: string) => {
    const globalOpts = program.opts();
    await runShow(sessionId, {
      claudeDir: globalOpts.claudeDir,
      output: globalOpts.output,
    });
  });

// ---------------------------------------------------------------------------
// Web UI
// ---------------------------------------------------------------------------

program
  .command("web")
  .description("Start an interactive web UI for browsing sessions")
  .option("--port <number>", "Port to listen on", "3456")
  .action(async (opts) => {
    const globalOpts = program.opts();
    const claudeDir = resolveClaudeDir(globalOpts);
    const port = parseInt(opts.port, 10);

    const summaries = await buildSessionSummaries(claudeDir);
    const enriched = await mergeCostData(summaries, claudeDir);

    startServer(enriched, port, claudeDir);
  });

program.parse();
