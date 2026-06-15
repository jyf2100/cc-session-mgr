import { describe, it, expect } from "vitest";
import { lintSession } from "./lint.js";
import type { JsonlEntry } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers to construct test entries
// ---------------------------------------------------------------------------

function userEntry(
  textOrContent?: string | unknown[],
  ts?: string,
): JsonlEntry {
  const entry: JsonlEntry = {
    type: "user",
    message: {
      role: "user",
      content: textOrContent ?? "hello",
    },
  };
  if (ts) entry.timestamp = ts;
  return entry;
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

function errorToolResult(content: string = "Error: something failed"): JsonlEntry {
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          is_error: true,
          content,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("lintSession", () => {
  // -- R1: tool-loop --------------------------------------------------------

  describe("tool-loop rule", () => {
    it("detects 3+ consecutive same-tool same-path calls", () => {
      const entries: JsonlEntry[] = [
        userEntry("edit"),
        assistantEntry([
          { name: "Edit", input: { file_path: "src/a.ts" } },
        ]),
        assistantEntry([
          { name: "Edit", input: { file_path: "src/a.ts" } },
        ]),
        assistantEntry([
          { name: "Edit", input: { file_path: "src/a.ts" } },
        ]),
      ];
      const findings = lintSession(entries);
      const loop = findings.find((f) => f.ruleId === "tool-loop");
      expect(loop).toBeDefined();
      expect(loop!.severity).toBe("warning");
      expect(loop!.message).toContain("3 times");
    });

    it("does not fire when same tool is broken by different path", () => {
      const entries: JsonlEntry[] = [
        userEntry("edit"),
        assistantEntry([
          { name: "Edit", input: { file_path: "src/a.ts" } },
        ]),
        assistantEntry([
          { name: "Edit", input: { file_path: "src/b.ts" } },
        ]),
        assistantEntry([
          { name: "Edit", input: { file_path: "src/a.ts" } },
        ]),
      ];
      const findings = lintSession(entries);
      expect(findings.some((f) => f.ruleId === "tool-loop")).toBe(false);
    });
  });

  // -- R2: reasoning-spiral -------------------------------------------------

  describe("reasoning-spiral rule", () => {
    it("detects 4+ consecutive assistant entries without tools", () => {
      const entries: JsonlEntry[] = [
        userEntry("think hard"),
        assistantEntry(undefined, "thinking..."),
        assistantEntry(undefined, "still thinking..."),
        assistantEntry(undefined, "more thinking..."),
        assistantEntry(undefined, "done thinking"),
      ];
      const findings = lintSession(entries);
      const spiral = findings.find((f) => f.ruleId === "reasoning-spiral");
      expect(spiral).toBeDefined();
      expect(spiral!.message).toContain("4 consecutive");
    });

    it("does not fire when assistant entries have tool calls", () => {
      const entries: JsonlEntry[] = [
        userEntry("do stuff"),
        assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
        assistantEntry([{ name: "Edit", input: { file_path: "a.ts" } }]),
        assistantEntry([{ name: "Read", input: { file_path: "b.ts" } }]),
      ];
      const findings = lintSession(entries);
      expect(findings.some((f) => f.ruleId === "reasoning-spiral")).toBe(false);
    });
  });

  // -- R3: budget-proximity -------------------------------------------------

  describe("budget-proximity rule", () => {
    it("fires when cost >= 90% of threshold", () => {
      const entries: JsonlEntry[] = [
        userEntry("expensive"),
        assistantEntry(undefined, undefined, 4.6),
      ];
      const findings = lintSession(entries);
      const budget = findings.find((f) => f.ruleId === "budget-proximity");
      expect(budget).toBeDefined();
      expect(budget!.message).toContain("$4.60");
    });

    it("does not fire when cost is well under threshold", () => {
      const entries: JsonlEntry[] = [
        userEntry("cheap"),
        assistantEntry(undefined, undefined, 0.5),
      ];
      const findings = lintSession(entries);
      expect(findings.some((f) => f.ruleId === "budget-proximity")).toBe(false);
    });
  });

  // -- R4: context-saturation -----------------------------------------------

  describe("context-saturation rule", () => {
    it("fires when high cost, high output, no file modifications", () => {
      // Need > 50000 estimated output tokens and >= $2.0 cost
      // ~4 chars per token → need ~200k+ chars of output
      const longText = "x".repeat(210_000);
      const entries: JsonlEntry[] = [
        userEntry("long session"),
        assistantEntry(undefined, longText, 3.0),
      ];
      const findings = lintSession(entries);
      const saturation = findings.find(
        (f) => f.ruleId === "context-saturation",
      );
      expect(saturation).toBeDefined();
      expect(saturation!.message).toContain("no file modifications");
    });

    it("does not fire when files are modified", () => {
      const longText = "x".repeat(210_000);
      const entries: JsonlEntry[] = [
        userEntry("long session with edits"),
        assistantEntry(
          [{ name: "Edit", input: { file_path: "src/a.ts" } }],
          longText,
          3.0,
        ),
      ];
      const findings = lintSession(entries);
      expect(
        findings.some((f) => f.ruleId === "context-saturation"),
      ).toBe(false);
    });
  });

  // -- R5: redundant-read ---------------------------------------------------

  describe("redundant-read rule", () => {
    it("detects same file read 3+ times without modification", () => {
      const entries: JsonlEntry[] = [
        userEntry("read many"),
        assistantEntry([{ name: "Read", input: { file_path: "src/a.ts" } }]),
        assistantEntry([{ name: "Read", input: { file_path: "src/a.ts" } }]),
        assistantEntry([{ name: "Read", input: { file_path: "src/a.ts" } }]),
      ];
      const findings = lintSession(entries);
      const redundant = findings.find((f) => f.ruleId === "redundant-read");
      expect(redundant).toBeDefined();
      expect(redundant!.message).toContain("src/a.ts");
      expect(redundant!.message).toContain("3 times");
    });

    it("does not fire when file is later modified", () => {
      const entries: JsonlEntry[] = [
        userEntry("read then edit"),
        assistantEntry([{ name: "Read", input: { file_path: "src/a.ts" } }]),
        assistantEntry([{ name: "Read", input: { file_path: "src/a.ts" } }]),
        assistantEntry([{ name: "Read", input: { file_path: "src/a.ts" } }]),
        assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }]),
      ];
      const findings = lintSession(entries);
      expect(findings.some((f) => f.ruleId === "redundant-read")).toBe(false);
    });
  });

  // -- R6: error-retry-loop -------------------------------------------------

  describe("error-retry-loop rule", () => {
    it("detects same operation erroring 2+ times", () => {
      const entries: JsonlEntry[] = [
        userEntry("try things"),
        assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }]),
        errorToolResult("Error: permission denied"),
        assistantEntry([{ name: "Edit", input: { file_path: "src/a.ts" } }]),
        errorToolResult("Error: permission denied"),
      ];
      const findings = lintSession(entries);
      const retry = findings.find((f) => f.ruleId === "error-retry-loop");
      expect(retry).toBeDefined();
      expect(retry!.severity).toBe("error");
      expect(retry!.message).toContain("2 times");
    });

    it("does not fire for different operations", () => {
      const entries: JsonlEntry[] = [
        userEntry("different ops"),
        assistantEntry([{ name: "Read", input: { file_path: "src/a.ts" } }]),
        errorToolResult("Error: not found"),
        assistantEntry([{ name: "Edit", input: { file_path: "src/b.ts" } }]),
        errorToolResult("Error: denied"),
      ];
      const findings = lintSession(entries);
      expect(findings.some((f) => f.ruleId === "error-retry-loop")).toBe(false);
    });
  });

  // -- R7: no-output --------------------------------------------------------

  describe("no-output rule", () => {
    it("fires when 5+ tool calls with zero file modifications", () => {
      const entries: JsonlEntry[] = [
        userEntry("browse"),
        assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
        assistantEntry([{ name: "Read", input: { file_path: "b.ts" } }]),
        assistantEntry([{ name: "Grep", input: { pattern: "TODO" } }]),
        assistantEntry([{ name: "Grep", input: { pattern: "FIXME" } }]),
        assistantEntry([{ name: "Read", input: { file_path: "c.ts" } }]),
      ];
      const findings = lintSession(entries);
      const noOutput = findings.find((f) => f.ruleId === "no-output");
      expect(noOutput).toBeDefined();
      expect(noOutput!.severity).toBe("info");
      expect(noOutput!.message).toContain("5 tool calls");
    });

    it("does not fire when files are modified", () => {
      const entries: JsonlEntry[] = [
        userEntry("work"),
        assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
        assistantEntry([{ name: "Read", input: { file_path: "b.ts" } }]),
        assistantEntry([{ name: "Grep", input: { pattern: "TODO" } }]),
        assistantEntry([{ name: "Grep", input: { pattern: "FIXME" } }]),
        assistantEntry([
          { name: "Edit", input: { file_path: "a.ts" } },
        ]),
      ];
      const findings = lintSession(entries);
      expect(findings.some((f) => f.ruleId === "no-output")).toBe(false);
    });
  });

  // -- Clean session --------------------------------------------------------

  it("returns empty for a clean session", () => {
    const entries: JsonlEntry[] = [
      userEntry("simple task"),
      assistantEntry([{ name: "Read", input: { file_path: "a.ts" } }]),
      assistantEntry([{ name: "Edit", input: { file_path: "a.ts" } }]),
    ];
    const findings = lintSession(entries);
    expect(findings).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(lintSession([])).toEqual([]);
  });
});
