import { describe, it, expect } from "vitest";
import { generateStandup } from "./standup.js";
import type { JsonlEntry } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userEntry(text: string): JsonlEntry {
  return { type: "user", message: { role: "user", content: text } };
}

function assistantWithTools(
  ...tools: Array<{ name: string; input: Record<string, unknown> }>
): JsonlEntry {
  return {
    type: "assistant",
    message: {
      role: "assistant",
      content: tools.map((t) => ({ type: "tool_use", name: t.name, input: t.input })),
    },
  };
}

function compactBoundary(): JsonlEntry {
  return { type: "compact_boundary" };
}

function bashEntry(command: string): JsonlEntry {
  return {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", name: "Bash", input: { command } },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateStandup", () => {
  it("handles clear task progression", () => {
    const entries: JsonlEntry[] = [
      userEntry("fix the auth bug"),
      assistantWithTools({ name: "Read", input: { file_path: "src/auth.ts" } }),
      assistantWithTools({ name: "Edit", input: { file_path: "src/auth.ts" } }),
      userEntry("add a test for it"),
      assistantWithTools({ name: "Write", input: { file_path: "tests/auth.test.ts" } }),
    ];

    const report = generateStandup(entries);
    expect(report.approaches.length).toBeGreaterThan(0);
    expect(report.abandoned).toEqual([]);
    expect(report.reviewItems).toContain("src/auth.ts");
    expect(report.reviewItems).toContain("tests/auth.test.ts");
  });

  it("detects abandoned approaches", () => {
    const entries: JsonlEntry[] = [
      userEntry("fix the bug"),
      assistantWithTools({ name: "Edit", input: { file_path: "src/a.ts" } }),
      userEntry("no, try something else"),
      assistantWithTools({ name: "Edit", input: { file_path: "src/b.ts" } }),
    ];

    const report = generateStandup(entries);
    expect(report.abandoned.length).toBeGreaterThanOrEqual(1);
    expect(report.abandoned[0].filesModified).toContain("src/a.ts");
    expect(report.approaches.length).toBeGreaterThan(0);
  });

  it("returns empty report for empty array", () => {
    const report = generateStandup([]);
    expect(report.approaches).toEqual([]);
    expect(report.abandoned).toEqual([]);
    expect(report.uncertainties).toEqual([]);
    expect(report.reviewItems).toEqual([]);
    expect(report.newDependencies).toEqual([]);
    expect(report.contextResetCount).toBe(0);
  });

  // -- Context reset counting --

  it("counts compact_boundary entries as context resets", () => {
    const entries: JsonlEntry[] = [
      userEntry("hello"),
      compactBoundary(),
      assistantWithTools({ name: "Read", input: { file_path: "a.ts" } }),
      compactBoundary(),
    ];
    const report = generateStandup(entries);
    expect(report.contextResetCount).toBe(2);
  });

  it("returns 0 context resets when no compact_boundary", () => {
    const entries: JsonlEntry[] = [
      userEntry("hello"),
      assistantWithTools({ name: "Read", input: { file_path: "a.ts" } }),
    ];
    const report = generateStandup(entries);
    expect(report.contextResetCount).toBe(0);
  });

  // -- New dependency detection --

  it("detects npm install as new dependency", () => {
    const entries: JsonlEntry[] = [
      userEntry("install lodash"),
      bashEntry("npm install lodash"),
    ];
    const report = generateStandup(entries);
    expect(report.newDependencies).toContain("lodash");
  });

  it("detects multiple package managers", () => {
    const entries: JsonlEntry[] = [
      userEntry("install stuff"),
      bashEntry("pip install requests"),
      bashEntry("npm install express"),
    ];
    const report = generateStandup(entries);
    expect(report.newDependencies).toContain("requests");
    expect(report.newDependencies).toContain("express");
  });

  it("returns empty dependencies when no install commands", () => {
    const entries: JsonlEntry[] = [
      userEntry("just read"),
      assistantWithTools({ name: "Read", input: { file_path: "a.ts" } }),
    ];
    const report = generateStandup(entries);
    expect(report.newDependencies).toEqual([]);
  });

  // -- Uncertainty detection --

  it("detects uncertainty in user messages", () => {
    const entries: JsonlEntry[] = [
      userEntry("not sure if this is the right approach, maybe try X?"),
    ];
    const report = generateStandup(entries);
    expect(report.uncertainties.length).toBeGreaterThan(0);
    expect(report.uncertainties[0].userMessage).toContain("not sure");
  });

  it("returns no uncertainties for directive messages", () => {
    const entries: JsonlEntry[] = [
      userEntry("fix the bug in auth.ts"),
      userEntry("add a test for the fix"),
    ];
    const report = generateStandup(entries);
    expect(report.uncertainties).toEqual([]);
  });

  it("detects question marks as uncertainty", () => {
    const entries: JsonlEntry[] = [
      userEntry("should we use Redis for caching?"),
    ];
    const report = generateStandup(entries);
    expect(report.uncertainties.length).toBe(1);
  });
});
