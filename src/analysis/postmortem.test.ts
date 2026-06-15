import { describe, it, expect } from "vitest";
import { analyzePostmortem } from "./postmortem.js";
import type { JsonlEntry } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userEntry(text: string): JsonlEntry {
  return { type: "user", message: { role: "user", content: text } };
}

function assistantEntry(
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>,
  text?: string,
): JsonlEntry {
  const content: unknown[] = [];
  if (toolCalls) {
    for (const tc of toolCalls) {
      content.push({ type: "tool_use", name: tc.name, input: tc.input });
    }
  }
  if (text !== undefined || toolCalls === undefined) {
    content.push({ type: "text", text: text ?? "ok" });
  }
  return { type: "assistant", message: { role: "assistant", content } };
}

function errorToolResult(content: string = "Error: something failed"): JsonlEntry {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", is_error: true, content }],
    },
  };
}

function systemEntry(text: string): JsonlEntry {
  return { type: "system", message: { role: "system", content: text } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzePostmortem", () => {
  // -- Crash detection -------------------------------------------------------

  it("detects context_window_exceeded from system message", () => {
    const entries: JsonlEntry[] = [
      userEntry("analyze this huge file"),
      assistantEntry([{ name: "Read", input: { file_path: "big.ts" } }]),
      systemEntry("Error: context window exceeded — too many tokens"),
    ];

    const result = analyzePostmortem(entries);
    expect(result.crashInfo).not.toBeNull();
    expect(result.crashInfo!.type).toBe("context_window_exceeded");
    expect(result.crashInfo!.lastUserPrompt).toContain("analyze this");
  });

  it("detects OOM from error message", () => {
    const entries: JsonlEntry[] = [
      userEntry("process this"),
      systemEntry("Process killed: OOM (out of memory)"),
    ];

    const result = analyzePostmortem(entries);
    expect(result.crashInfo).not.toBeNull();
    expect(result.crashInfo!.type).toBe("oom");
  });

  it("detects SIGKILL as OOM", () => {
    const entries: JsonlEntry[] = [
      userEntry("run this"),
      systemEntry("SIGKILL received"),
    ];

    const result = analyzePostmortem(entries);
    expect(result.crashInfo).not.toBeNull();
    expect(result.crashInfo!.type).toBe("oom");
  });

  it("detects timeout from large time gap", () => {
    const entries: JsonlEntry[] = [
      userEntry("start"),
      { type: "assistant", message: { role: "assistant", content: "working..." }, timestamp: "2026-06-12T10:00:00Z" },
      { type: "assistant", message: { role: "assistant", content: "done" }, timestamp: "2026-06-12T11:00:00Z" },
    ];

    const result = analyzePostmortem(entries);
    expect(result.crashInfo).not.toBeNull();
    expect(result.crashInfo!.type).toBe("timeout");
  });

  it("returns null crashInfo for normal completion", () => {
    const entries: JsonlEntry[] = [
      userEntry("fix the bug"),
      assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }]),
      assistantEntry(undefined, "All done!"),
    ];

    const result = analyzePostmortem(entries);
    expect(result.crashInfo).toBeNull();
    expect(result.rootCauseTimeline).toEqual([]);
    expect(result.agentsMdViolations).toEqual([]);
    expect(result.recoverySuggestions).toEqual([]);
  });

  // -- Root cause timeline ---------------------------------------------------

  it("builds root cause timeline from error chain", () => {
    const entries: JsonlEntry[] = [
      userEntry("try things"),
      assistantEntry([{ name: "Edit", input: { file_path: "a.ts" } }]),
      errorToolResult("Error: permission denied"),
      assistantEntry([{ name: "Edit", input: { file_path: "a.ts" } }]),
      errorToolResult("Error: permission denied"),
      systemEntry("Error: context window exceeded"),
    ];

    const result = analyzePostmortem(entries);
    expect(result.crashInfo).not.toBeNull();
    expect(result.rootCauseTimeline.length).toBeGreaterThan(0);

    const trigger = result.rootCauseTimeline.find((e) => e.isTrigger);
    expect(trigger).toBeDefined();
    expect(trigger!.annotation).toContain("Error result");
  });

  // -- CLAUDE.md violation detection -----------------------------------------

  it("detects source modifications without tests", () => {
    const entries: JsonlEntry[] = [
      userEntry("implement feature"),
      assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }]),
      assistantEntry([{ name: "Edit", input: { file_path: "src/b.ts" } }]),
      assistantEntry([{ name: "Edit", input: { file_path: "src/c.ts" } }]),
      systemEntry("Error: OOM"),
    ];

    const result = analyzePostmortem(entries);
    const violation = result.agentsMdViolations.find(
      (v) => v.rule === "test-coverage",
    );
    expect(violation).toBeDefined();
    expect(violation!.description).toContain("3 source files");
  });

  it("returns no test-coverage violation when tests are present", () => {
    const entries: JsonlEntry[] = [
      userEntry("implement feature"),
      assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }]),
      assistantEntry([{ name: "Write", input: { file_path: "src/a.test.ts" } }]),
      systemEntry("Error: OOM"),
    ];

    const result = analyzePostmortem(entries);
    const testViolation = result.agentsMdViolations.find(
      (v) => v.rule === "test-coverage",
    );
    expect(testViolation).toBeUndefined();
  });

  // -- Recovery suggestions --------------------------------------------------

  it("generates context_window_exceeded recovery suggestions", () => {
    const entries: JsonlEntry[] = [
      userEntry("big task"),
      systemEntry("context window exceeded"),
    ];

    const result = analyzePostmortem(entries);
    expect(result.recoverySuggestions.length).toBeGreaterThan(0);
    expect(result.recoverySuggestions.some((s) => s.includes("/compact"))).toBe(true);
    expect(result.recoverySuggestions.some((s) => s.includes("smaller"))).toBe(true);
  });

  it("generates OOM recovery suggestions", () => {
    const entries: JsonlEntry[] = [
      userEntry("big task"),
      systemEntry("out of memory"),
    ];

    const result = analyzePostmortem(entries);
    expect(result.recoverySuggestions.some((s) => s.includes("infinite loops"))).toBe(true);
  });

  it("returns empty arrays for empty input", () => {
    const result = analyzePostmortem([]);
    expect(result.crashInfo).toBeNull();
    expect(result.rootCauseTimeline).toEqual([]);
    expect(result.agentsMdViolations).toEqual([]);
    expect(result.recoverySuggestions).toEqual([]);
  });
});
