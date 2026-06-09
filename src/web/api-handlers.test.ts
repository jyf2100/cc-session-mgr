import { describe, it, expect } from "vitest";
import type { SessionSummary } from "../types/index.js";
import { handleProjects, handleSessions, handleSessionDetail } from "./api-handlers.js";

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
// handleProjects
// ---------------------------------------------------------------------------

describe("handleProjects", () => {
  it("aggregates sessions by project name", () => {
    const summaries = [
      makeSummary({ sessionId: "a1", projectPath: "/home/dev/my-project" }),
      makeSummary({ sessionId: "a2", projectPath: "/home/dev/my-project" }),
      makeSummary({ sessionId: "b1", projectPath: "/home/dev/other" }),
    ];
    const projects = handleProjects(summaries);
    expect(projects).toHaveLength(2);
    const myProj = projects.find((p) => p.name === "my-project");
    expect(myProj?.sessionCount).toBe(2);
    const other = projects.find((p) => p.name === "other");
    expect(other?.sessionCount).toBe(1);
  });

  it("sorts by sessionCount descending", () => {
    const summaries = [
      makeSummary({ sessionId: "a1", projectPath: "/small" }),
      makeSummary({ sessionId: "b1", projectPath: "/big" }),
      makeSummary({ sessionId: "b2", projectPath: "/big" }),
      makeSummary({ sessionId: "b3", projectPath: "/big" }),
    ];
    const projects = handleProjects(summaries);
    expect(projects[0].name).toBe("big");
    expect(projects[0].sessionCount).toBe(3);
  });

  it("returns empty array for no summaries", () => {
    expect(handleProjects([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleSessions
// ---------------------------------------------------------------------------

describe("handleSessions", () => {
  const sessions = [
    makeSummary({ sessionId: "a1", projectPath: "/home/dev/cc-session-mgr", startTime: "2026-06-01T10:00:00Z" }),
    makeSummary({ sessionId: "b2", projectPath: "/home/dev/other-project", startTime: "2026-06-05T10:00:00Z" }),
    makeSummary({ sessionId: "c3", projectPath: "/home/dev/cc-session-mgr", startTime: "2026-06-09T10:00:00Z" }),
  ];

  it("filters by project substring (case-insensitive)", () => {
    const result = handleSessions(sessions, { project: "cc-session" });
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.project === "cc-session-mgr")).toBe(true);
  });

  it("filters by date range", () => {
    const result = handleSessions(sessions, { from: "2026-06-02", to: "2026-06-08" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b2");
  });

  it("sorts by startTime descending", () => {
    const result = handleSessions(sessions, {});
    expect(result[0].id).toBe("c3");
    expect(result[result.length - 1].id).toBe("a1");
  });

  it("returns shortId (first 8 chars)", () => {
    const result = handleSessions(sessions, {});
    expect(result[0].shortId).toBe(result[0].id.slice(0, 8));
  });

  it("shows Untitled when no customTitle", () => {
    const noTitle = [makeSummary({ sessionId: "x1", customTitle: null })];
    const result = handleSessions(noTitle, {});
    expect(result[0].title).toBe("Untitled");
  });

  it("shows customTitle when present", () => {
    const titled = [makeSummary({ sessionId: "x1", customTitle: "My Session", hasCustomTitle: true })];
    const result = handleSessions(titled, {});
    expect(result[0].title).toBe("My Session");
  });
});

// ---------------------------------------------------------------------------
// handleSessionDetail
// ---------------------------------------------------------------------------

describe("handleSessionDetail", () => {
  const sessions = [
    makeSummary({
      sessionId: "abc12345-def6-7890",
      projectPath: "/home/dev/app",
      fileEdits: [
        { filePath: "src/a.ts", editCount: 5 },
        { filePath: "src/b.ts", editCount: 2 },
      ],
    }),
    makeSummary({
      sessionId: "abc99999-xxxx-yyyy",
      projectPath: "/home/dev/app",
    }),
  ];

  it("finds session by full ID", () => {
    const result = handleSessionDetail(sessions, "abc12345-def6-7890");
    expect(result.status).toBe(200);
    const data = result.data as { id: string };
    expect(data.id).toBe("abc12345-def6-7890");
  });

  it("finds session by short prefix", () => {
    const result = handleSessionDetail(sessions, "abc12345");
    expect(result.status).toBe(200);
  });

  it("returns file edits sorted by editCount desc", () => {
    const result = handleSessionDetail(sessions, "abc12345");
    const data = result.data as { fileEdits: { filePath: string; editCount: number }[] };
    expect(data.fileEdits[0].editCount).toBeGreaterThanOrEqual(data.fileEdits[1].editCount);
  });

  it("returns 400 for ambiguous prefix", () => {
    const result = handleSessionDetail(sessions, "abc");
    expect(result.status).toBe(400);
    const data = result.data as { error: string };
    expect(data.error).toContain("Multiple sessions match");
  });

  it("returns 404 for not found", () => {
    const result = handleSessionDetail(sessions, "nonexistent");
    expect(result.status).toBe(404);
    const data = result.data as { error: string };
    expect(data.error).toContain("not found");
  });
});
