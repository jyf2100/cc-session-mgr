import { describe, it, expect } from "vitest";
import type { SessionWorkSummary } from "../types/index.js";
import { compareModels } from "./model-compare.js";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionWorkSummary> = {}): SessionWorkSummary {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("compareModels", () => {
  it("returns empty array for empty input", () => {
    expect(compareModels([])).toEqual([]);
  });

  it("groups sessions by models[0] and computes metrics", () => {
    const sessions = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeSession({
          sessionId: `sonnet-${i}`,
          models: ["claude-sonnet-4-6"],
          cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
          messageCounts: { user: 4, assistant: 4, system: 0, other: 0 },
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makeSession({
          sessionId: `haiku-${i}`,
          models: ["claude-haiku-4-5"],
          cost: { totalUSD: 0.01, source: "inline", incomplete: false, inputTokens: 50, outputTokens: 100, cacheReadTokens: 0, isEstimated: false },
          messageCounts: { user: 2, assistant: 2, system: 0, other: 0 },
        }),
      ),
    ];

    const results = compareModels(sessions);
    expect(results).toHaveLength(2);

    // Sorted by totalCost desc: sonnet (3×0.05=0.15) > haiku (2×0.01=0.02)
    const sonnet = results.find((r) => r.model === "claude-sonnet-4-6")!;
    const haiku = results.find((r) => r.model === "claude-haiku-4-5")!;

    expect(results[0].model).toBe("claude-sonnet-4-6");

    expect(sonnet.sessionCount).toBe(3);
    expect(sonnet.totalCost).toBeCloseTo(0.15);
    expect(sonnet.avgCostPerSession).toBeCloseTo(0.05);
    expect(sonnet.totalInputTokens).toBe(300);
    expect(sonnet.totalOutputTokens).toBe(600);
    expect(sonnet.outputInputRatio).toBeCloseTo(2);
    expect(sonnet.avgMessagesPerSession).toBeCloseTo(8); // 4+4 per session
    expect(sonnet.multiModelSessionCount).toBe(0);

    expect(haiku.sessionCount).toBe(2);
    expect(haiku.totalCost).toBe(0.02);
  });

  it("attributes multi-model session to models[0]", () => {
    const sessions = [
      makeSession({
        sessionId: "multi-1",
        models: ["claude-opus-4-8", "claude-sonnet-4-6"],
        cost: { totalUSD: 1.0, source: "inline", incomplete: false, inputTokens: 500, outputTokens: 1000, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const results = compareModels(sessions);
    expect(results).toHaveLength(1);

    const opus = results[0];
    expect(opus.model).toBe("claude-opus-4-8");
    expect(opus.sessionCount).toBe(1);
    expect(opus.totalCost).toBe(1.0);
    expect(opus.multiModelSessionCount).toBe(1);
  });

  it("returns avgCostPerEdit=0 when no file edits", () => {
    const sessions = [
      makeSession({
        models: ["claude-sonnet-4-6"],
        fileEdits: [],
        cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const results = compareModels(sessions);
    expect(results[0].avgCostPerEdit).toBe(0);
  });

  it("computes avgCostPerEdit when file edits exist", () => {
    const sessions = [
      makeSession({
        models: ["claude-sonnet-4-6"],
        fileEdits: [{ filePath: "a.ts", editCount: 5 }],
        cost: { totalUSD: 0.10, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const results = compareModels(sessions);
    expect(results[0].avgCostPerEdit).toBeCloseTo(0.02); // 0.10 / 5
  });

  it("returns outputInputRatio=0 when inputTokens is 0", () => {
    const sessions = [
      makeSession({
        models: ["claude-sonnet-4-6"],
        cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const results = compareModels(sessions);
    expect(results[0].outputInputRatio).toBe(0);
  });

  it("computes avgDurationMinutes from startTime/endTime", () => {
    const sessions = [
      makeSession({
        sessionId: "dur-1",
        models: ["claude-sonnet-4-6"],
        startTime: "2026-06-09T10:00:00Z",
        endTime: "2026-06-09T10:30:00Z", // 30 min
        cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
      makeSession({
        sessionId: "dur-2",
        models: ["claude-sonnet-4-6"],
        startTime: "2026-06-09T11:00:00Z",
        endTime: "2026-06-09T11:50:00Z", // 50 min
        cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const results = compareModels(sessions);
    expect(results[0].avgDurationMinutes).toBeCloseTo(40); // (30+50)/2
  });

  it("skips sessions with null startTime or endTime for avgDurationMinutes", () => {
    const sessions = [
      makeSession({
        sessionId: "dur-ok",
        models: ["claude-sonnet-4-6"],
        startTime: "2026-06-09T10:00:00Z",
        endTime: "2026-06-09T11:00:00Z", // 60 min
        cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
      makeSession({
        sessionId: "dur-null-start",
        models: ["claude-sonnet-4-6"],
        startTime: null,
        endTime: "2026-06-09T12:00:00Z",
        cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
      makeSession({
        sessionId: "dur-null-end",
        models: ["claude-sonnet-4-6"],
        startTime: "2026-06-09T13:00:00Z",
        endTime: null,
        cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const results = compareModels(sessions);
    expect(results[0].avgDurationMinutes).toBeCloseTo(60); // only the first session counted
  });

  it("returns avgDurationMinutes=0 when all sessions have null times", () => {
    const sessions = [
      makeSession({
        models: ["claude-sonnet-4-6"],
        startTime: null,
        endTime: null,
        cost: { totalUSD: 0.05, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const results = compareModels(sessions);
    expect(results[0].avgDurationMinutes).toBe(0);
  });

  it("sorts results by totalCost descending", () => {
    const sessions = [
      makeSession({
        sessionId: "cheap",
        models: ["claude-haiku-4-5"],
        cost: { totalUSD: 0.01, source: "inline", incomplete: false, inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, isEstimated: false },
      }),
      makeSession({
        sessionId: "expensive",
        models: ["claude-opus-4-8"],
        cost: { totalUSD: 1.0, source: "inline", incomplete: false, inputTokens: 500, outputTokens: 1000, cacheReadTokens: 0, isEstimated: false },
      }),
      makeSession({
        sessionId: "mid",
        models: ["claude-sonnet-4-6"],
        cost: { totalUSD: 0.1, source: "inline", incomplete: false, inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const results = compareModels(sessions);
    expect(results.map((r) => r.model)).toEqual([
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ]);
  });
});
