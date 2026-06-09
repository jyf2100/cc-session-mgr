import { describe, it, expect } from "vitest";
import type { SessionSummary } from "../types/index.js";
import { filterSessions, sortByRecent, findByPrefix } from "./session-handlers.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSummary(
  overrides: Partial<SessionSummary> & { sessionId: string },
): SessionSummary {
  return {
    projectPath: "/home/dev/app",
    encodedDir: "-home-dev-app",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T10:30:00Z",
    messageCounts: { user: 3, assistant: 3, system: 0, other: 0 },
    cost: {
      totalUSD: 0.05,
      source: "inline",
      incomplete: false,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: ["claude-sonnet-4-6"],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// filterSessions
// ---------------------------------------------------------------------------

describe("filterSessions", () => {
  const sessions = [
    makeSummary({ sessionId: "a1", projectPath: "/home/dev/cc-session-mgr", startTime: "2026-06-01T10:00:00Z" }),
    makeSummary({ sessionId: "b2", projectPath: "/home/dev/other-project", startTime: "2026-06-05T10:00:00Z" }),
    makeSummary({ sessionId: "c3", projectPath: "/home/dev/cc-session-mgr", startTime: "2026-06-09T10:00:00Z" }),
    makeSummary({ sessionId: "d4", projectPath: "/home/dev/cc-session-mgr", startTime: null }),
  ];

  it("filters by project substring (case-insensitive)", () => {
    const result = filterSessions(sessions, { project: "cc-session" });
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.sessionId !== "b2")).toBe(true);
  });

  it("filters by from date (inclusive)", () => {
    const result = filterSessions(sessions, { from: "2026-06-05" });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toContain("b2");
    expect(result.map((s) => s.sessionId)).toContain("c3");
  });

  it("filters by to date (inclusive)", () => {
    const result = filterSessions(sessions, { to: "2026-06-05" });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toContain("a1");
    expect(result.map((s) => s.sessionId)).toContain("b2");
  });

  it("filters by date range", () => {
    const result = filterSessions(sessions, { from: "2026-06-02", to: "2026-06-08" });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("b2");
  });

  it("excludes sessions with null startTime when filtering by date", () => {
    const result = filterSessions(sessions, { from: "2026-06-01" });
    expect(result.every((s) => s.startTime !== null)).toBe(true);
  });

  it("returns all sessions when no filters", () => {
    const result = filterSessions(sessions, {});
    expect(result).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// sortByRecent
// ---------------------------------------------------------------------------

describe("sortByRecent", () => {
  it("sorts by startTime descending", () => {
    const sessions = [
      makeSummary({ sessionId: "old", startTime: "2026-06-01T10:00:00Z" }),
      makeSummary({ sessionId: "new", startTime: "2026-06-09T10:00:00Z" }),
      makeSummary({ sessionId: "mid", startTime: "2026-06-05T10:00:00Z" }),
    ];
    const sorted = sortByRecent(sessions);
    expect(sorted[0].sessionId).toBe("new");
    expect(sorted[1].sessionId).toBe("mid");
    expect(sorted[2].sessionId).toBe("old");
  });

  it("does not mutate the original array", () => {
    const sessions = [
      makeSummary({ sessionId: "old", startTime: "2026-06-01T10:00:00Z" }),
      makeSummary({ sessionId: "new", startTime: "2026-06-09T10:00:00Z" }),
    ];
    const copy = [...sessions];
    sortByRecent(sessions);
    expect(sessions).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// findByPrefix
// ---------------------------------------------------------------------------

describe("findByPrefix", () => {
  const sessions = [
    makeSummary({ sessionId: "abc12345-def6-7890" }),
    makeSummary({ sessionId: "abc99999-xxxx-yyyy" }),
    makeSummary({ sessionId: "zzz11111-2222-3333" }),
  ];

  it("finds session by full ID", () => {
    const result = findByPrefix(sessions, "abc12345-def6-7890");
    expect(result.sessionId).toBe("abc12345-def6-7890");
  });

  it("finds session by short prefix", () => {
    const result = findByPrefix(sessions, "zzz11111");
    expect(result.sessionId).toBe("zzz11111-2222-3333");
  });

  it("throws on ambiguous prefix", () => {
    expect(() => findByPrefix(sessions, "abc")).toThrow(
      "Multiple sessions match prefix 'abc'. Please use a longer prefix.",
    );
  });

  it("throws on not found", () => {
    expect(() => findByPrefix(sessions, "nonexistent")).toThrow(
      "Session not found: nonexistent",
    );
  });
});
