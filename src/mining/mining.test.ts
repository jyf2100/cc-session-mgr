/**
 * @file mining 模块测试(组 7)。
 *
 * 覆盖:digest/worktree 归一、triage、三类信号、聚合、缓存、产物、只读约束、
 * lesson 提取的认知谦逊(via vi.mock llm)。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// mock llm 模块(callLlm 可控;parseJsonResponse 保留真实实现)
vi.mock("./llm.js", () => ({
  callLlm: vi.fn(),
  parseJsonResponse: <T,>(raw: string | null): T | null => {
    if (!raw) return null;
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try {
      return JSON.parse(raw.slice(s, e + 1)) as T;
    } catch {
      return null;
    }
  },
}));

import { buildDigest, normalizeProjectName } from "./digest.js";
import { triageDigest, triageAll, AUTONOMOUS_TURN_THRESHOLD } from "./triage.js";
import {
  detectToolChains,
  detectErrorWorkaround,
} from "./signals.js";
import { aggregateAll } from "./aggregate.js";
import { extractLesson } from "./lesson.js";
import { writeOutput, renderLesson } from "./output.js";
import { readDigestCache, writeDigestCache, lookupDigest } from "./cache.js";
import { callLlm } from "./llm.js";
import type { Lesson, MineConfig } from "./types.js";
import type { SessionWorkSummary, JsonlEntry } from "../types/index.js";
import type { SummarizeOptions } from "../summarize/index.js";

const fakeLlm: SummarizeOptions = {
  provider: "anthropic",
  config: { model: "haiku", baseUrl: "https://api.anthropic.com" },
};

function makeSummary(over: Partial<SessionWorkSummary> = {}): SessionWorkSummary {
  return {
    sessionId: "s1",
    projectPath: "/proj/myapp",
    encodedDir: "-proj-myapp",
    startTime: "2026-06-30T10:00:00Z",
    endTime: "2026-06-30T11:00:00Z",
    messageCounts: { user: 5, assistant: 10, system: 0, other: 0 },
    cost: {
      totalUSD: 0.5,
      source: "inline",
      incomplete: false,
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: ["claude"],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    workContent: {
      primaryIntent: "fix bug",
      userIntents: ["fix bug"],
      toolCallSummary: { Read: 2, Edit: 3 },
      bashCommands: [],
      moduleSummary: [],
      assistantSnippets: [],
      compactedSummary: null,
      llmSummary: null,
    },
    ...over,
  };
}

const baseConfig: MineConfig = {
  claudeDir: "/tmp/.claude",
  outputDir: "/tmp/mined",
  allProjects: false,
  minTurns: 3,
  dryRun: false,
  interactive: false,
  llm: fakeLlm,
};

describe("digest + worktree 归一", () => {
  it("normalizeProjectName 归一 worktree(决策 12)", () => {
    expect(normalizeProjectName("/proj/myapp/.claude/worktrees/redesign")).toBe("myapp");
    expect(normalizeProjectName("/proj/myapp")).toBe("myapp");
  });

  it("buildDigest 从 messageCounts 取 human/autonomous turns", () => {
    const d = buildDigest(makeSummary());
    expect(d.humanTurns).toBe(5);
    expect(d.autonomousTurns).toBe(10);
    expect(d.projectName).toBe("myapp");
    expect(d.toolSequence).toEqual(["Read", "Edit"]);
  });
});

describe("triage(决策 2)", () => {
  it("≥ minTurns 人类轮次 → deep-dive", () => {
    const d = buildDigest(
      makeSummary({ messageCounts: { user: 4, assistant: 5, system: 0, other: 0 } }),
    );
    expect(triageDigest(d, 3).tier).toBe("deep-dive");
  });

  it("低轮次且自主 < 阈值 → aggregate-only", () => {
    const d = buildDigest(
      makeSummary({ messageCounts: { user: 1, assistant: 5, system: 0, other: 0 } }),
    );
    expect(triageDigest(d, 3).tier).toBe("aggregate-only");
  });

  it("自主轮次 ≥ 阈值 → deep-dive", () => {
    const d = buildDigest(
      makeSummary({
        messageCounts: { user: 1, assistant: AUTONOMOUS_TURN_THRESHOLD, system: 0, other: 0 },
      }),
    );
    expect(triageDigest(d, 3).tier).toBe("deep-dive");
  });

  it("triageAll 分流", () => {
    const digs = [
      buildDigest(makeSummary({ sessionId: "a" })),
      buildDigest(
        makeSummary({ sessionId: "b", messageCounts: { user: 1, assistant: 1, system: 0, other: 0 } }),
      ),
    ];
    const res = triageAll(digs, baseConfig);
    expect(res.deepDive.length + res.aggregateOnly.length).toBe(2);
  });
});

describe("信号提取(决策 3)", () => {
  it("tool-chain:跨会话同序列聚组(≥2)", () => {
    const d1 = buildDigest(makeSummary({ sessionId: "a" }));
    const d2 = buildDigest(makeSummary({ sessionId: "b" }));
    const sigs = detectToolChains([d1, d2]);
    expect(sigs.length).toBeGreaterThan(0);
    expect(sigs[0].sourceSessions).toContain("a");
    expect(sigs[0].sourceSessions).toContain("b");
  });

  it("error-workaround:tool 错误后跟人类纠正", () => {
    const d = buildDigest(makeSummary());
    const entries: JsonlEntry[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }],
        },
      },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_result", tool_use_id: "t1", is_error: true, content: "error" },
          ],
        },
      },
      { type: "user", message: { role: "user", content: "use --flag instead" } },
    ];
    const sigs = detectErrorWorkaround(d, entries);
    expect(sigs.length).toBe(1);
    expect(sigs[0].type).toBe("error-workaround");
    expect(sigs[0].content).toContain("--flag");
  });
});

describe("聚合(决策 6:保守 exact-key)", () => {
  it("同键合并为单条目", () => {
    const d = buildDigest(makeSummary());
    const s1 = detectErrorWorkaround(d, [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_result", tool_use_id: "t", is_error: true, content: "e" },
          ],
        },
      },
      { type: "user", message: { role: "user", content: "fix it please" } },
    ]);
    const knowledge = aggregateAll(s1, []);
    expect(knowledge.length).toBe(1);
    expect(knowledge[0].occurrences).toBe(1);
  });
});

describe("缓存(组 2.4)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mine-cache-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("写入后可查", () => {
    const path = join(dir, "cache.json");
    const d = buildDigest(makeSummary());
    writeDigestCache(path, [d]);
    const cache = readDigestCache(path);
    expect(lookupDigest(cache, "s1")).toBeDefined();
    expect(lookupDigest(cache, "nope")).toBeUndefined();
  });

  it("损坏文件容错返回空", () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{not json");
    expect(readDigestCache(path)).toEqual({});
  });
});

describe("lesson 认知谦逊(决策 4)", () => {
  const d = buildDigest(makeSummary());
  const entries: JsonlEntry[] = [
    { type: "user", message: { role: "user", content: "how to fix X" } },
  ];

  afterEach(() => vi.mocked(callLlm).mockReset());

  it("高 confidence lesson 正常产出", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      '{"problem":"X","rootCause":"Y","solution":"Z","takeaway":"W","confidence":4,"type":"technical","trigger":"when X"}',
    );
    const l = await extractLesson(d, entries, fakeLlm, "2026-06-30");
    expect(l).not.toBeNull();
    expect(l!.confidence).toBe(4);
    expect(l!.uncertain).toBe(false);
  });

  it("uncertain 且无 problem → null(不编造)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      '{"uncertain": true, "confidence": 1, "certaintyReasoning": "无清晰经验"}',
    );
    const l = await extractLesson(d, entries, fakeLlm, "2026-06-30");
    expect(l).toBeNull();
  });

  it("confidence ≤ 2 → 产出但标 uncertain", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      '{"problem":"maybe X","confidence":2,"type":"methodology"}',
    );
    const l = await extractLesson(d, entries, fakeLlm, "2026-06-30");
    expect(l).not.toBeNull();
    expect(l!.uncertain).toBe(true);
  });

  it("callLlm 失败 → null", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(null);
    const l = await extractLesson(d, entries, fakeLlm, "2026-06-30");
    expect(l).toBeNull();
  });
});

describe("只读约束 + 产物(决策 9/11)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mine-out-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writeOutput 只写 --output/lessons,不碰 ~/.claude", () => {
    const lesson: Lesson = {
      id: "L1",
      problem: "p",
      rootCause: "r",
      solution: "s",
      takeaway: "t",
      confidence: 4,
      certaintyReasoning: "",
      type: "technical",
      trigger: "when",
      sourceSessions: ["s1"],
      projects: ["myapp"],
      date: "2026-06-30",
      uncertain: false,
    };
    // writeOutput 只接收 outputDir —— 结构上无法写 ~/.claude(决策 9)
    writeOutput(
      [
        {
          key: "k",
          projectName: "myapp",
          kind: "lesson",
          lessons: [lesson],
          signals: [],
          occurrences: 1,
          sourceSessions: ["s1"],
          projects: ["myapp"],
        },
      ],
      dir,
    );
    expect(existsSync(join(dir, "lessons", "myapp"))).toBe(true);
    expect(existsSync(join(dir, "lessons", "INDEX.md"))).toBe(true);
  });

  it("renderLesson frontmatter 含 projects(决策 11)", () => {
    const md = renderLesson({
      id: "L1",
      problem: "p",
      rootCause: "",
      solution: "",
      takeaway: "",
      confidence: 3,
      certaintyReasoning: "",
      type: "technical",
      trigger: "",
      sourceSessions: ["s1"],
      projects: ["myapp"],
      date: "2026-06-30",
      uncertain: false,
    });
    expect(md).toContain("projects:");
    expect(md).toContain("myapp");
    expect(md).toContain("---");
  });
});
