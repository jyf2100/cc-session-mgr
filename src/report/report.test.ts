import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateDailyReport } from "./daily.js";
import { generateWeeklyReport } from "./weekly.js";
import { generateProjectReport } from "./project-report.js";
import { formatCost, formatTokenCount } from "./format.js";
import { writeReport } from "./output.js";
import type {
  DailyReportData,
  WeeklyReportData,
  ProjectReportData,
  SessionSummary,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// formatCost
// ---------------------------------------------------------------------------

describe("formatCost", () => {
  it("formats as $X.XX with 2 decimal places", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(0.123)).toBe("$0.12");
    expect(formatCost(99.999)).toBe("$100.00");
  });
});

describe("formatTokenCount", () => {
  it("formats small numbers as-is", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(42)).toBe("42");
    expect(formatTokenCount(999)).toBe("999");
  });

  it("formats thousands with K", () => {
    expect(formatTokenCount(1000)).toBe("1.0K");
    expect(formatTokenCount(50000)).toBe("50.0K");
    expect(formatTokenCount(999999)).toBe("1000.0K");
  });

  it("formats millions with M", () => {
    expect(formatTokenCount(1_000_000)).toBe("1.0M");
    expect(formatTokenCount(2_500_000)).toBe("2.5M");
  });
});

// ---------------------------------------------------------------------------
// generateDailyReport
// ---------------------------------------------------------------------------

describe("generateDailyReport", () => {
  it("generates report with summary table and project breakdown", () => {
    const data: DailyReportData = {
      date: "2026-06-09",
      total: { sessions: 3, messages: 42, cost: 0.15, inputTokens: 50000, outputTokens: 2000, models: { sonnet: 2, haiku: 1 } },
      groups: [
        {
          projectPath: "/Users/dev/app",
          sessions: [] as SessionSummary[],
          totalMessages: 30,
          totalCost: 0.12,
          totalInputTokens: 40000,
          totalOutputTokens: 1500,
          models: { sonnet: 2 },
          topFiles: [{ filePath: "src/app.ts", editCount: 5 }],
          dateRange: { start: "2026-06-09", end: "2026-06-09" },
        },
      ],
    };

    const md = generateDailyReport(data);
    expect(md).toContain("# Daily Report: 2026-06-09");
    expect(md).toContain("| Sessions | 3 |");
    expect(md).toContain("| Cost | $0.15 (50.0K in / 2.0K out) |");
    expect(md).toContain("**Models:** sonnet (2), haiku (1)");
    expect(md).toContain("src/app.ts (5)");
  });

  it("handles empty data gracefully", () => {
    const data: DailyReportData = {
      date: "2026-06-09",
      total: { sessions: 0, messages: 0, cost: 0, inputTokens: 0, outputTokens: 0, models: {} },
      groups: [],
    };

    const md = generateDailyReport(data);
    expect(md).toContain("No sessions found for 2026-06-09");
  });
});

// ---------------------------------------------------------------------------
// generateWeeklyReport
// ---------------------------------------------------------------------------

describe("generateWeeklyReport", () => {
  it("generates report with daily breakdown table", () => {
    const data: WeeklyReportData = {
      weekLabel: "2026-W23",
      startDate: "2026-06-02",
      endDate: "2026-06-08",
      days: [
        {
          date: "2026-06-02",
          sessions: [] as SessionSummary[],
          totalMessages: 10,
          totalCost: 0.05,
          totalInputTokens: 5000,
          totalOutputTokens: 200,
          models: { sonnet: 1 },
          activeSpan: "09:00 - 10:30",
        },
        {
          date: "2026-06-03",
          sessions: [] as SessionSummary[],
          totalMessages: 20,
          totalCost: 0.10,
          totalInputTokens: 10000,
          totalOutputTokens: 500,
          models: { sonnet: 1 },
          activeSpan: null,
        },
      ],
      projectRanking: [],
      total: { sessions: 5, messages: 30, cost: 0.15, inputTokens: 15000, outputTokens: 700, models: { sonnet: 3, haiku: 2 } },
    };

    const md = generateWeeklyReport(data);
    expect(md).toContain("# Weekly Report: 2026-W23");
    expect(md).toContain("| 2026-06-02 | 0 | 10 | $0.05 | 5.0K in / 200 out |");
    expect(md).toContain("| 2026-06-03 | 0 | 20 | $0.10 | 10.0K in / 500 out |");
  });
});

// ---------------------------------------------------------------------------
// generateProjectReport
// ---------------------------------------------------------------------------

describe("generateProjectReport", () => {
  it("generates report with overview and file table", () => {
    const data: ProjectReportData = {
      projectPath: "/Users/dev/myapp",
      totalSessions: 10,
      dateRange: { start: "2026-05-01", end: "2026-06-09" },
      totalCost: 2.50,
      totalInputTokens: 500000,
      totalOutputTokens: 10000,
      topModel: "claude-sonnet-4-6",
      models: { "claude-sonnet-4-6": 8, "claude-haiku-4-5": 2 },
      topFiles: [
        { filePath: "src/app.ts", editCount: 20 },
        { filePath: "src/util.ts", editCount: 10 },
      ],
      recentSessions: [],
    };

    const md = generateProjectReport(data);
    expect(md).toContain("# Project Report: /Users/dev/myapp");
    expect(md).toContain("| Total Sessions | 10 |");
    expect(md).toContain("| Cost | $2.50 (500.0K in / 10.0K out) |");
    expect(md).toContain("src/app.ts");
    expect(md).toContain("Active Period");
  });

  it("shows recent sessions with titles", () => {
    const data: ProjectReportData = {
      projectPath: "/test",
      totalSessions: 1,
      dateRange: { start: null, end: null },
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      topModel: "sonnet",
      models: {},
      topFiles: [],
      recentSessions: [
        {
          sessionId: "abc-123-def-456",
          projectPath: "/test",
          encodedDir: "-test",
          startTime: "2026-06-09T14:30:00Z",
          endTime: "2026-06-09T14:45:00Z",
          messageCounts: { user: 5, assistant: 5, system: 0, other: 0 },
          cost: { totalUSD: 0.03, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false },
          models: ["sonnet"],
          fileEdits: [],
          isCompacted: false,
          hasCustomTitle: true,
          customTitle: "Fix auth bug",
        },
      ],
    };

    const md = generateProjectReport(data);
    expect(md).toContain("Fix auth bug");
    expect(md).toContain("$0.03");
  });
});

// ---------------------------------------------------------------------------
// writeReport
// ---------------------------------------------------------------------------

describe("writeReport", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cc-session-mgr-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  it("writes to file when outputPath is provided", async () => {
    const outPath = join(testDir, "report.md");
    await writeReport("# Test Report", outPath);

    const content = await readFile(outPath, "utf-8");
    expect(content).toBe("# Test Report");
  });
});
