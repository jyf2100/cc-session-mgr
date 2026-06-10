import { describe, it, expect, beforeEach } from "vitest";
import { aggregateByDate } from "./by-date.js";
import { aggregateByWeek } from "./by-week.js";
import { aggregateByProject } from "./by-project.js";
import { extractFileEditSummary } from "./file-edits.js";
import { setTimezone, toDateStr } from "../cli/tz-utils.js";
import type { SessionSummary, JsonlEntry, DayIndexedSession, DaySlice } from "../types/index.js";

// Reset to UTC so date extraction matches the UTC timestamps in test data
beforeEach(() => {
  setTimezone("UTC");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<SessionSummary> & { sessionId: string }): SessionSummary {
  return {
    projectPath: "/home/dev/app",
    encodedDir: "-home-dev-app",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T10:30:00Z",
    messageCounts: { user: 3, assistant: 3, system: 0, other: 0 },
    cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false },
    models: ["claude-sonnet-4-6"],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    ...overrides,
  };
}

/**
 * Wrap a SessionSummary into a DayIndexedSession with a single DaySlice
 * derived from the summary's startTime. For simple (non-split) test cases.
 */
function toIndexed(summary: SessionSummary): DayIndexedSession {
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

/** Wrap summaries into DayIndexedSession[] (one slice per summary, from startTime). */
function toIndexedAll(summaries: SessionSummary[]): DayIndexedSession[] {
  return summaries.map(toIndexed);
}

// ---------------------------------------------------------------------------
// aggregateByDate
// ---------------------------------------------------------------------------

describe("aggregateByDate", () => {
  it("groups sessions by date", () => {
    const indexed = toIndexedAll([
      makeSummary({ sessionId: "a" }),
      makeSummary({ sessionId: "b" }),
      makeSummary({ sessionId: "c", startTime: "2026-06-08T09:00:00Z", endTime: "2026-06-08T09:30:00Z" }),
    ]);

    const groups = aggregateByDate(indexed);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe("2026-06-08");
    expect(groups[0].sessions).toHaveLength(1);
    expect(groups[1].date).toBe("2026-06-09");
    expect(groups[1].sessions).toHaveLength(2);
  });

  it("filters by date range", () => {
    const indexed = toIndexedAll([
      makeSummary({ sessionId: "a", startTime: "2026-06-07T10:00:00Z" }),
      makeSummary({ sessionId: "b", startTime: "2026-06-08T10:00:00Z" }),
      makeSummary({ sessionId: "c", startTime: "2026-06-09T10:00:00Z" }),
    ]);

    const groups = aggregateByDate(indexed, { start: "2026-06-08", end: "2026-06-08" });
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe("2026-06-08");
  });

  it("computes total messages and cost per day from slices", () => {
    const indexed = toIndexedAll([
      makeSummary({ sessionId: "a" }),
      makeSummary({ sessionId: "b", cost: { totalUSD: 0.03, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false } }),
    ]);

    const groups = aggregateByDate(indexed);
    expect(groups[0].totalMessages).toBe(12);
    expect(groups[0].totalCost).toBeCloseTo(0.08, 2);
  });

  it("computes model distribution from slices", () => {
    const indexed = toIndexedAll([
      makeSummary({ sessionId: "a", models: ["sonnet"] }),
      makeSummary({ sessionId: "b", models: ["sonnet", "haiku"] }),
    ]);

    const groups = aggregateByDate(indexed);
    expect(groups[0].models).toEqual({ sonnet: 2, haiku: 1 });
  });

  it("includes a multi-day session in multiple date groups", () => {
    const summary = makeSummary({
      sessionId: "multi",
      startTime: "2026-06-09T22:00:00Z",
      endTime: "2026-06-10T02:00:00Z",
    });
    const indexed: DayIndexedSession[] = [{
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

    const groups = aggregateByDate(indexed);

    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe("2026-06-09");
    expect(groups[0].sessions).toHaveLength(1);
    expect(groups[0].totalMessages).toBe(4);
    expect(groups[0].totalCost).toBe(0.04);

    expect(groups[1].date).toBe("2026-06-10");
    expect(groups[1].sessions).toHaveLength(1);
    expect(groups[1].totalMessages).toBe(2);
    expect(groups[1].totalCost).toBe(0.01);
  });
});

// ---------------------------------------------------------------------------
// aggregateByWeek
// ---------------------------------------------------------------------------

describe("aggregateByWeek", () => {
  it("groups sessions by ISO week", () => {
    const indexed = toIndexedAll([
      makeSummary({ sessionId: "a", startTime: "2026-06-08T10:00:00Z" }),
      makeSummary({ sessionId: "b", startTime: "2026-06-09T10:00:00Z" }),
    ]);

    const weeks = aggregateByWeek(indexed);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].totalSessions).toBe(2);
  });

  it("filters by specific week", () => {
    const indexed = toIndexedAll([
      makeSummary({ sessionId: "a", startTime: "2026-06-01T10:00:00Z" }),
      makeSummary({ sessionId: "b", startTime: "2026-06-08T10:00:00Z" }),
    ]);

    const weeks = aggregateByWeek(indexed, { year: 2026, week: 24 });
    expect(weeks.length).toBeLessThanOrEqual(1);
  });

  it("deduplicates session counts when session spans multiple days in same week", () => {
    const summary = makeSummary({
      sessionId: "multi",
      startTime: "2026-06-09T22:00:00Z",
      endTime: "2026-06-10T02:00:00Z",
    });
    const indexed: DayIndexedSession[] = [{
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

    const weeks = aggregateByWeek(indexed);

    // Both June 9 and June 10 2026 are in ISO week 24
    expect(weeks).toHaveLength(1);
    // Same session in two days but counted once
    expect(weeks[0].totalSessions).toBe(1);
    expect(weeks[0].days).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// aggregateByProject
// ---------------------------------------------------------------------------

describe("aggregateByProject", () => {
  it("groups sessions by project path", () => {
    const summaries = [
      makeSummary({ sessionId: "a", projectPath: "/Users/dev/app" }),
      makeSummary({ sessionId: "b", projectPath: "/Users/dev/app" }),
      makeSummary({ sessionId: "c", projectPath: "/Users/dev/api" }),
    ];

    const groups = aggregateByProject(summaries);
    expect(groups).toHaveLength(2);
    expect(groups[0].projectPath).toBe("/Users/dev/app");
    expect(groups[0].sessions).toHaveLength(2);
  });

  it("filters by project name substring", () => {
    const summaries = [
      makeSummary({ sessionId: "a", projectPath: "/Users/dev/my-app" }),
      makeSummary({ sessionId: "b", projectPath: "/Users/dev/api-server" }),
    ];

    const groups = aggregateByProject(summaries, "my-app");
    expect(groups).toHaveLength(1);
    expect(groups[0].projectPath).toBe("/Users/dev/my-app");
  });

  it("merges file edits across sessions", () => {
    const summaries = [
      makeSummary({
        sessionId: "a",
        fileEdits: [{ filePath: "src/app.ts", editCount: 2 }],
      }),
      makeSummary({
        sessionId: "b",
        fileEdits: [
          { filePath: "src/app.ts", editCount: 3 },
          { filePath: "src/util.ts", editCount: 1 },
        ],
      }),
    ];

    const groups = aggregateByProject(summaries);
    expect(groups[0].topFiles[0]).toEqual({ filePath: "src/app.ts", editCount: 5 });
    expect(groups[0].topFiles[1]).toEqual({ filePath: "src/util.ts", editCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// extractFileEditSummary
// ---------------------------------------------------------------------------

describe("extractFileEditSummary", () => {
  it("extracts file paths from Write and Edit tool_use blocks", () => {
    const entries: JsonlEntry[] = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Write", input: { file_path: "src/a.ts" } },
            { type: "tool_use", name: "Edit", input: { file_path: "src/b.ts" } },
          ],
        },
      },
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Write", input: { file_path: "src/a.ts" } },
          ],
        },
      },
    ];

    const edits = extractFileEditSummary(entries);
    expect(edits).toEqual([
      { filePath: "src/a.ts", editCount: 2 },
      { filePath: "src/b.ts", editCount: 1 },
    ]);
  });

  it("returns empty array for no edits", () => {
    const edits = extractFileEditSummary([{ type: "user" }]);
    expect(edits).toEqual([]);
  });
});
