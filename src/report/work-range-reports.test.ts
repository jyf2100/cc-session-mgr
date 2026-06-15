import { describe, it, expect } from "vitest";
import type {
  WorkMonthlyReportData,
  WorkQuarterlyReportData,
  WorkProjectRange,
} from "../types/index.js";
import { generateWorkMonthlyReport } from "./work-monthly.js";
import { generateWorkQuarterlyReport } from "./work-quarterly.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeProjectRange(overrides: Partial<WorkProjectRange> = {}): WorkProjectRange {
  return {
    projectName: "/project/test-project",
    sessions: [] as unknown as WorkProjectRange["sessions"],
    projectSummary: null,
    breakdown: [],
    topFiles: [],
    totalCost: 0.05,
    totalInputTokens: 100,
    totalOutputTokens: 50,
    ...overrides,
  };
}

function makeMonthlyData(
  overrides: Partial<WorkMonthlyReportData> = {},
): WorkMonthlyReportData {
  return {
    year: 2026,
    month: 6,
    label: "2026-06",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    projects: [],
    totalSessions: 0,
    totalCost: 0,
    ...overrides,
  };
}

function makeQuarterlyData(
  overrides: Partial<WorkQuarterlyReportData> = {},
): WorkQuarterlyReportData {
  return {
    year: 2026,
    quarter: 2,
    label: "2026-Q2",
    startDate: "2026-04-01",
    endDate: "2026-06-30",
    projects: [],
    totalSessions: 0,
    totalCost: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateWorkMonthlyReport
// ---------------------------------------------------------------------------

describe("generateWorkMonthlyReport", () => {
  it("outputs empty report when no sessions", () => {
    const data = makeMonthlyData();
    const md = generateWorkMonthlyReport(data);

    expect(md).toContain("# 工作月报: 2026-06");
    expect(md).toContain("No work sessions found");
  });

  it("renders header with metadata", () => {
    const data = makeMonthlyData({
      totalSessions: 5,
      totalCost: 1.23,
    });
    const md = generateWorkMonthlyReport(data);

    expect(md).toContain("# 工作月报: 2026-06");
    expect(md).toContain("2026-06-01 — 2026-06-30");
    expect(md).toContain("5 个工作会话");
    expect(md).toContain("$1.23");
  });

  it("renders project with weekly breakdown", () => {
    const project = makeProjectRange({
      breakdown: [
        { label: "2026-W23", startDate: "2026-06-01", endDate: "2026-06-07", sessionCount: 2 },
        { label: "2026-W24", startDate: "2026-06-08", endDate: "2026-06-14", sessionCount: 3 },
      ],
    });

    const data = makeMonthlyData({
      projects: [project],
      totalSessions: 5,
      totalCost: 0.5,
    });

    const md = generateWorkMonthlyReport(data);

    expect(md).toContain("### 周度分布");
    expect(md).toContain("**2026-W23**");
    expect(md).toContain("**2026-W24**");
    expect(md).toContain("2 个活跃日");
    expect(md).toContain("3 个活跃日");
  });

  it("renders project summary when present", () => {
    const project = makeProjectRange({
      projectSummary: "Built the monthly report feature with weekly breakdown.",
    });

    const data = makeMonthlyData({
      projects: [project],
      totalSessions: 3,
      totalCost: 0.3,
    });

    const md = generateWorkMonthlyReport(data);

    expect(md).toContain("Built the monthly report feature");
  });

  it("renders top files section", () => {
    const project = makeProjectRange({
      topFiles: [
        { filePath: "src/report/work-monthly.ts", editCount: 15 },
        { filePath: "src/types/index.ts", editCount: 8 },
      ],
    });

    const data = makeMonthlyData({
      projects: [project],
      totalSessions: 2,
      totalCost: 0.2,
    });

    const md = generateWorkMonthlyReport(data);

    expect(md).toContain("### 主要文件变更");
    expect(md).toContain("work-monthly.ts (15 edits)");
    expect(md).toContain("index.ts (8 edits)");
  });

  it("uses last path segment as project display name", () => {
    const project = makeProjectRange({
      projectName: "/home/user/projects/my-app",
    });

    const data = makeMonthlyData({
      projects: [project],
      totalSessions: 1,
      totalCost: 0.1,
    });

    const md = generateWorkMonthlyReport(data);

    expect(md).toContain("## my-app");
  });

  it("renders multiple projects", () => {
    const data = makeMonthlyData({
      projects: [
        makeProjectRange({ projectName: "/proj/alpha" }),
        makeProjectRange({ projectName: "/proj/beta" }),
      ],
      totalSessions: 4,
      totalCost: 0.4,
    });

    const md = generateWorkMonthlyReport(data);

    expect(md).toContain("## alpha");
    expect(md).toContain("## beta");
  });
});

// ---------------------------------------------------------------------------
// generateWorkQuarterlyReport
// ---------------------------------------------------------------------------

describe("generateWorkQuarterlyReport", () => {
  it("outputs empty report when no sessions", () => {
    const data = makeQuarterlyData();
    const md = generateWorkQuarterlyReport(data);

    expect(md).toContain("# 工作季报: 2026-Q2");
    expect(md).toContain("No work sessions found");
  });

  it("renders header with quarterly metadata", () => {
    const data = makeQuarterlyData({
      totalSessions: 20,
      totalCost: 5.67,
    });
    const md = generateWorkQuarterlyReport(data);

    expect(md).toContain("# 工作季报: 2026-Q2");
    expect(md).toContain("2026-04-01 — 2026-06-30");
    expect(md).toContain("20 个工作会话");
    expect(md).toContain("$5.67");
  });

  it("renders project with monthly breakdown (not weekly)", () => {
    const project = makeProjectRange({
      breakdown: [
        { label: "2026-04", startDate: "2026-04-01", endDate: "2026-04-30", sessionCount: 5 },
        { label: "2026-05", startDate: "2026-05-01", endDate: "2026-05-31", sessionCount: 8 },
        { label: "2026-06", startDate: "2026-06-01", endDate: "2026-06-30", sessionCount: 7 },
      ],
    });

    const data = makeQuarterlyData({
      projects: [project],
      totalSessions: 20,
      totalCost: 3.0,
    });

    const md = generateWorkQuarterlyReport(data);

    // Quarterly uses "月度分布" not "周度分布"
    expect(md).toContain("### 月度分布");
    expect(md).not.toContain("### 周度分布");
    expect(md).toContain("**2026-04**");
    expect(md).toContain("**2026-05**");
    expect(md).toContain("**2026-06**");
  });

  it("renders project summary and top files", () => {
    const project = makeProjectRange({
      projectSummary: "Q2 focused on building the reporting pipeline.",
      topFiles: [
        { filePath: "src/report/pipeline.ts", editCount: 25 },
      ],
    });

    const data = makeQuarterlyData({
      projects: [project],
      totalSessions: 10,
      totalCost: 2.0,
    });

    const md = generateWorkQuarterlyReport(data);

    expect(md).toContain("Q2 focused on building the reporting pipeline");
    expect(md).toContain("### 主要文件变更");
    expect(md).toContain("pipeline.ts (25 edits)");
  });

  it("uses last path segment as project display name", () => {
    const project = makeProjectRange({
      projectName: "/Volumes/work/frontend-dashboard",
    });

    const data = makeQuarterlyData({
      projects: [project],
      totalSessions: 3,
      totalCost: 0.5,
    });

    const md = generateWorkQuarterlyReport(data);

    expect(md).toContain("## frontend-dashboard");
  });
});
