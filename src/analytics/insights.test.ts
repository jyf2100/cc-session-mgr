import { describe, it, expect } from "vitest";
import type { SessionWorkSummary, WorkContent } from "../types/index.js";
import { generateInsights } from "./insights.js";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeWorkContent(overrides?: Partial<WorkContent>): WorkContent {
  return {
    primaryIntent: "Test intent",
    toolCallSummary: {},
    bashCommands: [],
    moduleSummary: [],
    assistantSnippets: [],
    compactedSummary: null,
    userIntents: [],
    llmSummary: null,
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<SessionWorkSummary> = {},
): SessionWorkSummary {
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
    workContent: makeWorkContent(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateInsights", () => {
  it("returns empty array for empty input", () => {
    expect(generateInsights([])).toEqual([]);
  });

  it("fires boolean rules but not statistical rules with <3 sessions", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        isCompacted: true,
        models: ["claude-opus", "claude-sonnet"],
        cost: { totalUSD: 999, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false },
      }),
    ];

    const insights = generateInsights(sessions);

    // Should fire context pressure and model switch (boolean rules)
    expect(insights.some((i) => i.title === "上下文窗口压力")).toBe(true);
    expect(insights.some((i) => i.title === "会话中途切换模型")).toBe(true);

    // Should NOT fire high-cost idle (statistical rule)
    expect(insights.some((i) => i.title === "高消耗低活跃会话")).toBe(false);
  });

  it("detects high-cost idle session above 2× median with low activity", () => {
    const sessions = [
      makeSession({ sessionId: "s1", cost: { totalUSD: 0.01, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false } }),
      makeSession({ sessionId: "s2", cost: { totalUSD: 0.02, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false } }),
      makeSession({ sessionId: "s3", cost: { totalUSD: 0.03, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false } }),
      // This one is >2× median (0.02) and has <3 user messages + no file edits
      makeSession({
        sessionId: "s4",
        cost: { totalUSD: 0.10, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false },
        messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
        fileEdits: [],
      }),
    ];

    const insights = generateInsights(sessions);
    const idle = insights.find((i) => i.title === "高消耗低活跃会话");
    expect(idle).toBeDefined();
    expect(idle!.severity).toBe("warning");
    expect(idle!.category).toBe("效率");
    expect(idle!.sessionIds).toContain("s4");
  });

  it("does not flag high-cost session with normal activity", () => {
    const sessions = [
      makeSession({ sessionId: "s1", cost: { totalUSD: 0.01, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false } }),
      makeSession({ sessionId: "s2", cost: { totalUSD: 0.02, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false } }),
      makeSession({
        sessionId: "s3",
        cost: { totalUSD: 0.10, source: "inline", incomplete: false, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isEstimated: false },
        messageCounts: { user: 5, assistant: 5, system: 0, other: 0 },
        fileEdits: [{ filePath: "src/app.ts", editCount: 3 }],
      }),
    ];

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "高消耗低活跃会话")).toBe(false);
  });

  // --- Rule 1: token-based path for zero-cost models ---

  it("detects high-token idle session when cost is zero", () => {
    const zeroCost = { totalUSD: 0, source: "inline" as const, incomplete: false, inputTokens: 50, outputTokens: 50, cacheReadTokens: 0, isEstimated: false };
    const sessions = [
      makeSession({ sessionId: "s1", cost: { ...zeroCost, inputTokens: 50, outputTokens: 50 } }),
      makeSession({ sessionId: "s2", cost: { ...zeroCost, inputTokens: 60, outputTokens: 60 } }),
      makeSession({ sessionId: "s3", cost: { ...zeroCost, inputTokens: 70, outputTokens: 70 } }),
      // 500 tokens >> median (120) * 2 = 240, low activity
      makeSession({
        sessionId: "s4",
        cost: { ...zeroCost, inputTokens: 300, outputTokens: 200 },
        messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
        fileEdits: [],
      }),
    ];

    const insights = generateInsights(sessions);
    const idle = insights.find((i) => i.title === "高消耗低活跃会话");
    expect(idle).toBeDefined();
    expect(idle!.sessionIds).toContain("s4");
    expect(idle!.metric).toContain("tokens");
  });

  // --- Rule 2: low-efficiency session (high tokens, few messages) ---

  it("detects inefficient session with high tokens and few messages", () => {
    const zeroCost = { totalUSD: 0, source: "inline" as const, incomplete: false, inputTokens: 50, outputTokens: 50, cacheReadTokens: 0, isEstimated: false };
    const sessions = [
      makeSession({ sessionId: "s1", cost: { ...zeroCost, inputTokens: 50, outputTokens: 50 } }),
      makeSession({ sessionId: "s2", cost: { ...zeroCost, inputTokens: 60, outputTokens: 60 } }),
      makeSession({ sessionId: "s3", cost: { ...zeroCost, inputTokens: 70, outputTokens: 70 } }),
      // Only 3 messages total (<5), but 500 tokens >> median (120) * 2
      makeSession({
        sessionId: "s4",
        cost: { ...zeroCost, inputTokens: 300, outputTokens: 200 },
        messageCounts: { user: 1, assistant: 2, system: 0, other: 0 },
        fileEdits: [{ filePath: "a.ts", editCount: 1 }], // has edits → not low activity for Rule 1
      }),
    ];

    const insights = generateInsights(sessions);
    const ineff = insights.find((i) => i.title === "低效会话：高消耗少交互");
    expect(ineff).toBeDefined();
    expect(ineff!.severity).toBe("info");
    expect(ineff!.category).toBe("成本");
    expect(ineff!.sessionIds).toContain("s4");
  });

  it("does not flag efficient session with many messages", () => {
    const zeroCost = { totalUSD: 0, source: "inline" as const, incomplete: false, cacheReadTokens: 0, isEstimated: false };
    const sessions = [
      makeSession({ sessionId: "s1", cost: { ...zeroCost, inputTokens: 50, outputTokens: 50 } }),
      makeSession({ sessionId: "s2", cost: { ...zeroCost, inputTokens: 60, outputTokens: 60 } }),
      makeSession({
        sessionId: "s3",
        cost: { ...zeroCost, inputTokens: 300, outputTokens: 200 },
        messageCounts: { user: 8, assistant: 8, system: 0, other: 0 }, // 16 messages → not <5
      }),
    ];

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "低效会话：高消耗少交互")).toBe(false);
  });

  // --- Rule 3: high rework file ---

  it("detects high rework file (>5 edits)", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        fileEdits: [{ filePath: "src/auth.ts", editCount: 8 }],
      }),
    ];

    const insights = generateInsights(sessions);
    const rework = insights.find((i) => i.title === "单文件反复修改");
    expect(rework).toBeDefined();
    expect(rework!.severity).toBe("actionable");
    expect(rework!.category).toBe("效率");
    expect(rework!.metric).toContain("8 次编辑：src/auth.ts");
  });

  it("does not flag file with ≤5 edits", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        fileEdits: [
          { filePath: "src/a.ts", editCount: 3 },
          { filePath: "src/b.ts", editCount: 5 },
        ],
      }),
    ];

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "单文件反复修改")).toBe(false);
  });

  // --- Rule 4: compacted ---

  it("detects compacted session", () => {
    const sessions = [
      makeSession({ sessionId: "s1", isCompacted: true }),
    ];

    const insights = generateInsights(sessions);
    const pressure = insights.find((i) => i.title === "上下文窗口压力");
    expect(pressure).toBeDefined();
    expect(pressure!.severity).toBe("info");
    expect(pressure!.category).toBe("健康");
    expect(pressure!.metric).toBe("上下文已压缩");
  });

  it("does not flag non-compacted session", () => {
    const sessions = [
      makeSession({ sessionId: "s1", isCompacted: false }),
    ];

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "上下文窗口压力")).toBe(false);
  });

  // --- Rule 5: model switch ---

  it("detects model switch mid-session", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        models: ["claude-opus-4-8", "claude-sonnet-4-6"],
      }),
    ];

    const insights = generateInsights(sessions);
    const sw = insights.find((i) => i.title === "会话中途切换模型");
    expect(sw).toBeDefined();
    expect(sw!.severity).toBe("info");
    expect(sw!.category).toBe("稳定性");
    expect(sw!.metric).toBe("切换路径: claude-opus-4-8 → claude-sonnet-4-6");
  });

  it("does not flag single-model session", () => {
    const sessions = [
      makeSession({ sessionId: "s1", models: ["claude-sonnet-4-6"] }),
    ];

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "会话中途切换模型")).toBe(false);
  });

  // --- Rule 6: duration anomaly ---

  it("detects ultra-long session (>4 hours)", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        startTime: "2026-06-09T08:00:00Z",
        endTime: "2026-06-09T13:30:00Z", // 5.5 hours
      }),
    ];

    const insights = generateInsights(sessions);
    const long = insights.find((i) => i.title === "超长会话");
    expect(long).toBeDefined();
    expect(long!.severity).toBe("warning");
    expect(long!.category).toBe("时间");
    expect(long!.sessionIds).toContain("s1");
  });

  it("detects ultra-short session (<2 minutes)", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        startTime: "2026-06-09T10:00:00Z",
        endTime: "2026-06-09T10:00:30Z", // 30 seconds
      }),
    ];

    const insights = generateInsights(sessions);
    const short = insights.find((i) => i.title === "超短会话");
    expect(short).toBeDefined();
    expect(short!.severity).toBe("info");
    expect(short!.category).toBe("时间");
    expect(short!.sessionIds).toContain("s1");
  });

  it("does not flag session with normal duration", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        startTime: "2026-06-09T10:00:00Z",
        endTime: "2026-06-09T10:45:00Z", // 45 minutes — normal
      }),
    ];

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "超长会话")).toBe(false);
    expect(insights.some((i) => i.title === "超短会话")).toBe(false);
  });

  // --- Rule 7: tool efficiency ---

  it("detects high exploration low output (many Bash, no edits)", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        fileEdits: [],
        workContent: makeWorkContent({
          toolCallSummary: { Bash: 15 },
        }),
      }),
    ];

    const insights = generateInsights(sessions);
    const explore = insights.find((i) => i.title === "高探索低产出");
    expect(explore).toBeDefined();
    expect(explore!.severity).toBe("info");
    expect(explore!.category).toBe("工具");
    expect(explore!.metric).toContain("15 次 Bash");
  });

  it("does not flag session with Bash and file edits", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        fileEdits: [{ filePath: "src/app.ts", editCount: 2 }],
        workContent: makeWorkContent({
          toolCallSummary: { Bash: 15 },
        }),
      }),
    ];

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "高探索低产出")).toBe(false);
  });

  it("does not flag session with few Bash calls", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        fileEdits: [],
        workContent: makeWorkContent({
          toolCallSummary: { Bash: 5 },
        }),
      }),
    ];

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "高探索低产出")).toBe(false);
  });

  // --- Rule 8: session fragmentation ---

  it("detects session fragmentation when >5 short sessions in same project/day", () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      makeSession({
        sessionId: `s${i}`,
        projectPath: "/project/frag",
        startTime: `2026-06-09T1${i}:00:00Z`,
        endTime: `2026-06-09T1${i}:01:00Z`, // 1 minute each — short
      }),
    );

    const insights = generateInsights(sessions);
    const frag = insights.find((i) => i.title === "会话碎片化");
    expect(frag).toBeDefined();
    expect(frag!.severity).toBe("info");
    expect(frag!.category).toBe("效率");
    expect(frag!.sessionIds.length).toBeGreaterThanOrEqual(6);
  });

  it("does not flag fragmentation with <6 sessions total", () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({
        sessionId: `s${i}`,
        projectPath: "/project/frag",
        startTime: `2026-06-09T1${i}:00:00Z`,
        endTime: `2026-06-09T1${i}:01:00Z`,
      }),
    );

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "会话碎片化")).toBe(false);
  });

  it("does not flag fragmentation when sessions are long enough", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      makeSession({
        sessionId: `s${i}`,
        projectPath: "/project/normal",
        startTime: `2026-06-09T${i}:00:00Z`,
        endTime: `2026-06-09T${i}:30:00Z`, // 30 minutes each — normal
      }),
    );

    const insights = generateInsights(sessions);
    expect(insights.some((i) => i.title === "会话碎片化")).toBe(false);
  });

  // --- Dedup ---

  it("deduplicates same rule across multiple sessions", () => {
    const sessions = [
      makeSession({ sessionId: "s1", isCompacted: true }),
      makeSession({ sessionId: "s2", isCompacted: true }),
      makeSession({ sessionId: "s3", isCompacted: true }),
    ];

    const insights = generateInsights(sessions);
    const pressure = insights.find((i) => i.title === "上下文窗口压力");
    expect(pressure).toBeDefined();
    expect(pressure!.sessionIds).toHaveLength(3);
    expect(pressure!.sessionIds).toEqual(
      expect.arrayContaining(["s1", "s2", "s3"]),
    );
  });

  // --- projectPaths and dateRange context ---

  it("single-session insight has correct projectPaths and dateRange", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        projectPath: "/work/my-app",
        startTime: "2026-06-10T09:00:00Z",
        isCompacted: true,
      }),
    ];

    const insights = generateInsights(sessions);
    const pressure = insights.find((i) => i.title === "上下文窗口压力");
    expect(pressure).toBeDefined();
    expect(pressure!.projectPaths).toEqual(["/work/my-app"]);
    expect(pressure!.dateRange).toEqual({ from: "2026-06-10", to: "2026-06-10" });
  });

  it("dedup merges projectPaths via union and widens dateRange", () => {
    const sessions = [
      makeSession({ sessionId: "s1", projectPath: "/work/app-a", startTime: "2026-06-08T10:00:00Z", isCompacted: true }),
      makeSession({ sessionId: "s2", projectPath: "/work/app-b", startTime: "2026-06-09T10:00:00Z", isCompacted: true }),
      makeSession({ sessionId: "s3", projectPath: "/work/app-a", startTime: "2026-06-10T10:00:00Z", isCompacted: true }),
    ];

    const insights = generateInsights(sessions);
    const pressure = insights.find((i) => i.title === "上下文窗口压力");
    expect(pressure).toBeDefined();
    // projectPaths deduplicated
    expect(pressure!.projectPaths).toHaveLength(2);
    expect(pressure!.projectPaths).toEqual(expect.arrayContaining(["/work/app-a", "/work/app-b"]));
    // dateRange spans min to max
    expect(pressure!.dateRange).toEqual({ from: "2026-06-08", to: "2026-06-10" });
  });

  it("dateRange is null when startTime is missing", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        startTime: null,
        endTime: null,
        isCompacted: true,
      }),
    ];

    const insights = generateInsights(sessions);
    const pressure = insights.find((i) => i.title === "上下文窗口压力");
    expect(pressure).toBeDefined();
    expect(pressure!.dateRange).toBeNull();
  });

  it("every insight has projectPaths and dateRange fields", () => {
    const sessions = [
      makeSession({
        sessionId: "s1",
        isCompacted: true,
        models: ["claude-opus", "claude-sonnet"],
        fileEdits: [{ filePath: "src/a.ts", editCount: 8 }],
        startTime: "2026-06-09T08:00:00Z",
        endTime: "2026-06-09T13:30:00Z",
      }),
    ];

    const insights = generateInsights(sessions);
    for (const insight of insights) {
      expect(insight.projectPaths).toBeDefined();
      expect(Array.isArray(insight.projectPaths)).toBe(true);
      expect(insight.dateRange).toBeDefined();
    }
  });
});
