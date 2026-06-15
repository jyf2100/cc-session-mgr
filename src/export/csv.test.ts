import { describe, it, expect } from "vitest";
import type { SessionWorkSummary } from "../types/index.js";
import { renderCsv } from "./csv.js";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeSession(
  overrides: Partial<SessionWorkSummary> = {}
): SessionWorkSummary {
  return {
    sessionId: "sess-001",
    projectPath: "/project/test",
    encodedDir: "-project-test",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T11:00:00Z",
    messageCounts: { user: 3, assistant: 5, system: 0, other: 0 },
    cost: {
      totalUSD: 0.05,
      source: "inline",
      incomplete: false,
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: ["claude-sonnet-4-6"],
    fileEdits: [{ filePath: "src/a.ts", editCount: 2 }],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    workContent: {
      primaryIntent: "test",
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
// Tests
// ---------------------------------------------------------------------------

describe("renderCsv", () => {
  it("returns header-only for empty input", () => {
    const result = renderCsv([]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "sessionId,project,startTime,endTime,cost,model,inputTokens,outputTokens,userMessages,assistantMessages,fileEditCount,isCompacted"
    );
  });

  it("returns header + one row per session", () => {
    const result = renderCsv([makeSession()]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("sessionId");
    expect(lines[1]).toContain("sess-001");
  });

  it("uses empty string for null timestamps", () => {
    const session = makeSession({ startTime: null, endTime: null });
    const result = renderCsv([session]);
    const row = result.split("\n")[1];
    expect(row).toContain(",,");
  });

  it("joins multiple models with semicolon", () => {
    const session = makeSession({
      models: ["opus", "sonnet"],
    });
    const result = renderCsv([session]);
    const row = result.split("\n")[1];
    expect(row).toContain("opus; sonnet");
  });

  it("escapes commas and quotes per RFC 4180", () => {
    const session = makeSession({
      projectPath: 'my, "cool" project',
    });
    const result = renderCsv([session]);
    const row = result.split("\n")[1];
    expect(row).toContain('"my, ""cool"" project"');
  });

  it("outputs cost and token counts correctly", () => {
    const session = makeSession();
    const result = renderCsv([session]);
    const row = result.split("\n")[1];
    const cells = row.split(",");
    expect(cells[4]).toBe("0.05");
    expect(cells[6]).toBe("100");
    expect(cells[7]).toBe("200");
  });

  it("handles multiple sessions", () => {
    const sessions = [
      makeSession({ sessionId: "s1" }),
      makeSession({ sessionId: "s2" }),
      makeSession({ sessionId: "s3" }),
    ];
    const result = renderCsv(sessions);
    const lines = result.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("s1");
    expect(lines[2]).toContain("s2");
    expect(lines[3]).toContain("s3");
  });
});
