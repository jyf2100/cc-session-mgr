import { describe, it, expect } from "vitest";
import { detectPhases } from "./phase.js";
import type { JsonlEntry } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers to construct test entries concisely
// ---------------------------------------------------------------------------

function userEntry(text: string, ts?: string): JsonlEntry {
  const entry: JsonlEntry = {
    type: "user",
    message: { role: "user", content: text },
  };
  if (ts) entry.timestamp = ts;
  return entry;
}

function assistantEntry(
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>,
  ts?: string,
  cost?: number,
): JsonlEntry {
  const content: unknown[] = toolCalls
    ? toolCalls.map((tc) => ({
        type: "tool_use",
        name: tc.name,
        input: tc.input,
      }))
    : [{ type: "text", text: "ok" }];
  const entry: JsonlEntry = {
    type: "assistant",
    message: { role: "assistant", content },
  };
  if (ts) entry.timestamp = ts;
  if (cost !== undefined) entry.costUSD = cost;
  return entry;
}

function systemEntry(ts?: string): JsonlEntry {
  const entry: JsonlEntry = { type: "system" };
  if (ts) entry.timestamp = ts;
  return entry;
}

function errorResultEntry(): JsonlEntry {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          is_error: true,
          content: "Error: file not found",
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectPhases", () => {
  it("splits 3-prompt session into 3 phases", () => {
    const entries: JsonlEntry[] = [
      userEntry("fix bug"),
      assistantEntry(),
      assistantEntry(),
      userEntry("add test"),
      assistantEntry(),
      userEntry("commit"),
    ];
    const phases = detectPhases(entries);
    expect(phases).toHaveLength(3);
    expect(phases[0].entries).toHaveLength(3);
    expect(phases[1].entries).toHaveLength(2);
    expect(phases[2].entries).toHaveLength(1);
    expect(phases[0].index).toBe(0);
    expect(phases[1].index).toBe(1);
    expect(phases[2].index).toBe(2);
  });

  it("includes pre-user entries in first phase", () => {
    const entries: JsonlEntry[] = [
      systemEntry(),
      assistantEntry(),
      userEntry("hello"),
      assistantEntry(),
    ];
    const phases = detectPhases(entries);
    // Only one user prompt boundary → one phase starting at "hello"
    expect(phases).toHaveLength(1);
    expect(phases[0].entries).toHaveLength(2); // user("hello") + assistant
    expect(phases[0].name).toBe("hello");
  });

  it("returns empty array for empty input", () => {
    expect(detectPhases([])).toEqual([]);
  });

  it("returns single phase for single prompt", () => {
    const entries: JsonlEntry[] = [userEntry("hello")];
    const phases = detectPhases(entries);
    expect(phases).toHaveLength(1);
    expect(phases[0].entries).toHaveLength(1);
    expect(phases[0].name).toBe("hello");
  });

  // -- Phase name derivation --

  it("truncates long prompts to 80 chars", () => {
    const longText = "a".repeat(200);
    const entries: JsonlEntry[] = [userEntry(longText)];
    const phases = detectPhases(entries);
    expect(phases[0].name).toHaveLength(80);
    expect(phases[0].name).toBe("a".repeat(80));
  });

  it("collapses multiline prompts to single line", () => {
    const entries: JsonlEntry[] = [
      userEntry("fix bug\nin auth module\nplease"),
    ];
    const phases = detectPhases(entries);
    expect(phases[0].name).toBe("fix bug in auth module please");
  });

  // -- Tool calls and files --

  it("extracts tool calls and files modified", () => {
    const entries: JsonlEntry[] = [
      userEntry("edit files"),
      assistantEntry([
        { name: "Edit", input: { file_path: "src/foo.ts" } },
        { name: "Write", input: { file_path: "src/bar.ts" } },
      ]),
    ];
    const phases = detectPhases(entries);
    expect(phases[0].toolCalls).toHaveLength(2);
    expect(phases[0].filesModified).toContain("src/foo.ts");
    expect(phases[0].filesModified).toContain("src/bar.ts");
  });

  // -- Error and retry counting --

  it("counts errors from tool_result entries", () => {
    const entries: JsonlEntry[] = [
      userEntry("do stuff"),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
      errorResultEntry(),
    ];
    const phases = detectPhases(entries);
    expect(phases[0].errorCount).toBeGreaterThanOrEqual(1);
  });

  it("counts retries for same tool+path", () => {
    const entries: JsonlEntry[] = [
      userEntry("retry test"),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
      errorResultEntry(),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
    ];
    const phases = detectPhases(entries);
    expect(phases[0].retryCount).toBeGreaterThanOrEqual(1);
  });

  // -- Cost summation --

  it("sums phase cost from entries", () => {
    const entries: JsonlEntry[] = [
      userEntry("cost test"),
      assistantEntry(undefined, undefined, 0.01),
      assistantEntry(undefined, undefined, 0.02),
      assistantEntry(undefined, undefined, 0.03),
    ];
    const phases = detectPhases(entries);
    expect(phases[0].costUSD).toBeCloseTo(0.06);
  });

  // -- Timing --

  it("computes timing from timestamps", () => {
    const entries: JsonlEntry[] = [
      userEntry("timed", "2026-06-12T10:00:00Z"),
      assistantEntry(undefined, "2026-06-12T10:05:00Z"),
    ];
    const phases = detectPhases(entries);
    expect(phases[0].startTime).toBe("2026-06-12T10:00:00Z");
    expect(phases[0].endTime).toBe("2026-06-12T10:05:00Z");
    expect(phases[0].durationMs).toBe(300000);
  });

  it("returns empty timing for missing timestamps", () => {
    const entries: JsonlEntry[] = [userEntry("no ts"), assistantEntry()];
    const phases = detectPhases(entries);
    expect(phases[0].startTime).toBe("");
    expect(phases[0].endTime).toBe("");
    expect(phases[0].durationMs).toBe(0);
  });

  it("returns empty when no user prompts exist", () => {
    const entries: JsonlEntry[] = [
      systemEntry(),
      assistantEntry(),
      assistantEntry(),
    ];
    expect(detectPhases(entries)).toEqual([]);
  });
});
