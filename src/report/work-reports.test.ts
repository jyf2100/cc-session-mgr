import { describe, it, expect } from "vitest";
import type {
  WorkDailyData,
  WorkWeeklyData,
  SessionWorkSummary,
  WorkContent,
  WorkProjectDay,
} from "../types/index.js";
import { generateWorkDailyReport } from "./work-daily.js";
import { generateWorkWeeklyReport } from "./work-weekly.js";

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

function makeSession(intent: string, modules?: string[]): SessionWorkSummary {
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
    workContent: makeWorkContent({
      primaryIntent: intent,
      moduleSummary: modules ?? [],
    }),
  };
}

function makeProjectDay(
  name: string,
  sessions: SessionWorkSummary[],
): WorkProjectDay {
  return { projectName: name, sessions };
}

// ---------------------------------------------------------------------------
// generateWorkDailyReport
// ---------------------------------------------------------------------------

describe("generateWorkDailyReport", () => {
  it("generates report for multi-project day", () => {
    const data: WorkDailyData = {
      date: "2026-06-09",
      projects: [
        makeProjectDay("/proj/alpha", [
          makeSession("Build auth module", ["auth (2 files)"]),
          makeSession("Fix login bug", []),
        ]),
        makeProjectDay("/proj/beta", [
          makeSession("Add dashboard charts", ["components (3 files)"]),
        ]),
      ],
      sessionCount: 3,
    };

    const report = generateWorkDailyReport(data);

    expect(report).toContain("# 工作日报: 2026-06-09");
    expect(report).toContain("3 个工作会话");
    expect(report).toContain("## alpha");
    expect(report).toContain("## beta");
    expect(report).toContain("- Build auth module");
    expect(report).toContain("- Fix login bug");
    expect(report).toContain("- Add dashboard charts");
  });

  it("generates report for empty day", () => {
    const data: WorkDailyData = {
      date: "2026-06-09",
      projects: [],
      sessionCount: 0,
    };

    const report = generateWorkDailyReport(data);

    expect(report).toContain("No work sessions found for 2026-06-09");
    expect(report).not.toContain("## ");
  });

  it("formats intent-only bullet without modules", () => {
    const data: WorkDailyData = {
      date: "2026-06-09",
      projects: [
        makeProjectDay("/proj/x", [makeSession("Quick fix")]),
      ],
      sessionCount: 1,
    };

    const report = generateWorkDailyReport(data);

    expect(report).toContain("- Quick fix");
  });

  it("shows file count and module breakdown", () => {
    const session = makeSession("Refactor parser", ["parser (3)", "types (1)"]);
    session.fileEdits = [
      { filePath: "src/parser/parse.ts", editCount: 1 },
      { filePath: "src/parser/extract.ts", editCount: 2 },
      { filePath: "src/parser/index.ts", editCount: 1 },
      { filePath: "src/types/index.ts", editCount: 1 },
    ];

    const data: WorkDailyData = {
      date: "2026-06-09",
      projects: [makeProjectDay("/proj/x", [session])],
      sessionCount: 1,
    };

    const report = generateWorkDailyReport(data);

    expect(report).toContain("**Refactor parser**");
    expect(report).toContain("4 files");
    expect(report).toContain("parser (3)");
    expect(report).toContain("types (1)");
  });

  it("prefers llmSummary over primaryIntent", () => {
    const session = makeSession("Build auth module");
    session.workContent.llmSummary = "实现了认证模块的登录和会话管理功能";

    const data: WorkDailyData = {
      date: "2026-06-09",
      projects: [makeProjectDay("/proj/x", [session])],
      sessionCount: 1,
    };

    const report = generateWorkDailyReport(data);

    expect(report).toContain("实现了认证模块的登录和会话管理功能");
    expect(report).not.toContain("Build auth module");
  });
});

// ---------------------------------------------------------------------------
// generateWorkWeeklyReport
// ---------------------------------------------------------------------------

describe("generateWorkWeeklyReport", () => {
  it("generates multi-day weekly report", () => {
    const data: WorkWeeklyData = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-12",
      days: [
        {
          date: "2026-06-08",
          projects: [makeProjectDay("/proj/a", [makeSession("Setup project")])],
          sessionCount: 1,
        },
        {
          date: "2026-06-10",
          projects: [makeProjectDay("/proj/a", [makeSession("Add features", ["core (2 files)"])])],
          sessionCount: 1,
        },
      ],
      totalSessions: 2,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("# 工作周报: 2026-W24");
    expect(report).toContain("2026-06-08 — 2026-06-12");
    expect(report).toContain("2 个工作会话");
    expect(report).toContain("### 2026-06-08");
    expect(report).toContain("### 2026-06-10");
    expect(report).toContain("- Setup project");
    expect(report).toContain("- Add features");
  });

  it("generates report for empty week", () => {
    const data: WorkWeeklyData = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      days: [],
      totalSessions: 0,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("No work sessions found for week 2026-W24");
  });

  it("handles single-day week", () => {
    const data: WorkWeeklyData = {
      weekLabel: "2026-W23",
      startDate: "2026-06-07",
      endDate: "2026-06-07",
      days: [
        {
          date: "2026-06-07",
          projects: [makeProjectDay("/proj/x", [makeSession("Bugfix")])],
          sessionCount: 1,
        },
      ],
      totalSessions: 1,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("### 2026-06-07");
    expect(report).toContain("- Bugfix");
  });

  it("prefers llmSummary over primaryIntent", () => {
    const session = makeSession("Build auth module");
    session.workContent.llmSummary = "实现了认证模块的登录和会话管理功能";

    const data: WorkWeeklyData = {
      weekLabel: "2026-W23",
      startDate: "2026-06-07",
      endDate: "2026-06-07",
      days: [
        {
          date: "2026-06-07",
          projects: [makeProjectDay("/proj/x", [session])],
          sessionCount: 1,
        },
      ],
      totalSessions: 1,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("实现了认证模块的登录和会话管理功能");
    expect(report).not.toContain("Build auth module");
  });
});
