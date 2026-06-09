import { describe, it, expect } from "vitest";
import type { SessionWorkSummary, WorkContent } from "../types/index.js";
import { buildSummaryPrompt } from "./prompt.js";

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
