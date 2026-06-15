import { describe, it, expect } from "vitest";
import type { DateGroup, SessionSummary } from "../types/index.js";
import { detectCostAnomalies } from "./cost-anomaly.js";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
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

function makeDay(overrides: Partial<DateGroup> = {}): DateGroup {
  return {
    date: "2026-06-09",
    sessions: [],
    totalMessages: 6,
    totalCost: 0.05,
    totalInputTokens: 100,
    totalOutputTokens: 200,
    models: { "claude-sonnet-4-6": 1 },
    activeSpan: null,
    ...overrides,
  };
}

/** Generate N days with normal costs around baseCost. */
function makeNormalDays(
  count: number,
  baseCost = 0.05,
): DateGroup[] {
  return Array.from({ length: count }, (_, i) =>
    makeDay({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      totalCost: baseCost + (Math.random() * 0.02 - 0.01),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectCostAnomalies", () => {
  it("returns insufficientData for <7 days", () => {
    const days = makeNormalDays(5);
    const result = detectCostAnomalies(days);
    expect(result.insufficientData).toBe(true);
    expect(result.anomalies).toEqual([]);
    expect(result.dataPointCount).toBe(5);
  });

  it("returns no anomalies when all costs are within normal range", () => {
    const days = makeNormalDays(10, 0.05);
    const result = detectCostAnomalies(days);
    expect(result.insufficientData).toBe(false);
    expect(result.anomalies).toEqual([]);
    expect(result.dataPointCount).toBe(10);
    expect(result.meanCost).toBeGreaterThan(0);
  });

  it("detects a single anomalous day above mean + 2×stddev", () => {
    const days = makeNormalDays(9, 0.05);
    days.push(
      makeDay({
        date: "2026-06-20",
        totalCost: 5.0,
        sessions: [makeSummary({ cost: { totalUSD: 5.0, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false } })],
      }),
    );

    const result = detectCostAnomalies(days);
    expect(result.insufficientData).toBe(false);
    expect(result.anomalies.length).toBeGreaterThanOrEqual(1);

    const anomaly = result.anomalies.find((a) => a.date === "2026-06-20");
    expect(anomaly).toBeDefined();
    expect(anomaly!.cost).toBe(5.0);
    expect(anomaly!.zScore).toBeGreaterThan(2);
    expect(anomaly!.expectedCost).toBe(result.meanCost);
  });

  it("attributes anomaly to model_switch", () => {
    const days = makeNormalDays(9, 0.05);
    days.push(
      makeDay({
        date: "2026-06-20",
        totalCost: 5.0,
        sessions: [
          makeSummary({
            models: ["claude-opus-4-8", "claude-sonnet-4-6"],
            cost: { totalUSD: 5.0, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false },
          }),
        ],
      }),
    );

    const result = detectCostAnomalies(days);
    const anomaly = result.anomalies.find((a) => a.date === "2026-06-20");
    expect(anomaly).toBeDefined();
    expect(anomaly!.attribution.type).toBe("model_switch");
    expect(anomaly!.attribution.sessionIds.length).toBeGreaterThan(0);
  });

  it("attributes anomaly to token_spike", () => {
    const normalSession = makeSummary({
      cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
    });
    const days: DateGroup[] = Array.from({ length: 9 }, (_, i) =>
      makeDay({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        totalCost: 0.05,
        sessions: [normalSession],
      }),
    );

    // Anomaly day: 3 normal sessions + 1 spike session
    // median of [200, 200, 200, 50000] = (200+200)/2 = 200; spike > 200*3
    days.push(
      makeDay({
        date: "2026-06-20",
        totalCost: 5.0,
        sessions: [
          makeSummary({
            sessionId: "spike-session",
            cost: { totalUSD: 4.7, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 50000, cacheReadTokens: 0, isEstimated: false },
            models: ["claude-sonnet-4-6"],
          }),
          makeSummary({
            sessionId: "normal-a",
            cost: { totalUSD: 0.1, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
            models: ["claude-sonnet-4-6"],
          }),
          makeSummary({
            sessionId: "normal-b",
            cost: { totalUSD: 0.1, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
            models: ["claude-sonnet-4-6"],
          }),
          makeSummary({
            sessionId: "normal-c",
            cost: { totalUSD: 0.1, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
            models: ["claude-sonnet-4-6"],
          }),
        ],
      }),
    );

    const result = detectCostAnomalies(days);
    const anomaly = result.anomalies.find((a) => a.date === "2026-06-20");
    expect(anomaly).toBeDefined();
    expect(anomaly!.attribution.type).toBe("token_spike");
  });

  it("attributes anomaly to long_session", () => {
    const normalSession = makeSummary({
      startTime: "2026-06-20T10:00:00Z",
      endTime: "2026-06-20T10:30:00Z", // 30 min
      cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      models: ["claude-sonnet-4-6"],
    });

    const days: DateGroup[] = Array.from({ length: 9 }, (_, i) =>
      makeDay({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        totalCost: 0.05,
        sessions: [normalSession],
      }),
    );

    // Anomaly day: 3 normal sessions + 1 long session (no model switch, no token spike)
    days.push(
      makeDay({
        date: "2026-06-20",
        totalCost: 5.0,
        sessions: [
          makeSummary({
            sessionId: "long-session",
            startTime: "2026-06-20T08:00:00Z",
            endTime: "2026-06-20T23:00:00Z", // 900 min — way above 30*3=90
            cost: { totalUSD: 4.7, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
            models: ["claude-sonnet-4-6"],
          }),
          makeSummary({
            sessionId: "normal-d",
            startTime: "2026-06-20T10:00:00Z",
            endTime: "2026-06-20T10:30:00Z",
            cost: { totalUSD: 0.1, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
            models: ["claude-sonnet-4-6"],
          }),
          makeSummary({
            sessionId: "normal-e",
            startTime: "2026-06-20T11:00:00Z",
            endTime: "2026-06-20T11:30:00Z",
            cost: { totalUSD: 0.1, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
            models: ["claude-sonnet-4-6"],
          }),
        ],
      }),
    );

    const result = detectCostAnomalies(days);
    const anomaly = result.anomalies.find((a) => a.date === "2026-06-20");
    expect(anomaly).toBeDefined();
    expect(anomaly!.attribution.type).toBe("long_session");
  });

  it("attributes anomaly to unknown when no clear attribution", () => {
    const normalSession = makeSummary({
      cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      models: ["claude-sonnet-4-6"],
    });

    const days: DateGroup[] = Array.from({ length: 9 }, (_, i) =>
      makeDay({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        totalCost: 0.05,
        sessions: [normalSession],
      }),
    );

    // Anomaly day: single model, normal tokens, no timestamps → unknown
    days.push(
      makeDay({
        date: "2026-06-20",
        totalCost: 5.0,
        sessions: [
          makeSummary({
            sessionId: "mystery-session",
            startTime: null,
            endTime: null,
            cost: { totalUSD: 5.0, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
            models: ["claude-sonnet-4-6"],
          }),
        ],
      }),
    );

    const result = detectCostAnomalies(days);
    const anomaly = result.anomalies.find((a) => a.date === "2026-06-20");
    expect(anomaly).toBeDefined();
    expect(anomaly!.attribution.type).toBe("unknown");
    expect(anomaly!.attribution.sessionIds).toEqual([]);
  });

  it("excludes zero-cost days from statistics", () => {
    const days: DateGroup[] = [];

    for (let i = 1; i <= 5; i++) {
      days.push(
        makeDay({ date: `2026-06-${String(i).padStart(2, "0")}`, totalCost: 0.05 }),
      );
    }

    for (let i = 6; i <= 10; i++) {
      days.push(
        makeDay({ date: `2026-06-${String(i).padStart(2, "0")}`, totalCost: 0 }),
      );
    }

    for (let i = 11; i <= 14; i++) {
      days.push(
        makeDay({ date: `2026-06-${String(i).padStart(2, "0")}`, totalCost: 0.05 }),
      );
    }

    const result = detectCostAnomalies(days);
    expect(result.dataPointCount).toBe(9);
    expect(result.insufficientData).toBe(false);
  });

  it("returns empty anomalies when stddev is 0 (all identical costs)", () => {
    const days = Array.from({ length: 10 }, (_, i) =>
      makeDay({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        totalCost: 0.05,
      }),
    );

    const result = detectCostAnomalies(days);
    expect(result.anomalies).toEqual([]);
    expect(result.stddevCost).toBeLessThan(1e-10);
  });
});
