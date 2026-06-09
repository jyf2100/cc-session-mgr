import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseJsonlStream } from "./parse-jsonl.js";
import { extractSessionMetadata } from "./extract-metadata.js";
import { extractMessageStats } from "./extract-message-stats.js";
import { extractCostData } from "./extract-cost.js";
import { scanProjects } from "./scan-projects.js";
import { decodeProjectPaths } from "./decode-paths.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

async function makeTestDir(): Promise<string> {
  testDir = join(tmpdir(), `cc-session-mgr-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  return testDir;
}

async function writeJsonl(filePath: string, lines: object[]): Promise<void> {
  const content = lines.map((l) => JSON.stringify(l)).join("\n");
  await writeFile(filePath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// parseJsonlStream
// ---------------------------------------------------------------------------

describe("parseJsonlStream", () => {
  beforeEach(makeTestDir);
  afterEach(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  it("parses valid JSONL file", async () => {
    const filePath = join(testDir, "test.jsonl");
    await writeJsonl(filePath, [
      { type: "user", sessionId: "abc-123" },
      { type: "assistant", sessionId: "abc-123" },
    ]);

    const entries = await parseJsonlStream(filePath);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("user");
    expect(entries[1].type).toBe("assistant");
  });

  it("skips malformed lines without failing", async () => {
    const filePath = join(testDir, "malformed.jsonl");
    const content = [
      '{"type":"user"}',
      "NOT JSON",
      '{"type":"assistant"}',
      "",
      '{"type":"system"}',
    ].join("\n");
    await writeFile(filePath, content, "utf-8");

    const entries = await parseJsonlStream(filePath);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.type)).toEqual(["user", "assistant", "system"]);
  });

  it("handles empty file", async () => {
    const filePath = join(testDir, "empty.jsonl");
    await writeFile(filePath, "", "utf-8");

    const entries = await parseJsonlStream(filePath);
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractSessionMetadata
// ---------------------------------------------------------------------------

describe("extractSessionMetadata", () => {
  it("extracts sessionId, cwd, and timestamps from entries", () => {
    const entries = [
      { type: "last-prompt", sessionId: "sess-001" },
      { type: "user", sessionId: "sess-001", cwd: "/home/dev/app", timestamp: "2026-06-09T10:00:00Z" },
      { type: "assistant", sessionId: "sess-001", timestamp: "2026-06-09T10:05:00Z" },
    ];

    const meta = extractSessionMetadata(entries, "fallback", "encoded-dir");
    expect(meta.sessionId).toBe("sess-001");
    expect(meta.projectPath).toBe("/home/dev/app");
    expect(meta.startTime).toBe("2026-06-09T10:00:00Z");
    expect(meta.endTime).toBe("2026-06-09T10:05:00Z");
  });

  it("uses fallback sessionId and encoded dir when metadata is missing", () => {
    const entries = [{ type: "mode" }, { type: "permission-mode" }];
    const meta = extractSessionMetadata(entries, "fallback-id", "encoded-123");
    expect(meta.sessionId).toBe("fallback-id");
    expect(meta.projectPath).toBe("encoded-123");
  });

  it("detects compaction and custom title", () => {
    const entries = [
      { type: "compact_boundary" },
      { type: "custom-title", title: "My Session" },
    ];
    const meta = extractSessionMetadata(entries, "x", "y");
    expect(meta.isCompacted).toBe(true);
    expect(meta.hasCustomTitle).toBe(true);
    expect(meta.customTitle).toBe("My Session");
  });
});

// ---------------------------------------------------------------------------
// extractMessageStats
// ---------------------------------------------------------------------------

describe("extractMessageStats", () => {
  it("counts message types correctly", () => {
    const entries = [
      { type: "user" },
      { type: "user" },
      { type: "assistant", model: "claude-sonnet-4-6" },
      { type: "system" },
      { type: "mode" },           // not counted
      { type: "compact_boundary" }, // not counted
    ];

    const { counts, models } = extractMessageStats(entries);
    expect(counts).toEqual({ user: 2, assistant: 1, system: 1, other: 0 });
    expect(models).toEqual(["claude-sonnet-4-6"]);
  });

  it("extracts multiple models from assistant entries", () => {
    const entries = [
      { type: "assistant", model: "sonnet" },
      { type: "assistant", message: { model: "haiku" } },
      { type: "assistant" }, // no model
    ];

    const { models } = extractMessageStats(entries);
    expect(models.sort()).toEqual(["haiku", "sonnet"]);
  });

  it("returns zeros for empty entries", () => {
    const { counts, models } = extractMessageStats([]);
    expect(counts).toEqual({ user: 0, assistant: 0, system: 0, other: 0 });
    expect(models).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractCostData
// ---------------------------------------------------------------------------

describe("extractCostData", () => {
  it("sums costUSD from assistant entries", () => {
    const entries = [
      { type: "user" },
      { type: "assistant", costUSD: 0.01 },
      { type: "assistant", costUSD: 0.02 },
      { type: "assistant", costUSD: 0.03 },
    ];

    const cost = extractCostData(entries);
    expect(cost.totalUSD).toBeCloseTo(0.06, 2);
    expect(cost.source).toBe("inline");
    expect(cost.incomplete).toBe(false);
  });

  it("flags incomplete cost data when some entries lack costUSD", () => {
    const entries = [
      { type: "assistant", costUSD: 0.01 },
      { type: "assistant" }, // missing costUSD
    ];

    const cost = extractCostData(entries);
    expect(cost.totalUSD).toBe(0.01);
    expect(cost.incomplete).toBe(true);
  });

  it("returns zero cost for no assistant entries", () => {
    const cost = extractCostData([{ type: "user" }]);
    expect(cost.totalUSD).toBe(0);
    expect(cost.incomplete).toBe(false);
  });

  it("extracts tokens from message.usage when costUSD is absent", () => {
    const entries = [
      {
        type: "assistant",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200 },
        },
      },
    ];

    const cost = extractCostData(entries);
    expect(cost.inputTokens).toBe(1000);
    expect(cost.outputTokens).toBe(500);
    expect(cost.cacheReadTokens).toBe(200);
    expect(cost.isEstimated).toBe(true);
    expect(cost.totalUSD).toBeGreaterThan(0);
  });

  it("uses costUSD directly when present, still extracts tokens", () => {
    const entries = [
      {
        type: "assistant",
        costUSD: 0.05,
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 500, output_tokens: 100 },
        },
      },
    ];

    const cost = extractCostData(entries);
    expect(cost.totalUSD).toBe(0.05);
    expect(cost.isEstimated).toBe(false);
  });

  it("handles missing message.usage gracefully", () => {
    const entries = [{ type: "assistant" }];
    const cost = extractCostData(entries);
    expect(cost.totalUSD).toBe(0);
    expect(cost.inputTokens).toBe(0);
    expect(cost.outputTokens).toBe(0);
    expect(cost.isEstimated).toBe(false);
  });

  it("estimates cost as 0 for unknown model with tokens", () => {
    const entries = [
      {
        type: "assistant",
        message: {
          model: "glm-5.1",
          usage: { input_tokens: 50000, output_tokens: 2000 },
        },
      },
    ];

    const cost = extractCostData(entries);
    expect(cost.totalUSD).toBe(0);
    expect(cost.inputTokens).toBe(50000);
    expect(cost.outputTokens).toBe(2000);
    expect(cost.isEstimated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scanProjects
// ---------------------------------------------------------------------------

describe("scanProjects", () => {
  beforeEach(makeTestDir);
  afterEach(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  it("discovers project directories with JSONL files", async () => {
    const projDir = join(testDir, "projects", "my-encoded-project");
    await mkdir(projDir, { recursive: true });
    await writeJsonl(join(projDir, "session-001.jsonl"), [{ type: "user" }]);

    const results = await scanProjects(testDir);
    expect(results).toHaveLength(1);
    expect(results[0].encodedName).toBe("my-encoded-project");
    expect(results[0].jsonlFiles).toHaveLength(1);
  });

  it("returns empty array when no projects directory exists", async () => {
    const results = await scanProjects(join(testDir, "nonexistent"));
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// decodeProjectPaths
// ---------------------------------------------------------------------------

describe("decodeProjectPaths", () => {
  beforeEach(makeTestDir);
  afterEach(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  it("decodes paths from session metadata (layer 1)", async () => {
    const sessionsDir = join(testDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(
      join(sessionsDir, "12345.json"),
      JSON.stringify({ cwd: "/Users/dev/myapp", sessionId: "abc" }),
      "utf-8",
    );

    const projectDirs = [{ encodedName: "-Users-dev-myapp", dirPath: "/x", jsonlFiles: [] }];
    const pathMap = await decodeProjectPaths(projectDirs, testDir);
    expect(pathMap.get("-Users-dev-myapp")).toBe("/Users/dev/myapp");
  });

  it("falls back to naive decode when no metadata exists", async () => {
    const projectDirs = [{ encodedName: "-home-dev-project", dirPath: "/x", jsonlFiles: [] }];
    const pathMap = await decodeProjectPaths(projectDirs, testDir);
    expect(pathMap.get("-home-dev-project")).toBe("/home/dev/project");
  });
});
