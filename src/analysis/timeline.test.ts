import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline.js";
import type { JsonlEntry } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
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
  text?: string,
  cost?: number,
  ts?: string,
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
  if (ts) entry.timestamp = ts;
  return entry;
}

function toolResultEntry(
  isError = false,
  content = "result text",
): JsonlEntry {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          is_error: isError,
          content,
        },
      ],
    },
  };
}

function compactBoundary(ts?: string): JsonlEntry {
  const entry: JsonlEntry = { type: "compact_boundary" };
  if (ts) entry.timestamp = ts;
  return entry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildTimeline", () => {
  it("classifies typical session event types", () => {
    const entries: JsonlEntry[] = [
      userEntry("fix the bug"),
      assistantEntry([{ name: "Read", input: { file_path: "src/a.ts" } }]),
      toolResultEntry(),
      assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }]),
      assistantEntry(undefined, "Done!"),
    ];

    const result = buildTimeline(entries);
    expect(result.entries).toHaveLength(5);
    expect(result.entries[0].eventType).toBe("user_prompt");
    expect(result.entries[1].eventType).toBe("tool_call");
    expect(result.entries[2].eventType).toBe("tool_result");
    expect(result.entries[3].eventType).toBe("tool_call");
    expect(result.entries[4].eventType).toBe("assistant_response");
  });

  it("returns empty result for empty array", () => {
    const result = buildTimeline([]);
    expect(result.entries).toEqual([]);
    expect(result.phases).toEqual([]);
    expect(result.summary.totalDurationMs).toBe(0);
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalToolCalls).toBe(0);
    expect(result.summary.wastedSpendUSD).toBe(0);
  });

  it("populates entry metadata (eventType, summary, cost)", () => {
    const entries: JsonlEntry[] = [
      userEntry("hello world"),
      assistantEntry(
        [{ name: "Read", input: { file_path: "src/foo.ts" } }],
        undefined,
        0.05,
      ),
    ];

    const result = buildTimeline(entries);
    const prompt = result.entries[0];
    expect(prompt.eventType).toBe("user_prompt");
    expect(prompt.summary).toBe("hello world");
    expect(prompt.costUSD).toBe(0);

    const toolCall = result.entries[1];
    expect(toolCall.eventType).toBe("tool_call");
    expect(toolCall.summary).toContain("Read");
    expect(toolCall.summary).toContain("src/foo.ts");
    expect(toolCall.costUSD).toBe(0.05);
  });

  it("groups entries into phases by user prompt boundaries", () => {
    const entries: JsonlEntry[] = [
      userEntry("task one"),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
      userEntry("task two"),
      assistantEntry([{ name: "Edit", input: { file_path: "b.ts" } }]),
      userEntry("task three"),
      assistantEntry(undefined, "done"),
    ];

    const result = buildTimeline(entries);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].name).toContain("task one");
    expect(result.phases[0].startIndex).toBe(0);
    expect(result.phases[0].endIndex).toBe(1);
    expect(result.phases[1].startIndex).toBe(2);
    expect(result.phases[2].startIndex).toBe(4);
  });

  it("computes phase tool call and error counts", () => {
    const entries: JsonlEntry[] = [
      userEntry("do stuff"),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
      toolResultEntry(true, "Error: not found"),
      assistantEntry([{ name: "Edit", input: { file_path: "a.ts" } }]),
    ];

    const result = buildTimeline(entries);
    const phase = result.phases[0];
    expect(phase.toolCallCount).toBe(2);
    expect(phase.errorCount).toBe(1);
  });

  it("estimates wasted spend from tool-loop entries", () => {
    const entries: JsonlEntry[] = [
      userEntry("edit"),
      assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }], undefined, 0.1),
      assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }], undefined, 0.1),
      assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }], undefined, 0.1),
    ];

    const result = buildTimeline(entries);
    expect(result.summary.wastedSpendUSD).toBeGreaterThan(0);
  });

  it("computes total duration from timestamps", () => {
    const entries: JsonlEntry[] = [
      userEntry("start", "2026-06-12T10:00:00Z"),
      assistantEntry(undefined, "ok", 0.01, "2026-06-12T10:05:00Z"),
    ];

    const result = buildTimeline(entries);
    expect(result.summary.totalDurationMs).toBe(5 * 60 * 1000);
  });

  it("computes total cost and tool calls", () => {
    const entries: JsonlEntry[] = [
      userEntry("go"),
      assistantEntry(
        [{ name: "Read", input: { file_path: "a.ts" } }],
        undefined,
        0.1,
      ),
      assistantEntry(
        [{ name: "Edit", input: { file_path: "b.ts" } }],
        undefined,
        0.2,
      ),
    ];

    const result = buildTimeline(entries);
    expect(result.summary.totalCost).toBeCloseTo(0.3);
    expect(result.summary.totalToolCalls).toBe(2);
  });

  it("classifies compact_boundary as compact event", () => {
    const entries: JsonlEntry[] = [
      userEntry("hello"),
      compactBoundary(),
      assistantEntry(undefined, "resumed"),
    ];

    const result = buildTimeline(entries);
    expect(result.entries[1].eventType).toBe("compact");
    expect(result.entries[1].summary).toContain("compaction");
  });

  it("truncates long summaries to 60 chars", () => {
    const longText = "a".repeat(200);
    const entries: JsonlEntry[] = [userEntry(longText)];

    const result = buildTimeline(entries);
    expect(result.entries[0].summary.length).toBeLessThanOrEqual(60);
  });
});
