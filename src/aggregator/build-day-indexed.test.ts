import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildDayIndexedSummaries } from "./build-day-indexed.js";
import { setTimezone } from "../cli/tz-utils.js";

let testDir: string;

beforeEach(() => {
  setTimezone("UTC");
  testDir = join(tmpdir(), `cc-build-day-indexed-test-${Date.now()}`);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function writeSessionFile(
  projectDir: string,
  fileName: string,
  entries: object[],
): Promise<string> {
  const dir = join(testDir, "projects", projectDir);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, fileName);
  const content = entries.map((e) => JSON.stringify(e)).join("\n");
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

describe("buildDayIndexedSummaries", () => {
  it("returns empty array for empty claude dir", async () => {
    await mkdir(join(testDir, "projects"), { recursive: true });
    const result = await buildDayIndexedSummaries(testDir);
    expect(result).toHaveLength(0);
  });

  it("builds single session with one day slice", async () => {
    await writeSessionFile("-home-dev-app", "session-001.jsonl", [
      {
        type: "user",
        timestamp: "2026-06-09T10:00:00Z",
        message: { role: "user", content: "hello" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-09T10:01:00Z",
        model: "claude-sonnet-4-6",
        costUSD: 0.03,
        message: { role: "assistant", content: [] },
      },
      {
        type: "user",
        timestamp: "2026-06-09T11:00:00Z",
        message: { role: "user", content: "world" },
      },
    ]);

    const result = await buildDayIndexedSummaries(testDir);

    expect(result).toHaveLength(1);

    const indexed = result[0];
    expect(indexed.summary.models).toContain("claude-sonnet-4-6");
    expect(indexed.daySlices).toHaveLength(1);
    expect(indexed.daySlices[0].date).toBe("2026-06-09");
    expect(indexed.daySlices[0].messageCounts.user).toBe(2);
    expect(indexed.daySlices[0].messageCounts.assistant).toBe(1);
    expect(indexed.daySlices[0].cost).toBe(0.03);
  });

  it("splits a cross-midnight session into two day slices", async () => {
    await writeSessionFile("-home-dev-app", "session-002.jsonl", [
      {
        type: "user",
        timestamp: "2026-06-09T22:00:00Z",
        message: { role: "user", content: "start" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-09T22:30:00Z",
        costUSD: 0.04,
        model: "claude-sonnet-4-6",
        message: { role: "assistant", content: [] },
      },
      {
        type: "user",
        timestamp: "2026-06-10T01:00:00Z",
        message: { role: "user", content: "continue" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-10T01:30:00Z",
        costUSD: 0.02,
        model: "claude-haiku-4-5",
        message: { role: "assistant", content: [] },
      },
    ]);

    const result = await buildDayIndexedSummaries(testDir);

    expect(result).toHaveLength(1);
    const slices = result[0].daySlices;

    expect(slices).toHaveLength(2);

    expect(slices[0].date).toBe("2026-06-09");
    expect(slices[0].messageCounts.user).toBe(1);
    expect(slices[0].messageCounts.assistant).toBe(1);
    expect(slices[0].cost).toBe(0.04);

    expect(slices[1].date).toBe("2026-06-10");
    expect(slices[1].messageCounts.user).toBe(1);
    expect(slices[1].messageCounts.assistant).toBe(1);
    expect(slices[1].cost).toBe(0.02);
  });

  it("handles multiple sessions across different projects", async () => {
    await writeSessionFile("-home-dev-app", "session-a.jsonl", [
      {
        type: "user",
        timestamp: "2026-06-09T10:00:00Z",
        message: { role: "user", content: "a" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-09T10:01:00Z",
        model: "claude-sonnet-4-6",
        message: { role: "assistant", content: [] },
      },
    ]);

    await writeSessionFile("-home-dev-other", "session-b.jsonl", [
      {
        type: "user",
        timestamp: "2026-06-10T14:00:00Z",
        message: { role: "user", content: "b" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-10T14:01:00Z",
        model: "claude-haiku-4-5",
        message: { role: "assistant", content: [] },
      },
    ]);

    const result = await buildDayIndexedSummaries(testDir);

    expect(result).toHaveLength(2);
  });

  it("skips corrupt JSONL files gracefully", async () => {
    const dir = join(testDir, "projects", "-home-dev-app");
    await mkdir(dir, { recursive: true });
    // Write invalid JSONL
    await writeFile(join(dir, "corrupt.jsonl"), "not valid json{{{", "utf-8");

    const result = await buildDayIndexedSummaries(testDir);
    // Should not throw, returns empty (corrupt file has no valid lines)
    expect(result).toHaveLength(0);
  });

  it("respects timezone for day splitting", async () => {
    setTimezone("Asia/Shanghai");

    await writeSessionFile("-home-dev-app", "session-tz.jsonl", [
      {
        type: "user",
        timestamp: "2026-06-09T16:00:00Z", // Shanghai: 2026-06-10 00:00
        message: { role: "user", content: "tz" },
      },
      {
        type: "assistant",
        timestamp: "2026-06-09T16:30:00Z", // Shanghai: 2026-06-10 00:30
        model: "claude-sonnet-4-6",
        message: { role: "assistant", content: [] },
      },
    ]);

    const result = await buildDayIndexedSummaries(testDir);

    expect(result).toHaveLength(1);
    const slices = result[0].daySlices;

    // Both entries are on 2026-06-10 in Shanghai time
    expect(slices).toHaveLength(1);
    expect(slices[0].date).toBe("2026-06-10");
  });
});
