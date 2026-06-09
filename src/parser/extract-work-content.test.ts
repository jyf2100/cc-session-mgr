import { describe, it, expect } from "vitest";
import type { JsonlEntry } from "../types/index.js";
import { extractWorkContent } from "./extract-work-content.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeUserEntry(content: unknown, overrides?: Partial<JsonlEntry>): JsonlEntry {
  return {
    type: "user",
    message: { role: "user", content },
    timestamp: "2026-06-09T10:00:00Z",
    ...overrides,
  };
}

function makeAssistantEntry(
  content: unknown,
  overrides?: Partial<JsonlEntry>,
): JsonlEntry {
  return {
    type: "assistant",
    message: { role: "assistant", content },
    timestamp: "2026-06-09T10:01:00Z",
    ...overrides,
  };
}

function makeToolUse(name: string, input: Record<string, unknown>): Record<string, unknown> {
  return { type: "tool_use", name, input };
}

function makeTextBlock(text: string): Record<string, unknown> {
  return { type: "text", text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractWorkContent", () => {
  // --- User intent ---

  it("extracts primary intent from first user message", () => {
    const entries = [
      makeUserEntry("Add a web UI for session browsing"),
      makeAssistantEntry("I'll help you with that."),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.primaryIntent).toBe("Add a web UI for session browsing");
  });

  it("truncates long user intent to 200 characters", () => {
    const longText = "A".repeat(300);
    const entries = [makeUserEntry(longText)];
    const result = extractWorkContent(entries, [], null);
    expect(result.primaryIntent.length).toBe(200);
    expect(result.primaryIntent.endsWith("…")).toBe(true);
  });

  it("falls back to customTitle when no user messages", () => {
    const entries = [makeAssistantEntry("Done.")];
    const result = extractWorkContent(entries, [], "My Session Title");
    expect(result.primaryIntent).toBe("My Session Title");
  });

  it("returns 'Untitled session' when no user messages and no title", () => {
    const entries = [makeAssistantEntry("Done.")];
    const result = extractWorkContent(entries, [], null);
    expect(result.primaryIntent).toBe("Untitled session");
  });

  it("extracts intent from content block arrays", () => {
    const entries = [
      makeUserEntry([{ type: "text", text: "Fix the parser bug" }]),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.primaryIntent).toBe("Fix the parser bug");
  });

  // --- Tool call summary ---

  it("counts tool calls by name", () => {
    const entries = [
      makeAssistantEntry([
        makeToolUse("Bash", { command: "npm test" }),
        makeTextBlock("Running tests..."),
      ]),
      makeAssistantEntry([
        makeToolUse("Write", { file_path: "src/a.ts" }),
      ]),
      makeAssistantEntry([
        makeToolUse("Bash", { command: "npm run build" }),
        makeToolUse("Edit", { file_path: "src/b.ts" }),
      ]),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.toolCallSummary).toEqual({
      Bash: 2,
      Write: 1,
      Edit: 1,
    });
  });

  it("returns empty toolCallSummary when no tool calls", () => {
    const entries = [
      makeAssistantEntry([makeTextBlock("Just text, no tools.")]),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.toolCallSummary).toEqual({});
  });

  // --- Bash commands ---

  it("extracts Bash commands", () => {
    const entries = [
      makeAssistantEntry([makeToolUse("Bash", { command: "npm test" })]),
      makeAssistantEntry([makeToolUse("Bash", { command: "npm run build" })]),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.bashCommands).toEqual(["npm test", "npm run build"]);
  });

  it("deduplicates consecutive identical Bash commands", () => {
    const entries = [
      makeAssistantEntry([makeToolUse("Bash", { command: "npm test" })]),
      makeAssistantEntry([makeToolUse("Bash", { command: "npm test" })]),
      makeAssistantEntry([makeToolUse("Bash", { command: "npm run build" })]),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.bashCommands).toEqual(["npm test", "npm run build"]);
  });

  it("caps Bash commands at 20", () => {
    const entries = Array.from({ length: 25 }, (_, i) =>
      makeAssistantEntry([makeToolUse("Bash", { command: `cmd ${i}` })]),
    );
    const result = extractWorkContent(entries, [], null);
    expect(result.bashCommands.length).toBe(20);
  });

  // --- Module summary ---

  it("groups file edits by src/ subdirectory", () => {
    const paths = [
      "src/parser/parse-jsonl.ts",
      "src/parser/extract-metadata.ts",
      "src/report/daily.ts",
      "package.json",
    ];
    const result = extractWorkContent([], paths, null);
    expect(result.moduleSummary).toEqual([
      "parser (2)",
      "report (1)",
      "config (1)",
    ]);
  });

  it("groups root-level files", () => {
    const paths = ["package.json", "README.md", "tsconfig.json"];
    const result = extractWorkContent([], paths, null);
    expect(result.moduleSummary).toEqual(["config (3)"]);
  });

  it("returns empty moduleSummary for no file edits", () => {
    const result = extractWorkContent([], [], null);
    expect(result.moduleSummary).toEqual([]);
  });

  // --- Assistant snippets ---

  it("extracts up to 5 assistant text snippets", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeAssistantEntry([makeTextBlock(`Response ${i}`)]),
    );
    const result = extractWorkContent(entries, [], null);
    expect(result.assistantSnippets).toHaveLength(5);
    expect(result.assistantSnippets[0]).toBe("Response 0");
    expect(result.assistantSnippets[4]).toBe("Response 4");
  });

  it("truncates snippets to 150 characters", () => {
    const entries = [
      makeAssistantEntry([makeTextBlock("A".repeat(200))]),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.assistantSnippets[0].length).toBe(150);
    expect(result.assistantSnippets[0].endsWith("…")).toBe(true);
  });

  it("returns empty snippets when only tool_use blocks present", () => {
    const entries = [
      makeAssistantEntry([makeToolUse("Write", { file_path: "a.ts" })]),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.assistantSnippets).toEqual([]);
  });

  // --- Compacted sessions ---

  it("extracts summary from summary entries", () => {
    const entries: JsonlEntry[] = [
      makeUserEntry("Do something"),
      {
        type: "summary",
        message: { role: "user", content: "Previous conversation about web UI implementation" },
        timestamp: "2026-06-09T10:00:00Z",
      },
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.compactedSummary).toBe("Previous conversation about web UI implementation");
  });

  it("truncates summary to 500 characters", () => {
    const longSummary = "S".repeat(600);
    const entries: JsonlEntry[] = [
      {
        type: "summary",
        message: { role: "user", content: longSummary },
        timestamp: "2026-06-09T10:00:00Z",
      },
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.compactedSummary!.length).toBe(500);
  });

  it("returns null compactedSummary when no summary entries", () => {
    const entries = [
      makeUserEntry("Hello"),
      makeAssistantEntry("Hi"),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.compactedSummary).toBeNull();
  });

  // --- Empty / edge cases ---

  it("returns defaults for empty entries array", () => {
    const result = extractWorkContent([], [], null);
    expect(result.primaryIntent).toBe("Untitled session");
    expect(result.toolCallSummary).toEqual({});
    expect(result.bashCommands).toEqual([]);
    expect(result.moduleSummary).toEqual([]);
    expect(result.assistantSnippets).toEqual([]);
    expect(result.compactedSummary).toBeNull();
  });

  it("handles full extraction from mixed session", () => {
    const entries: JsonlEntry[] = [
      makeUserEntry("Build the report module"),
      makeAssistantEntry([
        makeTextBlock("I'll create the report generators."),
        makeToolUse("Write", { file_path: "src/report/work-daily.ts" }),
      ]),
      makeAssistantEntry([
        makeToolUse("Bash", { command: "npm test" }),
        makeTextBlock("All tests pass."),
      ]),
      makeAssistantEntry([
        makeToolUse("Edit", { file_path: "src/report/work-daily.ts" }),
      ]),
    ];

    const result = extractWorkContent(
      entries,
      ["src/report/work-daily.ts", "src/types/index.ts"],
      null,
    );

    expect(result.primaryIntent).toBe("Build the report module");
    expect(result.toolCallSummary.Write).toBe(1);
    expect(result.toolCallSummary.Bash).toBe(1);
    expect(result.toolCallSummary.Edit).toBe(1);
    expect(result.bashCommands).toEqual(["npm test"]);
    expect(result.moduleSummary).toEqual(["report (1)", "types (1)"]);
    expect(result.assistantSnippets).toHaveLength(2);
  });
});

  // --- extractCommandArgs (tested via extractWorkContent) ---

  it("extracts command-args text as primary intent, not command name", () => {
    const entries = [
      makeUserEntry(
        "<command-message>opsx:propose</command-message>\n<command-name>/opsx:propose</command-name>\n<command-args>我想选择项目-日期浏览session信息</command-args>",
      ),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.primaryIntent).toBe("我想选择项目-日期浏览session信息");
    expect(result.primaryIntent).not.toContain("opsx:propose");
  });

  it("extracts multiline command-args fully", () => {
    const args = "第一行\n第二行\n第三行";
    const entries = [
      makeUserEntry(
        `<command-message>opsx:propose</command-message>\n<command-name>/opsx:propose</command-name>\n<command-args>${args}</command-args>`,
      ),
    ];
    const result = extractWorkContent(entries, [], null);
    expect(result.primaryIntent).toContain("第一行");
    expect(result.primaryIntent).toContain("第三行");
  });

  it("falls back gracefully when closing tag is missing", () => {
    const entries = [
      makeUserEntry(
        "<command-message>opsx:propose</command-message>\n<command-name>/opsx:propose</command-name>\n<command-args>some argument text",
      ),
    ];
    // Without closing tag, extractCommandArgs returns null, falls back to first line
    const result = extractWorkContent(entries, [], null);
    // Should still extract something reasonable
    expect(result.primaryIntent).toBeTruthy();
  });

  it("falls back to first line for empty command-args", () => {
    const entries = [
      makeUserEntry(
        "<command-message>opsx:propose</command-message>\n<command-name>/opsx:propose</command-name>\n<command-args></command-args>",
      ),
    ];
    // Empty args, so extractCommandArgs returns null; falls back to stripped first line
    const result = extractWorkContent(entries, [], null);
    expect(result.primaryIntent).toBeTruthy();
  });
