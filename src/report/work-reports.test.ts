import { describe, it, expect } from "vitest";
import type {
  WorkDailyData,
  WorkWeeklyReportData,
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
  it("generates project-centric weekly report", () => {
    const data: WorkWeeklyReportData = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-12",
      projects: [
        {
          projectName: "/proj/cc-session-mgr",
          sessions: [
            { ...makeSession("Setup project"), startTime: "2026-06-08T10:00:00Z" },
            { ...makeSession("Add features", ["core (2 files)"]), startTime: "2026-06-10T10:00:00Z" },
          ],
          projectSummary: "Completed initial setup and added core features.",
          sessionDates: new Map(),
        },
      ],
      totalSessions: 2,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("# 工作周报: 2026-W24");
    expect(report).toContain("2026-06-08 — 2026-06-12");
    expect(report).toContain("2 个工作会话");
    expect(report).toContain("## cc-session-mgr (2 sessions)");
    expect(report).toContain("Completed initial setup and added core features.");
    expect(report).toContain("06-08");
    expect(report).toContain("06-10");
    expect(report).toContain("Setup project");
    expect(report).toContain("Add features");
  });

  it("generates report for empty week", () => {
    const data: WorkWeeklyReportData = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      projects: [],
      totalSessions: 0,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("No work sessions found for week 2026-W24");
  });

  it("handles multiple projects", () => {
    const data: WorkWeeklyReportData = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      projects: [
        {
          projectName: "/proj/alpha",
          sessions: [makeSession("Fix bug")],
          projectSummary: null,
          sessionDates: new Map(),
        },
        {
          projectName: "/proj/beta",
          sessions: [makeSession("Add feature")],
          projectSummary: null,
          sessionDates: new Map(),
        },
      ],
      totalSessions: 2,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("## alpha (1 session)");
    expect(report).toContain("## beta (1 session)");
  });

  it("omits projectSummary section when null", () => {
    const data: WorkWeeklyReportData = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      projects: [
        {
          projectName: "/proj/x",
          sessions: [makeSession("Quick fix")],
          projectSummary: null,
          sessionDates: new Map(),
        },
      ],
      totalSessions: 1,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("## x (1 session)");
    // No extra text between heading and session bullets (no projectSummary)
    const headingEndIdx = report.indexOf("## x (1 session)") + "## x (1 session)".length;
    const bulletIdx = report.indexOf("- ");
    const betweenText = report.slice(headingEndIdx, bulletIdx);
    // Should only have newlines, no summary paragraph
    expect(betweenText.replace(/\n/g, "").trim()).toBe("");
  });

  it("prefers llmSummary over primaryIntent in session bullets", () => {
    const session = makeSession("Build auth module");
    session.workContent.llmSummary = "实现了认证模块的登录和会话管理功能";

    const data: WorkWeeklyReportData = {
      weekLabel: "2026-W23",
      startDate: "2026-06-07",
      endDate: "2026-06-07",
      projects: [
        {
          projectName: "/proj/x",
          sessions: [session],
          projectSummary: null,
          sessionDates: new Map(),
        },
      ],
      totalSessions: 1,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("实现了认证模块的登录和会话管理功能");
    expect(report).not.toContain("Build auth module");
  });

  it("uses short date format (MM-DD) in bullets", () => {
    const data: WorkWeeklyReportData = {
      weekLabel: "2026-W24",
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      projects: [
        {
          projectName: "/proj/x",
          sessions: [{ ...makeSession("Work"), startTime: "2026-06-09T10:00:00Z" }],
          projectSummary: null,
          sessionDates: new Map(),
        },
      ],
      totalSessions: 1,
    };

    const report = generateWorkWeeklyReport(data);

    expect(report).toContain("06-09:");
    expect(report).not.toContain("2026-06-09:");
  });
});
