import { describe, it, expect } from "vitest";
import type {
  Phase,
  LintFinding,
  StandupReport,
  TimelineResult,
  PostmortemResult,
  SessionDiff,
  ContextScore,
} from "../types/index.js";
import {
  formatSessionReport,
  formatLintReport,
  formatStandupReport,
  formatDiffReport,
  formatContextReport,
} from "./session-report.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhase(overrides?: Partial<Phase>): Phase {
  return {
    index: 0,
    name: "Planning",
    startTime: "2026-06-12T10:00:00Z",
    endTime: "2026-06-12T10:05:00Z",
    durationMs: 300_000,
    entries: [],
    toolCalls: [{ toolName: "Read", input: { file_path: "/src/app.ts" } }],
    filesModified: ["src/app.ts"],
    errorCount: 0,
    retryCount: 0,
    costUSD: 0.05,
    ...overrides,
  };
}

function makeTimeline(overrides?: Partial<TimelineResult>): TimelineResult {
  return {
    entries: [],
    phases: [],
    summary: {
      totalDurationMs: 600_000,
      totalCost: 0.1,
      totalToolCalls: 5,
      wastedSpendUSD: 0,
    },
    ...overrides,
  };
}

function makePostmortem(
  overrides?: Partial<PostmortemResult>,
): PostmortemResult {
  return {
    crashInfo: null,
    rootCauseTimeline: [],
    agentsMdViolations: [],
    recoverySuggestions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatSessionReport
// ---------------------------------------------------------------------------

describe("formatSessionReport", () => {
  it("includes all major sections", () => {
    const markdown = formatSessionReport({
      phases: [makePhase()],
      lintFindings: [],
      timeline: makeTimeline(),
    });

    expect(markdown).toContain("# Session Analysis Report");
    expect(markdown).toContain("## Phases");
    expect(markdown).toContain("## Lint Findings");
    expect(markdown).toContain("## Timeline");
  });

  it("renders phase details with name, duration, cost, tools, and errors", () => {
    const markdown = formatSessionReport({
      phases: [
        makePhase({
          name: "Implementation",
          durationMs: 120_000,
          costUSD: 0.1234,
          toolCalls: [
            { toolName: "Edit", input: {} },
            { toolName: "Bash", input: {} },
          ],
          filesModified: ["src/app.ts", "src/util.ts"],
          errorCount: 2,
        }),
      ],
      lintFindings: [],
      timeline: makeTimeline(),
    });

    expect(markdown).toContain("Implementation");
    expect(markdown).toContain("$0.1234");
    expect(markdown).toContain("Edit, Bash");
    expect(markdown).toContain("src/app.ts, src/util.ts");
    expect(markdown).toContain("2 errors");
  });

  it("shows no-phases message when empty", () => {
    const markdown = formatSessionReport({
      phases: [],
      lintFindings: [],
      timeline: makeTimeline(),
    });

    expect(markdown).toContain("_No phases detected._");
  });

  it("renders lint findings with severity icons", () => {
    const findings: LintFinding[] = [
      {
        ruleId: "tool-loop",
        severity: "error",
        message: "Same tool called 5 times in a row",
        entries: [3, 4, 5, 6, 7],
      },
      {
        ruleId: "no-output",
        severity: "warning",
        message: "Session ended with no file modifications",
        entries: [10],
      },
    ];

    const markdown = formatSessionReport({
      phases: [],
      lintFindings: findings,
      timeline: makeTimeline(),
    });

    expect(markdown).toContain("❌ **tool-loop**");
    expect(markdown).toContain("⚠️ **no-output**");
  });

  it("shows clean lint when no findings", () => {
    const markdown = formatSessionReport({
      phases: [],
      lintFindings: [],
      timeline: makeTimeline(),
    });

    expect(markdown).toContain("✅ No issues detected");
  });

  it("renders timeline summary with tool calls, duration, and cost", () => {
    const markdown = formatSessionReport({
      phases: [],
      lintFindings: [],
      timeline: makeTimeline({
        summary: {
          totalDurationMs: 1800_000,
          totalCost: 0.5,
          totalToolCalls: 12,
          wastedSpendUSD: 0,
        },
      }),
    });

    expect(markdown).toContain("12");
    expect(markdown).toContain("$0.5000");
  });

  it("renders timeline phases table", () => {
    const markdown = formatSessionReport({
      phases: [],
      lintFindings: [],
      timeline: makeTimeline({
        phases: [
          {
            name: "Setup",
            startIndex: 0,
            endIndex: 3,
            durationMs: 60_000,
            costUSD: 0.01,
            toolCallCount: 2,
            errorCount: 0,
          },
          {
            name: "Build",
            startIndex: 4,
            endIndex: 10,
            durationMs: 300_000,
            costUSD: 0.2,
            toolCallCount: 8,
            errorCount: 1,
          },
        ],
      }),
    });

    expect(markdown).toContain("Setup");
    expect(markdown).toContain("Build");
    expect(markdown).toContain("1–4");
    expect(markdown).toContain("5–11");
  });

  it("shows wasted spend warning when non-zero", () => {
    const markdown = formatSessionReport({
      phases: [],
      lintFindings: [],
      timeline: makeTimeline({
        summary: {
          totalDurationMs: 600_000,
          totalCost: 0.1,
          totalToolCalls: 5,
          wastedSpendUSD: 0.03,
        },
      }),
    });

    expect(markdown).toContain("Wasted spend");
    expect(markdown).toContain("$0.0300");
  });

  it("includes optional postmortem section", () => {
    const markdown = formatSessionReport({
      phases: [],
      lintFindings: [],
      timeline: makeTimeline(),
      postmortem: makePostmortem({
        crashInfo: {
          type: "context_window_exceeded",
          timestamp: "2026-06-12T10:30:00Z",
          lastUserPrompt: "Refactor the entire module",
        },
        rootCauseTimeline: [
          { entryIndex: 5, annotation: "Large file read", isTrigger: false },
          { entryIndex: 8, annotation: "Context exceeded", isTrigger: true },
        ],
        agentsMdViolations: [
          { rule: "max-file-size", description: "Missing file size limit" },
        ],
        recoverySuggestions: ["Split into smaller tasks"],
      }),
    });

    expect(markdown).toContain("## Postmortem");
    expect(markdown).toContain("context_window_exceeded");
    expect(markdown).toContain("Refactor the entire module");
    expect(markdown).toContain("Root Cause Timeline");
    expect(markdown).toContain("CLAUDE.md Violations");
    expect(markdown).toContain("Recovery Suggestions");
    expect(markdown).toContain("Split into smaller tasks");
    expect(markdown).toContain("🔥");
  });

  it("shows normal completion when no crash", () => {
    const markdown = formatSessionReport({
      phases: [],
      lintFindings: [],
      timeline: makeTimeline(),
      postmortem: makePostmortem(),
    });

    expect(markdown).toContain("Session completed normally");
  });
});

// ---------------------------------------------------------------------------
// formatLintReport
// ---------------------------------------------------------------------------

describe("formatLintReport", () => {
  it("shows clean report when no findings", () => {
    const markdown = formatLintReport([]);
    expect(markdown).toContain("✅ No issues detected");
    expect(markdown).toContain("# Session Lint Report");
  });

  it("counts errors and warnings", () => {
    const markdown = formatLintReport([
      {
        ruleId: "tool-loop",
        severity: "error",
        message: "Loop",
        entries: [1],
      },
      {
        ruleId: "tool-loop",
        severity: "error",
        message: "Loop 2",
        entries: [2],
      },
      {
        ruleId: "no-output",
        severity: "warning",
        message: "No output",
        entries: [5],
      },
    ]);

    expect(markdown).toContain("2 errors, 1 warnings");
  });

  it("includes entry indices for each finding", () => {
    const markdown = formatLintReport([
      {
        ruleId: "tool-loop",
        severity: "error",
        message: "Loop detected",
        entries: [3, 4, 5],
      },
    ]);

    expect(markdown).toContain("3, 4, 5");
  });
});

// ---------------------------------------------------------------------------
// formatStandupReport
// ---------------------------------------------------------------------------

describe("formatStandupReport", () => {
  function makeStandup(overrides?: Partial<StandupReport>): StandupReport {
    return {
      approaches: [],
      abandoned: [],
      uncertainties: [],
      reviewItems: [],
      newDependencies: [],
      contextResetCount: 0,
      ...overrides,
    };
  }

  it("renders approaches with files", () => {
    const report = makeStandup({
      approaches: [
        {
          description: "Implemented auth middleware",
          filesModified: ["src/auth.ts"],
        },
        { description: "Added tests", filesModified: [] },
      ],
    });

    const markdown = formatStandupReport(report);
    expect(markdown).toContain("## Approaches");
    expect(markdown).toContain("Implemented auth middleware");
    expect(markdown).toContain("src/auth.ts");
    expect(markdown).toContain("Added tests");
  });

  it("renders abandoned approaches", () => {
    const report = makeStandup({
      abandoned: [
        { description: "Tried custom parser", filesModified: [] },
      ],
    });

    const markdown = formatStandupReport(report);
    expect(markdown).toContain("## Abandoned");
    expect(markdown).toContain("Tried custom parser");
  });

  it("renders uncertainties with entry index", () => {
    const report = makeStandup({
      uncertainties: [
        { userMessage: "Should we use Redis?", entryIndex: 3 },
      ],
    });

    const markdown = formatStandupReport(report);
    expect(markdown).toContain("## Uncertainties");
    expect(markdown).toContain("Should we use Redis?");
    expect(markdown).toContain("entry 4"); // 1-indexed display
  });

  it("renders review items and new dependencies", () => {
    const report = makeStandup({
      reviewItems: ["Check error handling in module X"],
      newDependencies: ["zod@3.23.0"],
    });

    const markdown = formatStandupReport(report);
    expect(markdown).toContain("## Review Items");
    expect(markdown).toContain("Check error handling in module X");
    expect(markdown).toContain("## New Dependencies");
    expect(markdown).toContain("zod@3.23.0");
  });

  it("shows context reset count when non-zero", () => {
    const report = makeStandup({ contextResetCount: 2 });
    const markdown = formatStandupReport(report);
    expect(markdown).toContain("Context resets");
    expect(markdown).toContain("2");
  });

  it("omits empty sections", () => {
    const report = makeStandup();
    const markdown = formatStandupReport(report);
    expect(markdown).not.toContain("## Abandoned");
    expect(markdown).not.toContain("## Uncertainties");
    expect(markdown).not.toContain("## Review Items");
    expect(markdown).not.toContain("## New Dependencies");
    expect(markdown).not.toContain("Context resets");
  });
});

// ---------------------------------------------------------------------------
// formatDiffReport
// ---------------------------------------------------------------------------

describe("formatDiffReport", () => {
  it("renders phase alignment with status icons", () => {
    const diff: SessionDiff = {
      phaseAlignment: [
        {
          phaseA: makePhase({ name: "Setup" }),
          phaseB: makePhase({ name: "Setup" }),
          status: "matched",
        },
        {
          phaseA: null,
          phaseB: makePhase({ name: "Extra" }),
          status: "inserted",
        },
      ],
      metricDeltas: [],
      divergencePoints: [],
    };

    const markdown = formatDiffReport(diff);
    expect(markdown).toContain("✅ Setup (matched)");
    expect(markdown).toContain("➕ Extra (inserted)");
  });

  it("renders metric deltas with +/- signs", () => {
    const diff: SessionDiff = {
      phaseAlignment: [],
      metricDeltas: [
        {
          phaseName: "Build",
          costDelta: 0.05,
          toolCallCountDelta: 3,
          errorCountDelta: -1,
          durationDeltaMs: 120_000,
        },
      ],
      divergencePoints: [],
    };

    const markdown = formatDiffReport(diff);
    expect(markdown).toContain("## Metric Deltas");
    expect(markdown).toContain("+$0.0500");
    expect(markdown).toContain("+3");
    expect(markdown).toContain("-1");
    expect(markdown).toContain("+120.0s");
  });

  it("renders divergence points with reason", () => {
    const diff: SessionDiff = {
      phaseAlignment: [],
      metricDeltas: [],
      divergencePoints: [
        {
          phaseName: "Deploy",
          reason: "cost_spike",
          description: "Cost 3x higher than expected",
        },
      ],
    };

    const markdown = formatDiffReport(diff);
    expect(markdown).toContain("## Divergences");
    expect(markdown).toContain("Deploy");
    expect(markdown).toContain("cost_spike");
    expect(markdown).toContain("Cost 3x higher than expected");
  });
});

// ---------------------------------------------------------------------------
// formatContextReport
// ---------------------------------------------------------------------------

describe("formatContextReport", () => {
  function makeScore(overrides?: Partial<ContextScore>): ContextScore {
    return {
      grade: "B",
      overallScore: 72,
      dimensions: {
        completeness: 80,
        specificity: 70,
        consistency: 65,
        recency: 100,
      },
      detectedSections: ["Build commands", "Architecture overview"],
      missingSections: ["Common pitfalls"],
      sessionCorrelation: "positive",
      ...overrides,
    };
  }

  it("renders grade with icon and score", () => {
    const markdown = formatContextReport(makeScore());
    expect(markdown).toContain("🔵 B");
    expect(markdown).toContain("72/100");
  });

  it("renders dimensions table", () => {
    const markdown = formatContextReport(makeScore());
    expect(markdown).toContain("Completeness");
    expect(markdown).toContain("Specificity");
    expect(markdown).toContain("Consistency");
    expect(markdown).toContain("Recency");
  });

  it("renders detected and missing sections", () => {
    const markdown = formatContextReport(makeScore());
    expect(markdown).toContain("✅ Build commands");
    expect(markdown).toContain("❌ Common pitfalls");
  });

  it("renders session correlation", () => {
    const markdown = formatContextReport(makeScore());
    expect(markdown).toContain("positive");
  });
});
