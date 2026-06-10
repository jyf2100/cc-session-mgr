import { describe, it, expect, beforeEach } from "vitest";
import type { SessionWorkSummary, WorkContent, DayIndexedWorkSession, DaySlice } from "../types/index.js";
import { aggregateWorkByDate } from "./work-by-date.js";
import { aggregateWorkByWeek, aggregateWorkByProject } from "./work-by-week.js";
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

/**
 * Wrap a SessionWorkSummary into a DayIndexedWorkSession with a single DaySlice
 * derived from the summary's startTime.
 */
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

/** Wrap summaries into DayIndexedWorkSession[] (one slice per summary, from startTime). */
function toIndexedAll(summaries: SessionWorkSummary[]): DayIndexedWorkSession[] {
  return summaries.map(toIndexed);
}

// ---------------------------------------------------------------------------
// aggregateWorkByDate
// ---------------------------------------------------------------------------

describe("aggregateWorkByDate", () => {
  it("groups sessions by date", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({ startTime: "2026-06-07T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-06-07T14:00:00Z", projectPath: "/proj/b" }),
      makeWorkSummary({ startTime: "2026-06-09T09:00:00Z", projectPath: "/proj/a" }),
    ]);

    const result = aggregateWorkByDate(indexed);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-06-07");
    expect(result[0].sessionCount).toBe(2);
    expect(result[1].date).toBe("2026-06-09");
    expect(result[1].sessionCount).toBe(1);
  });

  it("groups by project within each date", () => {
    const indexed = toIndexedAll([
      makeWorkSummary({ startTime: "2026-06-07T10:00:00Z", projectPath: "/proj/a" }),
      makeWorkSummary({ startTime: "2026-06-07T14:00:00Z", projectPath: "/proj/b" }),
      makeWorkSummary({ startTime: "2026-06-07T16:00:00Z", projectPath: "/proj/a" }),
    ]);

    const result = aggregateWorkByDate(indexed);

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
    const indexed = toIndexedAll([
      makeWorkSummary({ startTime: "2026-06-07T10:00:00Z" }),
      makeWorkSummary({ startTime: "2026-06-08T10:00:00Z" }),
      makeWorkSummary({ startTime: "2026-06-09T10:00:00Z" }),
    ]);

    const result = aggregateWorkByDate(indexed, {
      start: "2026-06-08",
      end: "2026-06-08",
    });

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-06-08");
  });

  it("includes a multi-day session in multiple date groups", () => {
    const summary = makeWorkSummary({
      sessionId: "multi-day",
      startTime: "2026-06-09T22:00:00Z",
      projectPath: "/proj/cross",
    });
    const indexed: DayIndexedWorkSession[] = [{
      summary,
      daySlices: [
        {
          date: "2026-06-09",
          messageCounts: { user: 2, assistant: 2, system: 0, other: 0 },
          cost: 0.04,
          inputTokens: 50,
          outputTokens: 100,
          models: ["sonnet"],
          fileEdits: [],
          entryCount: 4,
        },
        {
          date: "2026-06-10",
          messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
          cost: 0.01,
          inputTokens: 20,
          outputTokens: 30,
          models: ["sonnet"],
          fileEdits: [],
          entryCount: 2,
        },
      ],
    }];

    const result = aggregateWorkByDate(indexed);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-06-09");
    expect(result[0].sessionCount).toBe(1);
    expect(result[0].projects[0].sessions[0].sessionId).toBe("multi-day");

    expect(result[1].date).toBe("2026-06-10");
    expect(result[1].sessionCount).toBe(1);
    expect(result[1].projects[0].sessions[0].sessionId).toBe("multi-day");
  });

  it("filters multi-day session by date range correctly", () => {
    const summary = makeWorkSummary({
      sessionId: "multi-filter",
      startTime: "2026-06-09T22:00:00Z",
    });
    const indexed: DayIndexedWorkSession[] = [{
      summary,
      daySlices: [
        {
          date: "2026-06-09",
          messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
          cost: 0.04,
          inputTokens: 50,
          outputTokens: 100,
          models: [],
          fileEdits: [],
          entryCount: 2,
        },
        {
          date: "2026-06-10",
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

    // Only ask for June 10
    const result = aggregateWorkByDate(indexed, { start: "2026-06-10", end: "2026-06-10" });

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-06-10");
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
    // totalSessions is deduplicated from actual sessions (projects are empty → 0)
    expect(result[0].totalSessions).toBe(0);
  });

  it("splits across ISO week boundary", () => {
    const dailyData = [
      { date: "2026-06-07", projects: [], sessionCount: 1 },
      { date: "2026-06-08", projects: [], sessionCount: 2 },
    ] as import("../types/index.js").WorkDailyData[];

    const result = aggregateWorkByWeek(dailyData);

    expect(result).toHaveLength(2);
    expect(result[0].weekLabel).toBe("2026-W23");
    expect(result[0].totalSessions).toBe(0);
    expect(result[1].weekLabel).toBe("2026-W24");
    expect(result[1].totalSessions).toBe(0);
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

// ---------------------------------------------------------------------------
// aggregateWorkByProject
// ---------------------------------------------------------------------------

describe("aggregateWorkByProject", () => {
  it("flattens days into project groups", () => {
    const s1 = makeWorkSummary({ startTime: "2026-06-08T10:00:00Z", projectPath: "/proj/a" });
    const s2 = makeWorkSummary({ startTime: "2026-06-08T14:00:00Z", projectPath: "/proj/b" });
    const s3 = makeWorkSummary({ startTime: "2026-06-09T10:00:00Z", projectPath: "/proj/a" });

    const weekly = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      totalSessions: 3,
      days: [
        {
          date: "2026-06-08",
          sessionCount: 2,
          projects: [
            { projectName: "/proj/a", sessions: [s1] },
            { projectName: "/proj/b", sessions: [s2] },
          ],
        },
        {
          date: "2026-06-09",
          sessionCount: 1,
          projects: [
            { projectName: "/proj/a", sessions: [s3] },
          ],
        },
      ],
    } as import("../types/index.js").WorkWeeklyData;

    const result = aggregateWorkByProject(weekly);

    expect(result.weekLabel).toBe("2026-W24");
    expect(result.startDate).toBe("2026-06-08");
    expect(result.endDate).toBe("2026-06-14");
    expect(result.totalSessions).toBe(3);
    expect(result.projects).toHaveLength(2);

    // Most active first
    const projA = result.projects.find((p) => p.projectName === "/proj/a")!;
    const projB = result.projects.find((p) => p.projectName === "/proj/b")!;

    expect(projA.sessions).toHaveLength(2);
    expect(projB.sessions).toHaveLength(1);
    expect(result.projects[0]).toBe(projA); // sorted by count desc
  });

  it("deduplicates sessions that appear in multiple days", () => {
    // Same session appears on two different days (cross-midnight session)
    const crossSession = makeWorkSummary({
      sessionId: "cross-midnight",
      startTime: "2026-06-08T22:00:00Z",
      projectPath: "/proj/cross",
    });

    const weekly = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      totalSessions: 2,
      days: [
        {
          date: "2026-06-08",
          sessionCount: 1,
          projects: [{ projectName: "/proj/cross", sessions: [crossSession] }],
        },
        {
          date: "2026-06-09",
          sessionCount: 1,
          projects: [{ projectName: "/proj/cross", sessions: [crossSession] }],
        },
      ],
    } as import("../types/index.js").WorkWeeklyData;

    const result = aggregateWorkByProject(weekly);

    expect(result.projects).toHaveLength(1);
    // Same session in two days but only counted once
    expect(result.projects[0].sessions).toHaveLength(1);
    expect(result.projects[0].sessions[0].sessionId).toBe("cross-midnight");
  });

  it("sorts projects by session count descending", () => {
    const s1 = makeWorkSummary({ startTime: "2026-06-08T10:00:00Z", projectPath: "/proj/small" });
    const s2 = makeWorkSummary({ startTime: "2026-06-08T11:00:00Z", projectPath: "/proj/big" });
    const s3 = makeWorkSummary({ startTime: "2026-06-09T10:00:00Z", projectPath: "/proj/big" });

    const weekly = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      totalSessions: 3,
      days: [
        {
          date: "2026-06-08",
          sessionCount: 2,
          projects: [
            { projectName: "/proj/small", sessions: [s1] },
            { projectName: "/proj/big", sessions: [s2] },
          ],
        },
        {
          date: "2026-06-09",
          sessionCount: 1,
          projects: [
            { projectName: "/proj/big", sessions: [s3] },
          ],
        },
      ],
    } as import("../types/index.js").WorkWeeklyData;

    const result = aggregateWorkByProject(weekly);

    expect(result.projects).toHaveLength(2);
    expect(result.projects[0].projectName).toBe("/proj/big");
    expect(result.projects[0].sessions).toHaveLength(2);
    expect(result.projects[1].projectName).toBe("/proj/small");
    expect(result.projects[1].sessions).toHaveLength(1);
  });

  it("initializes projectSummary as null", () => {
    const s1 = makeWorkSummary({ startTime: "2026-06-08T10:00:00Z", projectPath: "/proj/a" });

    const weekly = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      totalSessions: 1,
      days: [
        {
          date: "2026-06-08",
          sessionCount: 1,
          projects: [{ projectName: "/proj/a", sessions: [s1] }],
        },
      ],
    } as import("../types/index.js").WorkWeeklyData;

    const result = aggregateWorkByProject(weekly);

    expect(result.projects[0].projectSummary).toBeNull();
  });

  it("handles weekly data with no days", () => {
    const weekly = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      totalSessions: 0,
      days: [],
    } as import("../types/index.js").WorkWeeklyData;

    const result = aggregateWorkByProject(weekly);

    expect(result.projects).toEqual([]);
    expect(result.totalSessions).toBe(0);
  });
});
