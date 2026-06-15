import { describe, it, expect, beforeEach } from "vitest";
import type { SessionWorkSummary, WorkContent, DayIndexedWorkSession, DaySlice } from "../types/index.js";
import { aggregateWorkByRange, buildMonthlyReportData, buildQuarterlyReportData } from "./work-by-range.js";
import { setTimezone, toDateStr } from "../cli/tz-utils.js";

// Reset to UTC so date extraction matches the UTC timestamps in test data
beforeEach(() => {
  setTimezone("UTC");
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWorkContent(overrides?: Partial<WorkContent>): WorkContent {
  return {
    primaryIntent: "Test intent",
    toolCallSummary: {},
    bashCommands: [],
    moduleSummary: [],
    assistantSnippets: [],
    compactedSummary: null,
    userIntents: [],
    llmSummary: null,
    ...overrides,
  };
}

function makeWorkSummary(
  overrides: Partial<SessionWorkSummary> & { startTime: string },
): SessionWorkSummary {
  return {
    sessionId: `session-${Math.random().toString(36).slice(2, 8)}`,
    projectPath: "/project/test",
    encodedDir: "-project-test",
    endTime: overrides.startTime,
    messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
    cost: {
      totalUSD: 0.05,
      source: "inline",
      incomplete: false,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: [],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    workContent: makeWorkContent(),
    ...overrides,
  };
}

function toIndexed(summary: SessionWorkSummary): DayIndexedWorkSession {
  const date = toDateStr(summary.startTime) ?? "1970-01-01";
  const slice: DaySlice = {
    date,
    messageCounts: { ...summary.messageCounts },
    cost: summary.cost.totalUSD,
    inputTokens: summary.cost.inputTokens,
    outputTokens: summary.cost.outputTokens,
    models: [...summary.models],
    fileEdits: [...summary.fileEdits],
    entryCount: summary.messageCounts.user + summary.messageCounts.assistant + summary.messageCounts.system,
  };
  return { summary, daySlices: [slice] };
}

function toIndexedAll(summaries: SessionWorkSummary[]): DayIndexedWorkSession[] {
  return summaries.map(toIndexed);
}

// ---------------------------------------------------------------------------
// aggregateWorkByRange
// ---------------------------------------------------------------------------

describe("aggregateWorkByRange", () => {
  it("returns null when no sessions in range", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({ startTime: "2026-05-15T10:00:00Z" }),
    ]);

    const result = aggregateWorkByRange(
      indexed,
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );

    expect(result).toBeNull();
  });

  it("returns null for empty input", () => {
    const result = aggregateWorkByRange(
      [],
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );

    expect(result).toBeNull();
  });

  it("groups sessions by project across the range", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({ startTime: "2026-06-01T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-06-10T10:00:00Z", projectPath: "/proj/b" }),
      makeWorkSummary({ startTime: "2026-06-20T10:00:00Z", projectPath: "/proj/a" }),
    ]);

    const result = aggregateWorkByRange(
      indexed,
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );

    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);

    // Sorted by session count desc
    const projA = result!.find((p) => p.projectName === "/proj/a")!;
    const projB = result!.find((p) => p.projectName === "/proj/b")!;

    expect(projA.sessions).toHaveLength(2);
    expect(projB.sessions).toHaveLength(1);
    expect(result![0]).toBe(projA);
  });

  it("deduplicates sessions by sessionId", () => {
    const session = makeWorkSummary({
      sessionId: "dup-session",
      startTime: "2026-06-05T10:00:00Z",
      projectPath: "/proj/a",
    });

    // Same session on two different days (multi-day session)
    const date1 = toDateStr(session.startTime)!;
    const date2 = "2026-06-06";
    const indexed: DayIndexedWorkSession[] = [{
      summary: session,
      daySlices: [
        {
          date: date1,
          messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
          cost: 0.04,
          inputTokens: 50,
          outputTokens: 100,
          models: [],
          fileEdits: [],
          entryCount: 2,
        },
        {
          date: date2,
          messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
          cost: 0.01,
          inputTokens: 20,
          outputTokens: 30,
          models: [],
          fileEdits: [],
          entryCount: 2,
        },
      ],
    }];

    const result = aggregateWorkByRange(
      indexed,
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );

    expect(result).not.toBeNull();
    expect(result![0].sessions).toHaveLength(1);
  });

  it("computes weekly breakdown buckets for monthly range", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({ startTime: "2026-06-01T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-06-08T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-06-15T10:00:00Z", projectPath: "/proj/a" }),
    ]);

    const result = aggregateWorkByRange(
      indexed,
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );

    expect(result).not.toBeNull();
    const proj = result![0];

    // Should have breakdown buckets for the weeks with activity
    expect(proj.breakdown.length).toBeGreaterThanOrEqual(2);

    // Each bucket should have label, dates, and session count
    for (const bucket of proj.breakdown) {
      expect(bucket.label).toMatch(/^2026-W\d{2}$/);
      expect(bucket.startDate).toBeTruthy();
      expect(bucket.endDate).toBeTruthy();
      expect(bucket.sessionCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("computes monthly breakdown buckets for quarterly range", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({ startTime: "2026-04-10T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-05-15T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-06-20T10:00:00Z", projectPath: "/proj/a" }),
    ]);

    const result = aggregateWorkByRange(
      indexed,
      { start: "2026-04-01", end: "2026-06-30" },
      "monthly",
    );

    expect(result).not.toBeNull();
    const proj = result![0];

    // Should have 3 monthly buckets (April, May, June)
    expect(proj.breakdown).toHaveLength(3);
    expect(proj.breakdown[0].label).toBe("2026-04");
    expect(proj.breakdown[1].label).toBe("2026-05");
    expect(proj.breakdown[2].label).toBe("2026-06");
  });

  it("extracts top files merged across sessions", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({
        startTime: "2026-06-05T10:00:00Z",
        projectPath: "/proj/a",
        fileEdits: [
          { filePath: "src/a.ts", editCount: 5 },
          { filePath: "src/b.ts", editCount: 3 },
        ],
      }),
      makeWorkSummary({
        startTime: "2026-06-10T10:00:00Z",
        projectPath: "/proj/a",
        fileEdits: [
          { filePath: "src/a.ts", editCount: 2 },
          { filePath: "src/c.ts", editCount: 10 },
        ],
      }),
    ]);

    const result = aggregateWorkByRange(
      indexed,
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );

    expect(result).not.toBeNull();
    const topFiles = result![0].topFiles;

    // Merged: a.ts=7, c.ts=10, b.ts=3 — sorted desc
    expect(topFiles[0]).toEqual({ filePath: "src/c.ts", editCount: 10 });
    expect(topFiles[1]).toEqual({ filePath: "src/a.ts", editCount: 7 });
    expect(topFiles[2]).toEqual({ filePath: "src/b.ts", editCount: 3 });
  });

  it("computes total cost and tokens per project", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({
        startTime: "2026-06-05T10:00:00Z",
        projectPath: "/proj/a",
        cost: {
          totalUSD: 0.10,
          source: "inline",
          incomplete: false,
          inputTokens: 200,
          outputTokens: 100,
          cacheReadTokens: 0,
          isEstimated: false,
        },
      }),
      makeWorkSummary({
        startTime: "2026-06-10T10:00:00Z",
        projectPath: "/proj/a",
        cost: {
          totalUSD: 0.05,
          source: "inline",
          incomplete: false,
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          isEstimated: false,
        },
      }),
    ]);

    const result = aggregateWorkByRange(
      indexed,
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );

    expect(result).not.toBeNull();
    const proj = result![0];
    expect(proj.totalCost).toBe(0.15);
    expect(proj.totalInputTokens).toBe(300);
    expect(proj.totalOutputTokens).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// buildMonthlyReportData
// ---------------------------------------------------------------------------

describe("buildMonthlyReportData", () => {
  it("builds correct data structure", () => {
    const data = buildMonthlyReportData(2026, 6, null);

    expect(data.year).toBe(2026);
    expect(data.month).toBe(6);
    expect(data.label).toBe("2026-06");
    expect(data.startDate).toBe("2026-06-01");
    expect(data.endDate).toBe("2026-06-30");
    expect(data.projects).toEqual([]);
    expect(data.totalSessions).toBe(0);
    expect(data.totalCost).toBe(0);
  });

  it("handles February in non-leap year", () => {
    const data = buildMonthlyReportData(2025, 2, null);
    expect(data.endDate).toBe("2025-02-28");
  });

  it("handles February in leap year", () => {
    const data = buildMonthlyReportData(2024, 2, null);
    expect(data.endDate).toBe("2024-02-29");
  });

  it("sums sessions and cost from projects", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({
        sessionId: "s1",
        startTime: "2026-06-05T10:00:00Z",
        projectPath: "/proj/a",
        cost: {
          totalUSD: 0.20,
          source: "inline",
          incomplete: false,
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          isEstimated: false,
        },
      }),
      makeWorkSummary({
        sessionId: "s2",
        startTime: "2026-06-10T10:00:00Z",
        projectPath: "/proj/b",
        cost: {
          totalUSD: 0.10,
          source: "inline",
          incomplete: false,
          inputTokens: 50,
          outputTokens: 25,
          cacheReadTokens: 0,
          isEstimated: false,
        },
      }),
    ]);

    const projects = aggregateWorkByRange(
      indexed,
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );

    const data = buildMonthlyReportData(2026, 6, projects);

    expect(data.totalSessions).toBe(2);
    expect(data.totalCost).toBe(0.3);
    expect(data.projects).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildQuarterlyReportData
// ---------------------------------------------------------------------------

describe("buildQuarterlyReportData", () => {
  it("builds correct data structure for Q2", () => {
    const data = buildQuarterlyReportData(2026, 2, null);

    expect(data.year).toBe(2026);
    expect(data.quarter).toBe(2);
    expect(data.label).toBe("2026-Q2");
    expect(data.startDate).toBe("2026-04-01");
    expect(data.endDate).toBe("2026-06-30");
    expect(data.projects).toEqual([]);
    expect(data.totalSessions).toBe(0);
    expect(data.totalCost).toBe(0);
  });

  it("computes correct date range for Q1", () => {
    const data = buildQuarterlyReportData(2026, 1, null);
    expect(data.startDate).toBe("2026-01-01");
    expect(data.endDate).toBe("2026-03-31");
  });

  it("computes correct date range for Q4", () => {
    const data = buildQuarterlyReportData(2026, 4, null);
    expect(data.startDate).toBe("2026-10-01");
    expect(data.endDate).toBe("2026-12-31");
  });
});
