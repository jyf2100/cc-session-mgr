import { describe, it, expect } from "vitest";
import { diffSessions } from "./diff.js";
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
  cost?: number,
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
  const entry: JsonlEntry = {
    type: "assistant",
    message: { role: "assistant", content },
  };
  if (cost !== undefined) entry.costUSD = cost;
  return entry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("diffSessions", () => {
  it("aligns similar sessions with matched phases", () => {
    const a: JsonlEntry[] = [
      userEntry("fix bug"),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
      assistantEntry(undefined, "done"),
    ];
    const b: JsonlEntry[] = [
      userEntry("fix bug"),
      assistantEntry([{ name: "Edit", input: { file_path: "a.ts" } }]),
      assistantEntry(undefined, "done"),
    ];

    const result = diffSessions(a, b);
    expect(result.phaseAlignment.length).toBeGreaterThan(0);
    const matched = result.phaseAlignment.filter(
      (p) => p.status === "matched",
    );
    expect(matched.length).toBeGreaterThan(0);
  });

  it("detects completely different sessions as inserted/deleted", () => {
    const a: JsonlEntry[] = [
      userEntry("task alpha"),
      assistantEntry(undefined, "result alpha"),
    ];
    const b: JsonlEntry[] = [
      userEntry("task beta"),
      assistantEntry(undefined, "result beta"),
    ];

    const result = diffSessions(a, b);
    const matched = result.phaseAlignment.filter(
      (p) => p.status === "matched",
    );
    expect(matched.length).toBe(0);
    expect(
      result.phaseAlignment.every(
        (p) => p.status === "inserted" || p.status === "deleted",
      ),
    ).toBe(true);
  });

  it("handles one empty session", () => {
    const a: JsonlEntry[] = [
      userEntry("do something"),
      assistantEntry(undefined, "done"),
    ];
    const b: JsonlEntry[] = [];

    const result = diffSessions(a, b);
    expect(result.phaseAlignment.length).toBeGreaterThan(0);
    expect(result.phaseAlignment.every((p) => p.status === "deleted")).toBe(
      true,
    );
    expect(result.metricDeltas).toEqual([]);
    expect(result.divergencePoints).toEqual([]);
  });

  it("handles both empty sessions", () => {
    const result = diffSessions([], []);
    expect(result.phaseAlignment).toEqual([]);
    expect(result.metricDeltas).toEqual([]);
    expect(result.divergencePoints).toEqual([]);
  });

  it("performs LCS alignment with partial matches", () => {
    const a: JsonlEntry[] = [
      userEntry("setup project"),
      assistantEntry(undefined, "done"),
      userEntry("add auth"),
      assistantEntry(undefined, "done"),
      userEntry("write tests"),
      assistantEntry(undefined, "done"),
    ];
    const b: JsonlEntry[] = [
      userEntry("setup project"),
      assistantEntry(undefined, "done"),
      userEntry("add logging"),
      assistantEntry(undefined, "done"),
      userEntry("write tests"),
      assistantEntry(undefined, "done"),
    ];

    const result = diffSessions(a, b);
    const matched = result.phaseAlignment.filter(
      (p) => p.status === "matched",
    );
    expect(matched.length).toBeGreaterThanOrEqual(2);
  });

  it("computes metric deltas for matched phases", () => {
    const a: JsonlEntry[] = [
      userEntry("task"),
      assistantEntry(
        [{ name: "Read", input: { file_path: "a.ts" } }],
        undefined,
        0.1,
      ),
    ];
    const b: JsonlEntry[] = [
      userEntry("task"),
      assistantEntry(
        [{ name: "Read", input: { file_path: "a.ts" } }],
        undefined,
        0.3,
      ),
      assistantEntry(
        [{ name: "Edit", input: { file_path: "a.ts" } }],
        undefined,
        0.2,
      ),
    ];

    const result = diffSessions(a, b);
    expect(result.metricDeltas.length).toBeGreaterThan(0);

    const delta = result.metricDeltas[0];
    expect(delta.costDelta).toBeGreaterThan(0);
    expect(delta.toolCallCountDelta).toBeGreaterThan(0);
  });

  it("detects cost spike divergence", () => {
    const a: JsonlEntry[] = [
      userEntry("task"),
      assistantEntry(undefined, "ok", 0.05),
    ];
    const b: JsonlEntry[] = [
      userEntry("task"),
      assistantEntry(undefined, "ok", 0.5),
    ];

    const result = diffSessions(a, b);
    const costSpike = result.divergencePoints.find(
      (d) => d.reason === "cost_spike",
    );
    expect(costSpike).toBeDefined();
    expect(costSpike!.description).toContain("x difference");
  });

  it("detects tool divergence", () => {
    const a: JsonlEntry[] = [
      userEntry("task"),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
    ];
    const b: JsonlEntry[] = [
      userEntry("task"),
      assistantEntry([{ name: "Edit", input: { file_path: "a.ts" } }]),
    ];

    const result = diffSessions(a, b);
    const toolDiv = result.divergencePoints.find(
      (d) => d.reason === "tool_divergence",
    );
    expect(toolDiv).toBeDefined();
    expect(toolDiv!.description).toContain("Read");
    expect(toolDiv!.description).toContain("Edit");
  });

  it("returns no divergences for identical sessions", () => {
    const entries: JsonlEntry[] = [
      userEntry("task"),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }], undefined, 0.1),
    ];

    const result = diffSessions(entries, entries);
    expect(result.divergencePoints).toEqual([]);
  });
});
