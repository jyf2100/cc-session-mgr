import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  SessionWorkSummary,
  WorkContent,
  DayIndexedWorkSession,
  WorkProjectRange,
} from "../types/index.js";
import { setTimezone, toDateStr } from "../cli/tz-utils.js";

// ---------------------------------------------------------------------------
// Mock the work-by-range aggregator (called directly by pipeline)
// ---------------------------------------------------------------------------

const mockAggregateWorkByRange = vi.fn();
const mockBuildMonthlyReportData = vi.fn();
const mockBuildQuarterlyReportData = vi.fn();

vi.mock("../aggregator/work-by-range.js", () => ({
  aggregateWorkByRange: (...args: unknown[]) => mockAggregateWorkByRange(...args),
  buildMonthlyReportData: (...args: unknown[]) => mockBuildMonthlyReportData(...args),
  buildQuarterlyReportData: (...args: unknown[]) => mockBuildQuarterlyReportData(...args),
}));

// Mock the summarize module
const mockSummarizeSessions = vi.fn().mockResolvedValue(undefined);
const mockSummarizeProjectMonthly = vi.fn().mockResolvedValue("Monthly project summary");
const mockSummarizeProjectQuarterly = vi.fn().mockResolvedValue("Quarterly project summary");

vi.mock("../summarize/index.js", () => ({
  summarizeSessions: (...args: unknown[]) => mockSummarizeSessions(...args),
  summarizeProjectWeekly: vi.fn().mockResolvedValue("Weekly summary"),
  summarizeProjectMonthly: (...args: unknown[]) => mockSummarizeProjectMonthly(...args),
  summarizeProjectQuarterly: (...args: unknown[]) => mockSummarizeProjectQuarterly(...args),
}));

// Mock other aggregators that pipeline imports but doesn't use for monthly/quarterly
vi.mock("../aggregator/work-by-date.js", () => ({
  aggregateWorkByDate: vi.fn(),
}));
vi.mock("../aggregator/work-by-week.js", () => ({
  aggregateWorkByWeek: vi.fn(),
  aggregateWorkByProject: vi.fn(),
}));

// Import after mocks are set up
const { buildWorkMonthlyMarkdown, buildWorkQuarterlyMarkdown } = await import("./pipeline.js");

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWorkSummary(
  overrides: Partial<SessionWorkSummary> & { startTime: string },
): SessionWorkSummary {
  return {
    sessionId: `session-${Math.random().toString(36).slice(2, 8)}`,
    projectPath: "/proj/app",
    encodedDir: "-proj-app",
    endTime: overrides.startTime,
    messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
    cost: {
      totalUSD: 0.05,
      source: "inline",
      incomplete: false,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: [],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    workContent: {
      primaryIntent: "Test",
      toolCallSummary: {},
      bashCommands: [],
      moduleSummary: [],
      assistantSnippets: [],
      compactedSummary: null,
      userIntents: [],
      llmSummary: null,
    },
    ...overrides,
  };
}

function toIndexed(summary: SessionWorkSummary): DayIndexedWorkSession {
  const date = toDateStr(summary.startTime) ?? "1970-01-01";
  return {
    summary,
    daySlices: [{
      date,
      messageCounts: { ...summary.messageCounts },
      cost: summary.cost.totalUSD,
      inputTokens: summary.cost.inputTokens,
      outputTokens: summary.cost.outputTokens,
      models: [],
      fileEdits: [],
      entryCount: 2,
    }],
  };
}

function makeProjectRange(overrides: Partial<WorkProjectRange> = {}): WorkProjectRange {
  return {
    projectName: "/proj/app",
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

beforeEach(() => {
  setTimezone("UTC");
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildWorkMonthlyMarkdown
// ---------------------------------------------------------------------------

describe("buildWorkMonthlyMarkdown", () => {
  it("returns null when no sessions in range", async () => {
    const indexed = [toIndexed(makeWorkSummary({ startTime: "2026-05-15T10:00:00Z" }))];
    mockAggregateWorkByRange.mockReturnValue(null);

    const result = await buildWorkMonthlyMarkdown(indexed, 2026, 6);

    expect(result).toBeNull();
    expect(mockAggregateWorkByRange).toHaveBeenCalledWith(
      indexed,
      { start: "2026-06-01", end: "2026-06-30" },
      "weekly",
    );
  });

  it("generates monthly report with correct header", async () => {
    const indexed = [toIndexed(makeWorkSummary({ startTime: "2026-06-10T10:00:00Z" }))];
    const project = makeProjectRange();
    mockAggregateWorkByRange.mockReturnValue([project]);
    mockBuildMonthlyReportData.mockReturnValue({
      year: 2026, month: 6, label: "2026-06",
      startDate: "2026-06-01", endDate: "2026-06-30",
      projects: [project], totalSessions: 1, totalCost: 0.05,
    });

    const result = await buildWorkMonthlyMarkdown(indexed, 2026, 6);

    expect(result).not.toBeNull();
    expect(result!.markdown).toContain("# 工作月报: 2026-06");
    expect(result!.markdown).toContain("2026-06-01 — 2026-06-30");
  });

  it("calls LLM summarization when options provided", async () => {
    const session = makeWorkSummary({ sessionId: "s1", startTime: "2026-06-10T10:00:00Z" });
    const indexed = [toIndexed(session)];
    const project = makeProjectRange({ sessions: [session] });
    mockAggregateWorkByRange.mockReturnValue([project]);
    mockBuildMonthlyReportData.mockReturnValue({
      year: 2026, month: 6, label: "2026-06",
      startDate: "2026-06-01", endDate: "2026-06-30",
      projects: [project], totalSessions: 1, totalCost: 0.05,
    });

    const mockOptions = {
      summarizeOptions: {
        provider: "ollama",
        config: { model: "test-model", baseUrl: "http://localhost:11434" },
      },
    };

    const result = await buildWorkMonthlyMarkdown(indexed, 2026, 6, mockOptions);

    expect(result).not.toBeNull();
    expect(mockSummarizeSessions).toHaveBeenCalled();
    expect(mockSummarizeProjectMonthly).toHaveBeenCalledWith(
      "/proj/app",
      expect.any(Array),
      mockOptions.summarizeOptions,
    );
  });

  it("does not call LLM when no summarizeOptions", async () => {
    const indexed = [toIndexed(makeWorkSummary({ startTime: "2026-06-10T10:00:00Z" }))];
    const project = makeProjectRange();
    mockAggregateWorkByRange.mockReturnValue([project]);
    mockBuildMonthlyReportData.mockReturnValue({
      year: 2026, month: 6, label: "2026-06",
      startDate: "2026-06-01", endDate: "2026-06-30",
      projects: [project], totalSessions: 1, totalCost: 0.05,
    });

    await buildWorkMonthlyMarkdown(indexed, 2026, 6, {});

    expect(mockSummarizeSessions).not.toHaveBeenCalled();
    expect(mockSummarizeProjectMonthly).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// buildWorkQuarterlyMarkdown
// ---------------------------------------------------------------------------

describe("buildWorkQuarterlyMarkdown", () => {
  it("returns null when no sessions in range", async () => {
    const indexed = [toIndexed(makeWorkSummary({ startTime: "2026-02-15T10:00:00Z" }))];
    mockAggregateWorkByRange.mockReturnValue(null);

    const result = await buildWorkQuarterlyMarkdown(indexed, 2026, 2);

    expect(result).toBeNull();
    expect(mockAggregateWorkByRange).toHaveBeenCalledWith(
      indexed,
      { start: "2026-04-01", end: "2026-06-30" },
      "monthly",
    );
  });

  it("generates quarterly report with correct header", async () => {
    const indexed = [toIndexed(makeWorkSummary({ startTime: "2026-05-10T10:00:00Z" }))];
    const project = makeProjectRange();
    mockAggregateWorkByRange.mockReturnValue([project]);
    mockBuildQuarterlyReportData.mockReturnValue({
      year: 2026, quarter: 2, label: "2026-Q2",
      startDate: "2026-04-01", endDate: "2026-06-30",
      projects: [project], totalSessions: 1, totalCost: 0.05,
    });

    const result = await buildWorkQuarterlyMarkdown(indexed, 2026, 2);

    expect(result).not.toBeNull();
    expect(result!.markdown).toContain("# 工作季报: 2026-Q2");
    expect(result!.markdown).toContain("2026-04-01 — 2026-06-30");
  });

  it("calls quarterly LLM summarization when options provided", async () => {
    const session = makeWorkSummary({ sessionId: "s1", startTime: "2026-05-10T10:00:00Z" });
    const indexed = [toIndexed(session)];
    const project = makeProjectRange({ sessions: [session] });
    mockAggregateWorkByRange.mockReturnValue([project]);
    mockBuildQuarterlyReportData.mockReturnValue({
      year: 2026, quarter: 2, label: "2026-Q2",
      startDate: "2026-04-01", endDate: "2026-06-30",
      projects: [project], totalSessions: 1, totalCost: 0.05,
    });

    const mockOptions = {
      summarizeOptions: {
        provider: "anthropic",
        config: { model: "claude-sonnet-4-6-20250514" },
      },
    };

    const result = await buildWorkQuarterlyMarkdown(indexed, 2026, 2, mockOptions);

    expect(result).not.toBeNull();
    expect(mockSummarizeSessions).toHaveBeenCalled();
    expect(mockSummarizeProjectQuarterly).toHaveBeenCalledWith(
      "/proj/app",
      expect.any(Array),
      mockOptions.summarizeOptions,
    );
  });

  it("does not call LLM when no summarizeOptions", async () => {
    const indexed = [toIndexed(makeWorkSummary({ startTime: "2026-05-10T10:00:00Z" }))];
    const project = makeProjectRange();
    mockAggregateWorkByRange.mockReturnValue([project]);
    mockBuildQuarterlyReportData.mockReturnValue({
      year: 2026, quarter: 2, label: "2026-Q2",
      startDate: "2026-04-01", endDate: "2026-06-30",
      projects: [project], totalSessions: 1, totalCost: 0.05,
    });

    await buildWorkQuarterlyMarkdown(indexed, 2026, 2, {});

    expect(mockSummarizeSessions).not.toHaveBeenCalled();
    expect(mockSummarizeProjectQuarterly).not.toHaveBeenCalled();
  });
});
