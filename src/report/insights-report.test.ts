import { describe, it, expect } from "vitest";
import type {
  Insight,
  CostAnomalyResult,
  ModelComparison,
  CostAuditReport,
} from "../types/index.js";
import { generateInsightsReport, type InsightsReportInput } from "./insights-report.js";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    severity: "info",
    title: "Test insight",
    description: "Something noticed",
    metric: "cost",
    category: "cost_efficiency",
    sessionIds: ["s-001"],
    projectPaths: ["/work/test-project"],
    dateRange: { from: "2026-06-10", to: "2026-06-10" },
    ...overrides,
  };
}

function makeAnomalyResult(
  overrides: Partial<CostAnomalyResult> = {}
): CostAnomalyResult {
  return {
    anomalies: [],
    insufficientData: false,
    meanCost: 1.0,
    stddevCost: 0.5,
    dataPointCount: 10,
    ...overrides,
  };
}

function makeModelComparison(overrides: Partial<ModelComparison> = {}): ModelComparison {
  return {
    model: "claude-sonnet-4-6",
    sessionCount: 5,
    totalCost: 0.5,
    avgCostPerSession: 0.1,
    avgCostPerEdit: 0.02,
    totalInputTokens: 1000,
    totalOutputTokens: 2000,
    outputInputRatio: 2.0,
    avgMessagesPerSession: 10,
    multiModelSessionCount: 0,
    ...overrides,
  };
}

function makeAuditReport(overrides: Partial<CostAuditReport> = {}): CostAuditReport {
  return {
    totalSessions: 10,
    sourceDistribution: { inline: 5, metrics: 3, merged: 2 },
    incompleteCount: 1,
    incompleteRate: 0.1,
    isEstimatedCount: 0,
    isEstimatedRate: 0,
    trustLevel: "high",
    ...overrides,
  };
}

function makeInput(overrides: Partial<InsightsReportInput> = {}): InsightsReportInput {
  return {
    insights: [makeInsight()],
    anomalyResult: makeAnomalyResult(),
    modelComparisons: [makeModelComparison()],
    auditReport: makeAuditReport(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateInsightsReport", () => {
  it("returns empty string when all sections are empty", () => {
    const result = generateInsightsReport({
      insights: [],
      anomalyResult: makeAnomalyResult({ anomalies: [], insufficientData: false }),
      modelComparisons: [],
      auditReport: makeAuditReport({ totalSessions: 0 }),
    });
    expect(result).toBe("");
  });

  it("renders insights with severity emoji", () => {
    const result = generateInsightsReport(
      makeInput({
        insights: [
          makeInsight({ severity: "warning", title: "High cost", description: "Cost is high" }),
        ],
      })
    );
    expect(result).toContain("⚠️");
    expect(result).toContain("**High cost**");
    expect(result).toContain("Cost is high");
  });

  it("renders cost anomaly table", () => {
    const result = generateInsightsReport(
      makeInput({
        anomalyResult: makeAnomalyResult({
          anomalies: [
            {
              date: "2026-06-05",
              cost: 5.0,
              expectedCost: 1.0,
              zScore: 3.5,
              attribution: { type: "model_switch", detail: "Switched to opus", sessionIds: ["s-1"] },
            },
          ],
        }),
      })
    );
    expect(result).toContain("2026-06-05");
    expect(result).toContain("$5.00");
    expect(result).toContain("model_switch");
  });

  it("skips anomaly section when insufficientData is true", () => {
    const result = generateInsightsReport(
      makeInput({
        anomalyResult: makeAnomalyResult({ insufficientData: true }),
      })
    );
    expect(result).not.toContain("成本异常");
  });

  it("renders model comparison table", () => {
    const result = generateInsightsReport(
      makeInput({
        modelComparisons: [
          makeModelComparison({ model: "opus", totalCost: 1.5, avgCostPerSession: 0.3 }),
        ],
      })
    );
    expect(result).toContain("opus");
    expect(result).toContain("$1.50");
    expect(result).toContain("模型对比");
  });

  it("renders audit with trust level emoji", () => {
    const result = generateInsightsReport(
      makeInput({
        auditReport: makeAuditReport({ trustLevel: "high" }),
      })
    );
    expect(result).toContain("🟢");
    expect(result).toContain("HIGH");
    expect(result).toContain("10.0%"); // incompleteRate
  });

  it("renders low trust with red emoji", () => {
    const result = generateInsightsReport(
      makeInput({
        auditReport: makeAuditReport({ trustLevel: "low" }),
      })
    );
    expect(result).toContain("🔴");
    expect(result).toContain("LOW");
  });

  it("wraps all sections under ## 💡 洞察", () => {
    const result = generateInsightsReport(makeInput());
    expect(result).toMatch(/^## 💡 洞察/);
  });

  // --- Insight context line (projectPaths + dateRange) ---

  it("renders context line with single project and date", () => {
    const result = generateInsightsReport(
      makeInput({
        insights: [
          makeInsight({
            title: "Test",
            projectPaths: ["/work/cc-session-mgr"],
            dateRange: { from: "2026-06-10", to: "2026-06-10" },
            sessionIds: ["s1"],
          }),
        ],
      })
    );
    expect(result).toContain("📁 cc-session-mgr");
    expect(result).toContain("📅 2026-06-10");
    expect(result).toContain("1 个会话");
  });

  it("truncates project list when >3 and shows date range", () => {
    const result = generateInsightsReport(
      makeInput({
        insights: [
          makeInsight({
            title: "Multi",
            projectPaths: ["/work/a", "/work/b", "/work/c", "/work/d"],
            dateRange: { from: "2026-06-08", to: "2026-06-11" },
            sessionIds: ["s1", "s2", "s3", "s4", "s5"],
          }),
        ],
      })
    );
    expect(result).toContain("📁 a、b、c 等 4 个");
    expect(result).toContain("06-08 ~ 06-11");
    expect(result).toContain("5 个会话");
  });

  it("omits date when dateRange is null", () => {
    const result = generateInsightsReport(
      makeInput({
        insights: [
          makeInsight({
            title: "NoDate",
            projectPaths: ["/work/project-x"],
            dateRange: null,
            sessionIds: ["s1"],
          }),
        ],
      })
    );
    expect(result).toContain("📁 project-x");
    expect(result).not.toContain("📅");
    expect(result).toContain("1 个会话");
  });
});
