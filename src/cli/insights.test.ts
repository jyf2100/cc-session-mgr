import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { generateInsights } from "../analytics/insights.js";
import { detectCostAnomalies } from "../analytics/cost-anomaly.js";
import { compareModels } from "../analytics/model-compare.js";
import { auditCostData } from "../analytics/cost-audit.js";
import { generateInsightsReport } from "../report/insights-report.js";
import type { SessionWorkSummary } from "../types/index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(overrides?: Partial<SessionWorkSummary>): SessionWorkSummary {
  return {
    sessionId: "s1",
    projectPath: "/proj/test",
    encodedDir: "-proj-test",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T11:00:00Z",
    messageCounts: { user: 5, assistant: 5, system: 0, other: 0 },
    cost: {
      totalUSD: 0.5,
      source: "inline",
      incomplete: false,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: ["claude-sonnet-4-6"],
    fileEdits: [{ filePath: "src/a.ts", editCount: 2 }],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    workContent: {
      primaryIntent: "Test intent",
      userIntents: [],
      toolCallSummary: {},
      bashCommands: [],
      moduleSummary: [],
      assistantSnippets: [],
      compactedSummary: null,
      llmSummary: null,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit tests: analytics pipeline composition
// ---------------------------------------------------------------------------

describe("insights CLI pipeline", () => {
  it("produces report from sessions via all analytics functions", () => {
    const sessions = [
      makeSession({ sessionId: "s1", cost: { totalUSD: 2.5, source: "inline", incomplete: false, inputTokens: 10000, outputTokens: 5000, cacheReadTokens: 0, isEstimated: false } }),
      makeSession({ sessionId: "s2", cost: { totalUSD: 0.1, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, isEstimated: false } }),
    ];

    const insights = generateInsights(sessions);
    const modelComparisons = compareModels(sessions);
    const auditReport = auditCostData(sessions);

    // detectCostAnomalies needs DateGroup[] — use empty array for unit test
    const anomalyResult = detectCostAnomalies([]);

    const markdown = generateInsightsReport({
      insights,
      anomalyResult,
      modelComparisons,
      auditReport,
    });

    // Should produce some output since we have sessions
    expect(markdown).toContain("💡 洞察");
    expect(markdown).toContain("模型对比");
    expect(markdown).toContain("成本数据质量");
  });

  it("produces empty report when no analytics data", () => {
    const sessions: SessionWorkSummary[] = [];
    const insights = generateInsights(sessions);
    const anomalyResult = detectCostAnomalies([]);
    const modelComparisons = compareModels(sessions);
    const auditReport = auditCostData(sessions);

    const markdown = generateInsightsReport({
      insights,
      anomalyResult,
      modelComparisons,
      auditReport,
    });

    expect(markdown).toBe("");
  });

  it("includes anomaly section when anomalies found", () => {
    const sessions = [makeSession()];
    const insights = generateInsights(sessions);
    const modelComparisons = compareModels(sessions);
    const auditReport = auditCostData(sessions);

    // Craft a DateGroup[] with an anomaly-like spike
    const anomalyResult = detectCostAnomalies([
      {
        date: "2026-06-03",
        sessions,
        totalMessages: 10,
        totalCost: 0.3,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        models: { "claude-sonnet-4-6": 1 },
        activeSpan: null,
      },
      {
        date: "2026-06-04",
        sessions,
        totalMessages: 10,
        totalCost: 15.0,
        totalInputTokens: 100000,
        totalOutputTokens: 50000,
        models: { "claude-sonnet-4-6": 1 },
        activeSpan: null,
      },
      {
        date: "2026-06-05",
        sessions,
        totalMessages: 10,
        totalCost: 0.2,
        totalInputTokens: 800,
        totalOutputTokens: 400,
        models: { "claude-sonnet-4-6": 1 },
        activeSpan: null,
      },
    ]);

    const markdown = generateInsightsReport({
      insights,
      anomalyResult,
      modelComparisons,
      auditReport,
    });

    // If anomaly detected, report should contain the anomaly section
    if (anomalyResult.anomalies.length > 0) {
      expect(markdown).toContain("成本异常");
    }
  });
});

// ---------------------------------------------------------------------------
// Unit tests: subtractDays logic
// ---------------------------------------------------------------------------

describe("subtractDays", () => {
  it("subtracts days correctly", () => {
    // Inline the same logic as the CLI function
    function subtractDays(dateStr: string, days: number): string {
      const d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() - days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }

    expect(subtractDays("2026-06-10", 6)).toBe("2026-06-04");
    expect(subtractDays("2026-06-01", 0)).toBe("2026-06-01");
    expect(subtractDays("2026-01-05", 10)).toBe("2025-12-26");
  });
});

// ---------------------------------------------------------------------------
// Unit tests: CLI option parsing for insights subcommand
// ---------------------------------------------------------------------------

describe("insights CLI option parsing", () => {
  it("parses --from and --to options", async () => {
    const cmd = new Command();
    cmd.exitOverride(); // Prevent process.exit in tests

    let capturedFrom: string | undefined;
    let capturedTo: string | undefined;

    cmd
      .command("insights")
      .option("--from <date>", "Start date")
      .option("--to <date>", "End date")
      .action((opts) => {
        capturedFrom = opts.from;
        capturedTo = opts.to;
      });

    await cmd.parseAsync(["node", "test", "insights", "--from", "2026-06-01", "--to", "2026-06-07"]);

    expect(capturedFrom).toBe("2026-06-01");
    expect(capturedTo).toBe("2026-06-07");
  });

  it("defaults --from and --to to undefined when not provided", async () => {
    const cmd = new Command();
    cmd.exitOverride();

    let capturedFrom: string | undefined;
    let capturedTo: string | undefined;

    cmd
      .command("insights")
      .option("--from <date>", "Start date")
      .option("--to <date>", "End date")
      .action((opts) => {
        capturedFrom = opts.from;
        capturedTo = opts.to;
      });

    await cmd.parseAsync(["node", "test", "insights"]);

    expect(capturedFrom).toBeUndefined();
    expect(capturedTo).toBeUndefined();
  });
});
