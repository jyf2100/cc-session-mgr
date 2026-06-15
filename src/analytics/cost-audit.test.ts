import { describe, it, expect } from "vitest";
import type { SessionSummary } from "../types/index.js";
import { auditCostData } from "./cost-audit.js";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: `s-${Math.random().toString(36).slice(2, 8)}`,
    projectPath: "/project/test",
    encodedDir: "-project-test",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T11:00:00Z",
    messageCounts: { user: 3, assistant: 3, system: 0, other: 0 },
    cost: {
      totalUSD: 0.05,
      source: "inline",
      incomplete: false,
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: ["claude-sonnet-4-6"],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    ...overrides,
  };
}

function makeSessionWithSource(source: SessionSummary["cost"]["source"]) {
  return makeSession({ cost: { totalUSD: 0.05, source, incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auditCostData", () => {
  it("returns zeros and low trust for empty input", () => {
    const report = auditCostData([]);
    expect(report.totalSessions).toBe(0);
    expect(report.sourceDistribution).toEqual({ inline: 0, metrics: 0, merged: 0 });
    expect(report.incompleteCount).toBe(0);
    expect(report.incompleteRate).toBe(0);
    expect(report.isEstimatedCount).toBe(0);
    expect(report.isEstimatedRate).toBe(0);
    expect(report.trustLevel).toBe("low");
  });

  it("computes source distribution correctly", () => {
    const sessions = [
      ...Array.from({ length: 40 }, () => makeSessionWithSource("inline")),
      ...Array.from({ length: 30 }, () => makeSessionWithSource("metrics")),
      ...Array.from({ length: 30 }, () => makeSessionWithSource("merged")),
    ];

    const report = auditCostData(sessions);
    expect(report.totalSessions).toBe(100);
    expect(report.sourceDistribution.inline).toBe(40);
    expect(report.sourceDistribution.metrics).toBe(30);
    expect(report.sourceDistribution.merged).toBe(30);
  });

  it("counts incomplete sessions and computes rate", () => {
    const sessions = [
      ...Array.from({ length: 80 }, () => makeSession()),
      ...Array.from({ length: 20 }, () =>
        makeSession({
          cost: { totalUSD: 0.05, source: "inline", incomplete: true, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
        }),
      ),
    ];

    const report = auditCostData(sessions);
    expect(report.incompleteCount).toBe(20);
    expect(report.incompleteRate).toBeCloseTo(0.2);
  });

  it("counts isEstimated sessions and computes rate", () => {
    const sessions = [
      ...Array.from({ length: 90 }, () => makeSession()),
      ...Array.from({ length: 10 }, () =>
        makeSession({
          cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: true },
        }),
      ),
    ];

    const report = auditCostData(sessions);
    expect(report.isEstimatedCount).toBe(10);
    expect(report.isEstimatedRate).toBeCloseTo(0.1);
  });

  it("returns high trust when conditions met", () => {
    const sessions = [
      // 60 merged, 40 inline → mergedRatio = 0.6 > 0.5
      // no incomplete → incompleteRate = 0 < 0.1
      // no estimated → isEstimatedRate = 0 < 0.2
      ...Array.from({ length: 60 }, () => makeSessionWithSource("merged")),
      ...Array.from({ length: 40 }, () => makeSessionWithSource("inline")),
    ];

    const report = auditCostData(sessions);
    expect(report.trustLevel).toBe("high");
  });

  it("returns medium trust when partial conditions met", () => {
    const sessions = [
      // 50 inline, 50 merged → mergedRatio = 0.5 (NOT > 0.5, so high fails)
      // no incomplete → incompleteRate = 0 < 0.3
      // no estimated → isEstimatedRate = 0 < 0.5
      // → medium
      ...Array.from({ length: 50 }, () => makeSessionWithSource("inline")),
      ...Array.from({ length: 50 }, () => makeSessionWithSource("merged")),
    ];

    const report = auditCostData(sessions);
    expect(report.trustLevel).toBe("medium");
  });

  it("returns low trust when incompleteRate ≥ 0.3", () => {
    const sessions = [
      ...Array.from({ length: 70 }, () => makeSession()),
      ...Array.from({ length: 30 }, () =>
        makeSession({
          cost: { totalUSD: 0.05, source: "merged", incomplete: true, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
        }),
      ),
    ];

    const report = auditCostData(sessions);
    expect(report.incompleteRate).toBeCloseTo(0.3);
    expect(report.trustLevel).toBe("low");
  });

  it("returns low trust when isEstimatedRate ≥ 0.5", () => {
    const sessions = [
      ...Array.from({ length: 50 }, () => makeSession()),
      ...Array.from({ length: 50 }, () =>
        makeSession({
          cost: { totalUSD: 0.05, source: "merged", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: true },
        }),
      ),
    ];

    const report = auditCostData(sessions);
    expect(report.isEstimatedRate).toBeCloseTo(0.5);
    expect(report.trustLevel).toBe("low");
  });
});
