import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { buildSessionSummaries } from "./aggregator/build-summaries.js";
import { buildDayIndexedSummaries } from "./aggregator/build-day-indexed.js";
import { mergeCostData } from "./aggregator/merge-cost.js";
import { aggregateByDate } from "./aggregator/by-date.js";
import { aggregateByWeek } from "./aggregator/by-week.js";
import { aggregateByProject } from "./aggregator/by-project.js";
import { generateDailyReport } from "./report/daily.js";
import { generateWeeklyReport } from "./report/weekly.js";
import { generateProjectReport } from "./report/project-report.js";
import { todayStr } from "./cli/helpers.js";

const CLAUDE_DIR = join(homedir(), ".claude");

// Skip integration tests if ~/.claude doesn't exist (e.g. CI)
const skipIfNoData = existsSync(CLAUDE_DIR) ? describe : describe.skip;

skipIfNoData("Integration: real ~/.claude data", () => {
  it("parses sessions and generates a daily report for today", async () => {
    const indexed = await buildDayIndexedSummaries(CLAUDE_DIR);
    expect(indexed.length).toBeGreaterThan(0);

    const summaries = indexed.map((i) => i.summary);
    const enriched = await mergeCostData(summaries, CLAUDE_DIR);
    const enrichedIndexed = indexed.map((item, i) => ({
      ...item,
      summary: enriched[i],
    }));

    const today = todayStr();
    const dateGroups = aggregateByDate(enrichedIndexed, { start: today, end: today });
    const dayGroup = dateGroups.length > 0 ? dateGroups[0] : null;

    const projectGroups = aggregateByProject(enriched);
    const daySessions = dayGroup ? dayGroup.sessions : [];
    const dayProjectGroups = projectGroups.filter((pg) =>
      pg.sessions.some((s) => daySessions.includes(s)),
    );

    const models: Record<string, number> = {};
    for (const s of daySessions) {
      for (const model of s.models) {
        models[model] = (models[model] ?? 0) + 1;
      }
    }

    const inputTokens = daySessions.reduce((sum, s) => sum + s.cost.inputTokens, 0);
    const outputTokens = daySessions.reduce((sum, s) => sum + s.cost.outputTokens, 0);

    const data = {
      date: today,
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

    const report = generateDailyReport(data);
    expect(report).toContain(`# Daily Report: ${today}`);
    expect(report.length).toBeGreaterThan(10);
  });

  it("generates a weekly report for the current week", async () => {
    const indexed = await buildDayIndexedSummaries(CLAUDE_DIR);
    const summaries = indexed.map((i) => i.summary);
    const enriched = await mergeCostData(summaries, CLAUDE_DIR);
    const enrichedIndexed = indexed.map((item, i) => ({
      ...item,
      summary: enriched[i],
    }));

    const weekGroups = aggregateByWeek(enrichedIndexed);
    expect(weekGroups.length).toBeGreaterThan(0);

    const latestWeek = weekGroups[weekGroups.length - 1];
    const weekSessions = latestWeek.days.flatMap((d) => d.sessions);
    const projectGroups = aggregateByProject(enriched).filter((pg) =>
      pg.sessions.some((s) => weekSessions.includes(s)),
    );

    const models: Record<string, number> = {};
    for (const d of latestWeek.days) {
      for (const [model, count] of Object.entries(d.models)) {
        models[model] = (models[model] ?? 0) + count;
      }
    }

    const inputTokens = weekSessions.reduce((sum, s) => sum + s.cost.inputTokens, 0);
    const outputTokens = weekSessions.reduce((sum, s) => sum + s.cost.outputTokens, 0);

    const data = {
      weekLabel: latestWeek.weekLabel,
      startDate: latestWeek.startDate,
      endDate: latestWeek.endDate,
      days: latestWeek.days,
      projectRanking: projectGroups,
      total: {
        sessions: latestWeek.totalSessions,
        messages: latestWeek.totalMessages,
        cost: latestWeek.totalCost,
        inputTokens,
        outputTokens,
        models,
      },
    };

    const report = generateWeeklyReport(data);
    expect(report).toContain("# Weekly Report:");
    expect(report).toContain("## Summary");
    expect(report.length).toBeGreaterThan(20);
  });

  it("generates a project report for an existing project", async () => {
    const summaries = await buildSessionSummaries(CLAUDE_DIR);
    const enriched = await mergeCostData(summaries, CLAUDE_DIR);

    const projectGroups = aggregateByProject(enriched);
    expect(projectGroups.length).toBeGreaterThan(0);

    const topProject = projectGroups[0];
    expect(topProject.projectPath.length).toBeGreaterThan(0);

    const modelEntries = Object.entries(topProject.models);
    const topModel =
      modelEntries.length > 0
        ? modelEntries.sort(([, a], [, b]) => b - a)[0][0]
        : "unknown";

    const recentSessions = [...topProject.sessions]
      .sort((a, b) => {
        const ta = a.startTime ?? "";
        const tb = b.startTime ?? "";
        return tb.localeCompare(ta);
      })
      .slice(0, 5);

    const data = {
      projectPath: topProject.projectPath,
      totalSessions: topProject.sessions.length,
      dateRange: topProject.dateRange,
      totalCost: topProject.totalCost,
      totalInputTokens: topProject.totalInputTokens,
      totalOutputTokens: topProject.totalOutputTokens,
      topModel,
      models: topProject.models,
      topFiles: topProject.topFiles,
      recentSessions,
    };

    const report = generateProjectReport(data);
    expect(report).toContain("# Project Report:");
    expect(report).toContain(topProject.projectPath.split("/").pop()!);
    expect(report).toContain("## Overview");
  });
});
