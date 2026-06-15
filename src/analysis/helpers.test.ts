import { describe, it, expect } from "vitest";
import {
  extractTextContent,
  extractToolCalls,
  extractFilesModified,
  sumCost,
  parseTimestamp,
} from "./helpers.js";
import type { JsonlEntry } from "../types/index.js";

// ---------------------------------------------------------------------------
// extractTextContent
// ---------------------------------------------------------------------------

describe("extractTextContent", () => {
  it("returns string content as-is", () => {
    const entry: JsonlEntry = {
      type: "user",
      message: { role: "user", content: "hello world" },
    };
    expect(extractTextContent(entry)).toBe("hello world");
  });

  it("joins text blocks from content array", () => {
    const entry: JsonlEntry = {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "line one" },
          { type: "text", text: "line two" },
        ],
      },
    };
    expect(extractTextContent(entry)).toBe("line one\nline two");
  });

  it("skips non-text blocks in content array", () => {
    const entry: JsonlEntry = {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "visible" },
          { type: "tool_use", name: "Read", input: {} },
        ],
      },
    };
    expect(extractTextContent(entry)).toBe("visible");
  });

  it("returns empty string when message is missing", () => {
    const entry: JsonlEntry = { type: "system" };
    expect(extractTextContent(entry)).toBe("");
  });

  it("returns empty string when content is undefined", () => {
    const entry: JsonlEntry = {
      type: "user",
      message: { role: "user" },
    };
    expect(extractTextContent(entry)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractToolCalls
// ---------------------------------------------------------------------------

describe("extractToolCalls", () => {
  it("extracts tool_use blocks with entry index", () => {
    const entries: JsonlEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Read", input: { file_path: "a.ts" } },
          ],
        },
      },
    ];
    const calls = extractToolCalls(entries);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe("Read");
    expect(calls[0].input).toEqual({ file_path: "a.ts" });
    expect(calls[0].entryIndex).toBe(0);
  });

  it("returns empty for entries with string content", () => {
    const entries: JsonlEntry[] = [
      { type: "user", message: { role: "user", content: "hi" } },
    ];
    expect(extractToolCalls(entries)).toEqual([]);
  });

  it("handles multiple tool calls across entries", () => {
    const entries: JsonlEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", name: "Read", input: {} }],
        },
      },
      { type: "user", message: { role: "user", content: "go" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", name: "Edit", input: {} }],
        },
      },
    ];
    const calls = extractToolCalls(entries);
    expect(calls).toHaveLength(2);
    expect(calls[0].toolName).toBe("Read");
    expect(calls[1].toolName).toBe("Edit");
    expect(calls[1].entryIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// extractFilesModified
// ---------------------------------------------------------------------------

describe("extractFilesModified", () => {
  it("extracts unique file paths from Edit/Write tools", () => {
    const entries: JsonlEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Edit", input: { file_path: "a.ts" } },
            { type: "tool_use", name: "Write", input: { file_path: "b.ts" } },
          ],
        },
      },
    ];
    const files = extractFilesModified(entries);
    expect(files.sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("deduplicates identical paths", () => {
    const entries: JsonlEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Edit", input: { file_path: "a.ts" } },
            { type: "tool_use", name: "Edit", input: { file_path: "a.ts" } },
          ],
        },
      },
    ];
    expect(extractFilesModified(entries)).toEqual(["a.ts"]);
  });

  it("ignores non-edit tools like Read and Grep", () => {
    const entries: JsonlEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "Read", input: { file_path: "a.ts" } },
          ],
        },
      },
    ];
    expect(extractFilesModified(entries)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sumCost
// ---------------------------------------------------------------------------

describe("sumCost", () => {
  it("sums all costUSD values", () => {
    const entries: JsonlEntry[] = [
      { type: "assistant", costUSD: 0.01 },
      { type: "assistant", costUSD: 0.02 },
      { type: "assistant", costUSD: 0.03 },
    ];
    expect(sumCost(entries)).toBeCloseTo(0.06);
  });

  it("skips entries without costUSD", () => {
    const entries: JsonlEntry[] = [
      { type: "assistant", costUSD: 0.05 },
      { type: "user" },
      { type: "assistant", costUSD: 0.03 },
    ];
    expect(sumCost(entries)).toBeCloseTo(0.08);
  });

  it("returns 0 for empty array", () => {
    expect(sumCost([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseTimestamp
// ---------------------------------------------------------------------------

describe("parseTimestamp", () => {
  it("parses ISO timestamp to ms", () => {
    const ms = parseTimestamp("2026-06-12T10:00:00Z");
    expect(ms).toBe(Date.parse("2026-06-12T10:00:00Z"));
  });

  it("returns NaN for undefined", () => {
    expect(parseTimestamp(undefined)).toBeNaN();
  });

  it("returns NaN for empty string", () => {
    expect(parseTimestamp("")).toBeNaN();
  });
});
