import { describe, it, expect } from "vitest";
import { aggregateByDate } from "./by-date.js";
import { aggregateByWeek } from "./by-week.js";
import { aggregateByProject } from "./by-project.js";
import { extractFileEditSummary } from "./file-edits.js";
import type { SessionSummary, JsonlEntry } from "../types/index.js";

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

// ---------------------------------------------------------------------------
// aggregateByDate
// ---------------------------------------------------------------------------

describe("aggregateByDate", () => {
  it("groups sessions by date", () => {
    const summaries = [
      makeSummary({ sessionId: "a" }),
      makeSummary({ sessionId: "b" }),
      makeSummary({ sessionId: "c", startTime: "2026-06-08T09:00:00Z", endTime: "2026-06-08T09:30:00Z" }),
    ];

    const groups = aggregateByDate(summaries);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe("2026-06-08");
    expect(groups[0].sessions).toHaveLength(1);
    expect(groups[1].date).toBe("2026-06-09");
    expect(groups[1].sessions).toHaveLength(2);
  });

  it("filters by date range", () => {
    const summaries = [
      makeSummary({ sessionId: "a", startTime: "2026-06-07T10:00:00Z" }),
      makeSummary({ sessionId: "b", startTime: "2026-06-08T10:00:00Z" }),
      makeSummary({ sessionId: "c", startTime: "2026-06-09T10:00:00Z" }),
    ];

    const groups = aggregateByDate(summaries, { start: "2026-06-08", end: "2026-06-08" });
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe("2026-06-08");
  });

  it("computes total messages and cost per day", () => {
    const summaries = [
      makeSummary({ sessionId: "a" }),
      makeSummary({ sessionId: "b", cost: { totalUSD: 0.03, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false } }),
    ];

    const groups = aggregateByDate(summaries);
    expect(groups[0].totalMessages).toBe(12);
    expect(groups[0].totalCost).toBeCloseTo(0.08, 2);
  });

  it("computes model distribution", () => {
    const summaries = [
      makeSummary({ sessionId: "a", models: ["sonnet"] }),
      makeSummary({ sessionId: "b", models: ["sonnet", "haiku"] }),
    ];

    const groups = aggregateByDate(summaries);
    expect(groups[0].models).toEqual({ sonnet: 2, haiku: 1 });
  });
});

// ---------------------------------------------------------------------------
// aggregateByWeek
// ---------------------------------------------------------------------------

describe("aggregateByWeek", () => {
  it("groups sessions by ISO week", () => {
    const summaries = [
      makeSummary({ sessionId: "a", startTime: "2026-06-08T10:00:00Z" }),
      makeSummary({ sessionId: "b", startTime: "2026-06-09T10:00:00Z" }),
    ];

    const weeks = aggregateByWeek(summaries);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].totalSessions).toBe(2);
  });

  it("filters by specific week", () => {
    const summaries = [
      makeSummary({ sessionId: "a", startTime: "2026-06-01T10:00:00Z" }),
      makeSummary({ sessionId: "b", startTime: "2026-06-08T10:00:00Z" }),
    ];

    const weeks = aggregateByWeek(summaries, { year: 2026, week: 24 });
    expect(weeks.length).toBeLessThanOrEqual(1);
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
