import { describe, it, expect, beforeEach } from "vitest";
import { splitSessionByDay } from "./day-splitter.js";
import { setTimezone } from "../cli/tz-utils.js";
import type { JsonlEntry, SessionSummary } from "../types/index.js";

// Reset to UTC so date extraction matches UTC timestamps in test data
beforeEach(() => {
  setTimezone("UTC");
});

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "test-session",
    projectPath: "/home/dev/app",
    encodedDir: "-home-dev-app",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T12:00:00Z",
    messageCounts: { user: 3, assistant: 3, system: 0, other: 0 },
    cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
    models: ["claude-sonnet-4-6"],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<JsonlEntry> = {}): JsonlEntry {
  return {
    type: "user",
    timestamp: "2026-06-09T10:00:00Z",
    ...overrides,
  };
}

describe("splitSessionByDay", () => {
  it("produces one slice for a single-day session", () => {
    const summary = makeSummary();
    const entries: JsonlEntry[] = [
      makeEntry({ type: "user", timestamp: "2026-06-09T10:00:00Z" }),
      makeEntry({ type: "assistant", timestamp: "2026-06-09T10:01:00Z", model: "claude-sonnet-4-6" }),
      makeEntry({ type: "user", timestamp: "2026-06-09T11:00:00Z" }),
    ];

    const slices = splitSessionByDay(entries, summary);

    expect(slices).toHaveLength(1);
    expect(slices[0].date).toBe("2026-06-09");
    expect(slices[0].entryCount).toBe(3);
    expect(slices[0].messageCounts.user).toBe(2);
    expect(slices[0].messageCounts.assistant).toBe(1);
  });

  it("splits entries across two days", () => {
    const summary = makeSummary({
      startTime: "2026-06-09T22:00:00Z",
      endTime: "2026-06-10T02:00:00Z",
    });
    const entries: JsonlEntry[] = [
      makeEntry({ type: "user", timestamp: "2026-06-09T22:00:00Z" }),
      makeEntry({ type: "assistant", timestamp: "2026-06-09T22:30:00Z", costUSD: 0.03 }),
      makeEntry({ type: "user", timestamp: "2026-06-10T01:00:00Z" }),
      makeEntry({ type: "assistant", timestamp: "2026-06-10T01:30:00Z", costUSD: 0.02 }),
    ];

    const slices = splitSessionByDay(entries, summary);

    expect(slices).toHaveLength(2);

    expect(slices[0].date).toBe("2026-06-09");
    expect(slices[0].messageCounts.user).toBe(1);
    expect(slices[0].messageCounts.assistant).toBe(1);
    expect(slices[0].cost).toBe(0.03);
    expect(slices[0].entryCount).toBe(2);

    expect(slices[1].date).toBe("2026-06-10");
    expect(slices[1].messageCounts.user).toBe(1);
    expect(slices[1].messageCounts.assistant).toBe(1);
    expect(slices[1].cost).toBe(0.02);
    expect(slices[1].entryCount).toBe(2);
  });

  it("respects timezone for midnight boundary", () => {
    setTimezone("Asia/Shanghai");

    const summary = makeSummary({
      startTime: "2026-06-09T16:00:00Z",
    });
    const entries: JsonlEntry[] = [
      makeEntry({ type: "user", timestamp: "2026-06-09T15:30:00Z" }),
      makeEntry({ type: "user", timestamp: "2026-06-09T16:30:00Z" }),
    ];

    const slices = splitSessionByDay(entries, summary);

    expect(slices).toHaveLength(2);
    expect(slices[0].date).toBe("2026-06-09");
    expect(slices[1].date).toBe("2026-06-10");

    setTimezone("UTC");
  });

  it("falls back to session startTime for entries without timestamp", () => {
    const summary = makeSummary({
      startTime: "2026-06-09T10:00:00Z",
    });
    const entries: JsonlEntry[] = [
      makeEntry({ type: "user" }),
      makeEntry({ type: "user", timestamp: "2026-06-09T12:00:00Z" }),
    ];

    const slices = splitSessionByDay(entries, summary);

    expect(slices).toHaveLength(1);
    expect(slices[0].date).toBe("2026-06-09");
    expect(slices[0].entryCount).toBe(2);
  });

  it("splits cost across days based on entry-level costUSD", () => {
    const summary = makeSummary({
      startTime: "2026-06-09T20:00:00Z",
    });
    const entries: JsonlEntry[] = [
      makeEntry({ type: "user", timestamp: "2026-06-09T20:00:00Z" }),
      makeEntry({ type: "assistant", timestamp: "2026-06-09T20:30:00Z", costUSD: 0.10 }),
      makeEntry({ type: "user", timestamp: "2026-06-10T01:00:00Z" }),
      makeEntry({ type: "assistant", timestamp: "2026-06-10T01:30:00Z", costUSD: 0.05 }),
    ];

    const slices = splitSessionByDay(entries, summary);

    expect(slices[0].cost).toBe(0.10);
    expect(slices[1].cost).toBe(0.05);
  });

  it("extracts models per day", () => {
    const summary = makeSummary();
    const entries: JsonlEntry[] = [
      makeEntry({ type: "user", timestamp: "2026-06-09T10:00:00Z" }),
      makeEntry({ type: "assistant", timestamp: "2026-06-09T10:01:00Z", model: "claude-sonnet-4-6" }),
      makeEntry({ type: "user", timestamp: "2026-06-10T10:00:00Z" }),
      makeEntry({ type: "assistant", timestamp: "2026-06-10T10:01:00Z", model: "claude-haiku-4-5" }),
    ];

    const slices = splitSessionByDay(entries, summary);

    expect(slices[0].models).toContain("claude-sonnet-4-6");
    expect(slices[1].models).toContain("claude-haiku-4-5");
  });

  it("extracts file edits per day", () => {
    const summary = makeSummary();
    const entries: JsonlEntry[] = [
      makeEntry({
        type: "assistant",
        timestamp: "2026-06-09T10:01:00Z",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Write", id: "1", input: { file_path: "/src/a.ts" } },
          ],
        },
      }),
      makeEntry({
        type: "assistant",
        timestamp: "2026-06-10T10:01:00Z",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Edit", id: "2", input: { file_path: "/src/b.ts" } },
          ],
        },
      }),
    ];

    const slices = splitSessionByDay(entries, summary);

    expect(slices[0].fileEdits).toHaveLength(1);
    expect(slices[0].fileEdits[0].filePath).toBe("/src/a.ts");
    expect(slices[1].fileEdits).toHaveLength(1);
    expect(slices[1].fileEdits[0].filePath).toBe("/src/b.ts");
  });

  it("returns empty slices for empty entries", () => {
    const summary = makeSummary();
    const slices = splitSessionByDay([], summary);
    expect(slices).toHaveLength(0);
  });
});
