import { describe, it, expect } from "vitest";
import type { SessionWorkSummary, WorkContent } from "../types/index.js";
import { buildSummaryPrompt, buildProjectWeeklyPrompt } from "./prompt.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWorkContent(overrides?: Partial<WorkContent>): WorkContent {
  return {
    primaryIntent: "Test intent",
    userIntents: [],
    toolCallSummary: {},
    bashCommands: [],
    moduleSummary: [],
    assistantSnippets: [],
    compactedSummary: null,
    llmSummary: null,
    ...overrides,
  };
}

function makeSession(
  overrides?: Partial<SessionWorkSummary>,
): SessionWorkSummary {
  return {
    sessionId: "s1",
    projectPath: "/proj/test",
    encodedDir: "-proj-test",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T11:00:00Z",
    messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
    cost: {
      totalUSD: 0,
      source: "inline",
      incomplete: false,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: [],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    workContent: makeWorkContent(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildSummaryPrompt", () => {
  it("includes primary intent section", () => {
    const session = makeSession({
      workContent: makeWorkContent({ primaryIntent: "Build auth module" }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## Primary Intent");
    expect(prompt).toContain("Build auth module");
  });

  it("includes user intents section", () => {
    const session = makeSession({
      workContent: makeWorkContent({
        userIntents: ["Add login page", "Fix validation"],
      }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## User Intents");
    expect(prompt).toContain("- Add login page");
    expect(prompt).toContain("- Fix validation");
  });

  it("includes tool calls section sorted by count", () => {
    const session = makeSession({
      workContent: makeWorkContent({
        toolCallSummary: { Edit: 2, Bash: 5, Write: 1 },
      }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## Tool Calls");
    // Bash (5) should appear before Edit (2) and Write (1)
    const bashIdx = prompt.indexOf("Bash: 5");
    const editIdx = prompt.indexOf("Edit: 2");
    expect(bashIdx).toBeLessThan(editIdx);
  });

  it("includes module summary section", () => {
    const session = makeSession({
      workContent: makeWorkContent({
        moduleSummary: ["parser (3)", "report (2)"],
      }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## Modules Touched");
    expect(prompt).toContain("parser (3)");
    expect(prompt).toContain("report (2)");
  });

  it("includes file edits section", () => {
    const session = makeSession({
      fileEdits: [
        { filePath: "src/parser/parse.ts", editCount: 3 },
        { filePath: "src/types/index.ts", editCount: 1 },
      ],
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## Files Edited");
    expect(prompt).toContain("src/parser/parse.ts");
    expect(prompt).toContain("3 edits");
  });

  it("includes bash commands section", () => {
    const session = makeSession({
      workContent: makeWorkContent({
        bashCommands: ["npm test", "npm run build"],
      }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## Key Commands");
    expect(prompt).toContain("- npm test");
  });

  it("includes compacted summary section", () => {
    const session = makeSession({
      workContent: makeWorkContent({
        compactedSummary: "Previous work on parser implementation",
      }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## Session Summary");
    expect(prompt).toContain("Previous work on parser implementation");
  });

  it("includes assistant snippets section", () => {
    const session = makeSession({
      workContent: makeWorkContent({
        assistantSnippets: ["I've created the parser module."],
      }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## Assistant Output Samples");
    expect(prompt).toContain("I've created the parser module.");
  });

  it("ends with the task instruction", () => {
    const session = makeSession();
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("Summarize what this session accomplished");
  });

  it("skips primary intent when 'Untitled session'", () => {
    const session = makeSession({
      workContent: makeWorkContent({ primaryIntent: "Untitled session" }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).not.toContain("## Primary Intent");
  });

  it("handles minimal-data session (only compactedSummary)", () => {
    const session = makeSession({
      workContent: makeWorkContent({
        primaryIntent: "Untitled session",
        compactedSummary: "Refactored the report module",
      }),
    });
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("## Session Summary");
    expect(prompt).not.toContain("## Primary Intent");
    expect(prompt).toContain("Summarize what this session accomplished");
  });

  it("includes system prompt with language instruction", () => {
    const session = makeSession();
    const prompt = buildSummaryPrompt(session);
    expect(prompt).toContain("1-2 sentence summary");
    expect(prompt).toContain("same language");
  });
});

// ---------------------------------------------------------------------------
// buildProjectWeeklyPrompt
// ---------------------------------------------------------------------------

describe("buildProjectWeeklyPrompt", () => {
  it("includes project short name (last path segment)", () => {
    const sessions = [
      makeSession({ startTime: "2026-06-08T10:00:00Z" }),
    ];
    const prompt = buildProjectWeeklyPrompt("/work/my-project", sessions);
    expect(prompt).toContain("## Project: my-project");
    expect(prompt).not.toContain("/work/my-project");
  });

  it("lists sessions sorted by date with intent", () => {
    const sessions = [
      makeSession({
        startTime: "2026-06-09T14:00:00Z",
        workContent: makeWorkContent({ primaryIntent: "Fix tests" }),
      }),
      makeSession({
        startTime: "2026-06-08T10:00:00Z",
        workContent: makeWorkContent({ primaryIntent: "Add cache module" }),
      }),
    ];
    const prompt = buildProjectWeeklyPrompt("/proj/a", sessions);

    const idx08 = prompt.indexOf("2026-06-08");
    const idx09 = prompt.indexOf("2026-06-09");
    expect(idx08).toBeLessThan(idx09);
    expect(prompt).toContain("Add cache module");
    expect(prompt).toContain("Fix tests");
  });

  it("prefers llmSummary over compactedSummary over primaryIntent", () => {
    const sessions = [
      makeSession({
        startTime: "2026-06-08T10:00:00Z",
        workContent: makeWorkContent({
          primaryIntent: "raw intent",
          compactedSummary: "compacted version",
          llmSummary: "LLM generated summary",
        }),
      }),
    ];
    const prompt = buildProjectWeeklyPrompt("/proj/a", sessions);
    expect(prompt).toContain("LLM generated summary");
    expect(prompt).not.toContain("compacted version");
    expect(prompt).not.toContain("raw intent");
  });

  it("falls back to compactedSummary when no llmSummary", () => {
    const sessions = [
      makeSession({
        startTime: "2026-06-08T10:00:00Z",
        workContent: makeWorkContent({
          primaryIntent: "raw intent",
          compactedSummary: "compacted version",
          llmSummary: null,
        }),
      }),
    ];
    const prompt = buildProjectWeeklyPrompt("/proj/a", sessions);
    expect(prompt).toContain("compacted version");
    expect(prompt).not.toContain("raw intent");
  });

  it("includes module summary and file count per session", () => {
    const sessions = [
      makeSession({
        startTime: "2026-06-08T10:00:00Z",
        workContent: makeWorkContent({
          moduleSummary: ["parser (2)", "report (1)"],
        }),
        fileEdits: [
          { filePath: "src/a.ts", editCount: 1 },
          { filePath: "src/b.ts", editCount: 1 },
        ],
      }),
    ];
    const prompt = buildProjectWeeklyPrompt("/proj/a", sessions);
    expect(prompt).toContain("parser (2), report (1)");
    expect(prompt).toContain("2 files");
  });

  it("skips sessions with null startTime", () => {
    const sessions = [
      makeSession({ startTime: "2026-06-08T10:00:00Z" }),
      { ...makeSession({ startTime: "2026-06-08T10:00:00Z" }), startTime: null },
    ];
    const prompt = buildProjectWeeklyPrompt("/proj/a", sessions);
    // Only one session line should appear
    const matches = prompt.match(/^- 2026-\d{2}-\d{2}:/gm);
    expect(matches).toHaveLength(1);
  });

  it("ends with the weekly task instruction", () => {
    const sessions = [makeSession({ startTime: "2026-06-08T10:00:00Z" })];
    const prompt = buildProjectWeeklyPrompt("/proj/a", sessions);
    expect(prompt).toContain("Summarize the overall work done on this project this week in 2-3 sentences:");
  });

  it("includes the 2-3 sentence instruction in system prompt", () => {
    const sessions = [makeSession({ startTime: "2026-06-08T10:00:00Z" })];
    const prompt = buildProjectWeeklyPrompt("/proj/a", sessions);
    expect(prompt).toContain("2-3 sentence summary");
  });
});
