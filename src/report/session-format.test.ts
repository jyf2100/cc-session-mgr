import { describe, it, expect } from "vitest";
import type { SessionSummary, SessionWorkSummary } from "../types/index.js";
import {
  formatSessionRow,
  formatSessionList,
  formatSessionDetail,
} from "./session-format.js";

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
    messageCounts: { user: 3, assistant: 3, system: 1, other: 0 },
    cost: {
      totalUSD: 0.05,
      source: "inline",
      incomplete: false,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
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
// formatSessionRow
// ---------------------------------------------------------------------------

describe("formatSessionRow", () => {
  it("formats a session with a custom title", () => {
    const s = makeSummary({
      sessionId: "abc12345-def6-7890",
      customTitle: "Fix auth bug",
    });
    const row = formatSessionRow(s);
    expect(row).toContain("abc12345");
    expect(row).toContain("Fix auth bug");
    expect(row).toContain("2026-06-09");
    expect(row).toContain("6"); // 3 user + 3 assistant
    expect(row).toContain("$0.05");
    expect(row).toContain("1.0K in / 500 out");
  });

  it("shows Untitled for sessions without a custom title", () => {
    const s = makeSummary({ sessionId: "deadbeef-1234" });
    const row = formatSessionRow(s);
    expect(row).toContain("Untitled");
  });

  it("shows N/A for null startTime", () => {
    const s = makeSummary({ sessionId: "deadbeef", startTime: null });
    const row = formatSessionRow(s);
    expect(row).toContain("| N/A |");
  });
});

// ---------------------------------------------------------------------------
// formatSessionList
// ---------------------------------------------------------------------------

describe("formatSessionList", () => {
  it("returns empty message when no sessions match", () => {
    const result = formatSessionList([], 20);
    expect(result).toBe("No sessions found matching the criteria.\n");
  });

  it("shows header with count and limit", () => {
    const sessions = [
      makeSummary({ sessionId: "aaa11111" }),
      makeSummary({ sessionId: "bbb22222" }),
    ];
    const result = formatSessionList(sessions, 20);
    expect(result).toContain("Showing 2 session(s) (limit: 20)");
    expect(result).toContain("aaa11111");
    expect(result).toContain("bbb22222");
  });

  it("respects limit parameter", () => {
    const sessions = [
      makeSummary({ sessionId: "aaa11111" }),
      makeSummary({ sessionId: "bbb22222" }),
      makeSummary({ sessionId: "ccc33333" }),
    ];
    const result = formatSessionList(sessions, 2);
    expect(result).toContain("Showing 3 session(s) (limit: 2)");
    expect(result).toContain("aaa11111");
    expect(result).toContain("bbb22222");
    expect(result).not.toContain("ccc33333");
  });

  it("shows all sessions when limit is 0", () => {
    const sessions = [
      makeSummary({ sessionId: "aaa11111" }),
      makeSummary({ sessionId: "bbb22222" }),
    ];
    const result = formatSessionList(sessions, 0);
    expect(result).toContain("Showing 2 session(s) (limit: 2)");
  });
});

// ---------------------------------------------------------------------------
// formatSessionDetail
// ---------------------------------------------------------------------------

describe("formatSessionDetail", () => {
  it("renders all fields", () => {
    const s = makeSummary({
      sessionId: "abc12345-def6-7890-ghij-klmnopqrstuv",
      customTitle: "Fix auth bug",
      fileEdits: [
        { filePath: "src/auth.ts", editCount: 3 },
        { filePath: "src/test.ts", editCount: 1 },
      ],
    });
    const result = formatSessionDetail(s);

    expect(result).toContain("abc12345-def6-7890-ghij-klmnopqrstuv");
    expect(result).toContain("/home/dev/app");
    expect(result).toContain("2026-06-09T10:00:00Z");
    expect(result).toContain("6 total");
    expect(result).toContain("user: 3");
    expect(result).toContain("assistant: 3");
    expect(result).toContain("system: 1");
    expect(result).toContain("$0.05");
    expect(result).toContain("1,000 in / 500 out");
    expect(result).toContain("claude-sonnet-4-6");
    expect(result).toContain("src/auth.ts");
    expect(result).toContain("3 edits");
  });

  it("shows 'No file edits' when no edits", () => {
    const s = makeSummary({ sessionId: "noedits" });
    const result = formatSessionDetail(s);
    expect(result).toContain("No file edits in this session.");
  });

  it("shows file edits sorted by edit count descending", () => {
    const s = makeSummary({
      sessionId: "sorted",
      fileEdits: [
        { filePath: "low.ts", editCount: 1 },
        { filePath: "high.ts", editCount: 10 },
        { filePath: "mid.ts", editCount: 5 },
      ],
    });
    const result = formatSessionDetail(s);
    const highIdx = result.indexOf("high.ts");
    const midIdx = result.indexOf("mid.ts");
    const lowIdx = result.indexOf("low.ts");
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  it("shows estimated label when cost is estimated", () => {
    const s = makeSummary({
      sessionId: "estimated",
      cost: {
        totalUSD: 0.03,
        source: "inline",
        incomplete: false,
        inputTokens: 500,
        outputTokens: 200,
        cacheReadTokens: 0,
        isEstimated: true,
      },
    });
    const result = formatSessionDetail(s);
    expect(result).toContain("estimated from token counts");
  });

  it("hides token line when both are zero", () => {
    const s = makeSummary({
      sessionId: "notokens",
      cost: {
        totalUSD: 0,
        source: "inline",
        incomplete: false,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        isEstimated: false,
      },
    });
    const result = formatSessionDetail(s);
    expect(result).not.toContain("**Tokens:**");
  });
});

  it("renders LLM Summary for SessionWorkSummary", () => {
    const base = makeSummary({
      sessionId: "worksum123",
      customTitle: "Work session",
    });
    const ws: SessionWorkSummary = {
      ...base,
      workContent: {
        primaryIntent: "Build feature",
        userIntents: ["Build feature"],
        toolCallSummary: { Write: 1 },
        bashCommands: [],
        moduleSummary: [],
        assistantSnippets: [],
        compactedSummary: null,
        llmSummary: "Implemented the new feature with tests.",
      },
    };
    const result = formatSessionDetail(ws);
    expect(result).toContain("**LLM Summary:** Implemented the new feature with tests.");
  });

  it("does not render LLM Summary for plain SessionSummary", () => {
    const s = makeSummary({ sessionId: "plain123" });
    const result = formatSessionDetail(s);
    expect(result).not.toContain("**LLM Summary:**");
  });
