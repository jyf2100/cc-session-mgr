import { describe, it, expect } from "vitest";
import type { SessionWorkSummary, WorkContent } from "../types/index.js";
import { aggregateWorkByDate } from "./work-by-date.js";
import { aggregateWorkByWeek } from "./work-by-week.js";

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
      totalUSD: 0,
      source: "inline",
      incomplete: false,
      inputTokens: 0,
      outputTokens: 0,
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

// ---------------------------------------------------------------------------
// aggregateWorkByDate
// ---------------------------------------------------------------------------

describe("aggregateWorkByDate", () => {
  it("groups sessions by date", () => {
    const summaries = [
      makeWorkSummary({ startTime: "2026-06-07T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-06-07T14:00:00Z", projectPath: "/proj/b" }),
      makeWorkSummary({ startTime: "2026-06-09T09:00:00Z", projectPath: "/proj/a" }),
    ];

    const result = aggregateWorkByDate(summaries);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-06-07");
    expect(result[0].sessionCount).toBe(2);
    expect(result[1].date).toBe("2026-06-09");
    expect(result[1].sessionCount).toBe(1);
  });

  it("groups by project within each date", () => {
    const summaries = [
      makeWorkSummary({ startTime: "2026-06-07T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-06-07T14:00:00Z", projectPath: "/proj/b" }),
      makeWorkSummary({ startTime: "2026-06-07T16:00:00Z", projectPath: "/proj/a" }),
    ];

    const result = aggregateWorkByDate(summaries);

    expect(result).toHaveLength(1);
    expect(result[0].projects).toHaveLength(2);
    expect(result[0].projects[0].projectName).toBe("/proj/a");
    expect(result[0].projects[0].sessions).toHaveLength(2);
    expect(result[0].projects[1].projectName).toBe("/proj/b");
    expect(result[0].projects[1].sessions).toHaveLength(1);
  });

  it("returns empty array for no sessions", () => {
    const result = aggregateWorkByDate([]);
    expect(result).toEqual([]);
  });

  it("filters by date range", () => {
    const summaries = [
      makeWorkSummary({ startTime: "2026-06-07T10:00:00Z" }),
      makeWorkSummary({ startTime: "2026-06-08T10:00:00Z" }),
      makeWorkSummary({ startTime: "2026-06-09T10:00:00Z" }),
    ];

    const result = aggregateWorkByDate(summaries, {
      start: "2026-06-08",
      end: "2026-06-08",
    });

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-06-08");
  });

  it("skips sessions with null startTime", () => {
    const summaries = [
      makeWorkSummary({ startTime: "2026-06-07T10:00:00Z" }),
      { ...makeWorkSummary({ startTime: "2026-06-07T10:00:00Z" }), startTime: null },
    ];

    const result = aggregateWorkByDate(summaries);
    expect(result).toHaveLength(1);
    expect(result[0].sessionCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// aggregateWorkByWeek
// ---------------------------------------------------------------------------

describe("aggregateWorkByWeek", () => {
  it("groups daily data by ISO week", () => {
    const dailyData = [
      { date: "2026-06-08", projects: [], sessionCount: 2 },
      { date: "2026-06-10", projects: [], sessionCount: 3 },
      { date: "2026-06-12", projects: [], sessionCount: 1 },
    ] as import("../types/index.js").WorkDailyData[];

    const result = aggregateWorkByWeek(dailyData);

    expect(result).toHaveLength(1);
    expect(result[0].weekLabel).toBe("2026-W24");
    expect(result[0].days).toHaveLength(3);
    expect(result[0].totalSessions).toBe(6);
  });

  it("splits across ISO week boundary", () => {
    const dailyData = [
      { date: "2026-06-07", projects: [], sessionCount: 1 },
      { date: "2026-06-08", projects: [], sessionCount: 2 },
    ] as import("../types/index.js").WorkDailyData[];

    const result = aggregateWorkByWeek(dailyData);

    expect(result).toHaveLength(2);
    expect(result[0].weekLabel).toBe("2026-W23");
    expect(result[0].totalSessions).toBe(1);
    expect(result[1].weekLabel).toBe("2026-W24");
    expect(result[1].totalSessions).toBe(2);
  });

  it("returns empty array for no daily data", () => {
    const result = aggregateWorkByWeek([]);
    expect(result).toEqual([]);
  });

  it("filters by specific week", () => {
    const dailyData = [
      { date: "2026-06-07", projects: [], sessionCount: 1 },
      { date: "2026-06-08", projects: [], sessionCount: 2 },
      { date: "2026-06-09", projects: [], sessionCount: 3 },
    ] as import("../types/index.js").WorkDailyData[];

    const result = aggregateWorkByWeek(dailyData, { year: 2026, week: 24 });

    expect(result).toHaveLength(1);
    expect(result[0].weekLabel).toBe("2026-W24");
  });
});
