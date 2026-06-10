import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getCachePath,
  loadCache,
  saveCache,
  getCachedSummary,
  setCachedSummary,
  pruneCache,
} from "./cache.js";
import type { SummaryCache } from "./cache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true }).catch(() => {});
});

function makeCache(entries: Record<string, string> = {}): SummaryCache {
  return { entries, updatedAt: "2026-06-10T00:00:00.000Z" };
}

// ---------------------------------------------------------------------------
// getCachePath
// ---------------------------------------------------------------------------

describe("getCachePath", () => {
  it("returns path under cc-session-mgr/cache", () => {
    const result = getCachePath("/home/user/.claude");
    expect(result).toBe("/home/user/.claude/cc-session-mgr/cache/summaries.json");
  });
});

// ---------------------------------------------------------------------------
// loadCache / saveCache
// ---------------------------------------------------------------------------

describe("loadCache", () => {
  it("returns empty cache when file does not exist", async () => {
    const cache = await loadCache(testDir);
    expect(cache.entries).toEqual({});
  });

  it("returns empty cache when file is malformed JSON", async () => {
    const path = getCachePath(testDir);
    await mkdir(path.replace("/summaries.json", ""), { recursive: true });
    await writeFile(path, "not json{{{");
    const cache = await loadCache(testDir);
    expect(cache.entries).toEqual({});
  });

  it("returns empty cache when file has wrong structure", async () => {
    const path = getCachePath(testDir);
    await mkdir(path.replace("/summaries.json", ""), { recursive: true });
    await writeFile(path, JSON.stringify({ wrong: true }));
    const cache = await loadCache(testDir);
    expect(cache.entries).toEqual({});
  });

  it("loads valid cache from disk", async () => {
    const path = getCachePath(testDir);
    await mkdir(path.replace("/summaries.json", ""), { recursive: true });
    const data = { entries: { "s1": "summary one" }, updatedAt: "2026-06-10T00:00:00.000Z" };
    await writeFile(path, JSON.stringify(data));

    const cache = await loadCache(testDir);
    expect(cache.entries).toEqual({ s1: "summary one" });
  });
});

describe("saveCache", () => {
  it("writes cache to disk and creates directories", async () => {
    const cache = makeCache({ s1: "hello" });
    await saveCache(testDir, cache);

    const path = getCachePath(testDir);
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);

    expect(parsed.entries).toEqual({ s1: "hello" });
    expect(parsed.updatedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// getCachedSummary / setCachedSummary
// ---------------------------------------------------------------------------

describe("getCachedSummary", () => {
  it("returns null for missing sessionId", () => {
    const cache = makeCache({ s1: "hello" });
    expect(getCachedSummary(cache, "s-missing")).toBeNull();
  });

  it("returns summary for existing sessionId", () => {
    const cache = makeCache({ s1: "hello" });
    expect(getCachedSummary(cache, "s1")).toBe("hello");
  });
});

describe("setCachedSummary", () => {
  it("returns new cache with entry added (immutable)", () => {
    const original = makeCache({ s1: "a" });
    const updated = setCachedSummary(original, "s2", "b");

    expect(updated.entries).toEqual({ s1: "a", s2: "b" });
    expect(original.entries).toEqual({ s1: "a" }); // unchanged
  });

  it("overwrites existing entry", () => {
    const original = makeCache({ s1: "old" });
    const updated = setCachedSummary(original, "s1", "new");

    expect(updated.entries.s1).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// pruneCache
// ---------------------------------------------------------------------------

describe("pruneCache", () => {
  it("does nothing when under limit", () => {
    const cache = makeCache({ s1: "a", s2: "b" });
    const pruned = pruneCache(cache, 500);
    expect(pruned).toBe(cache); // same reference
  });

  it("keeps only the last N entries when over limit", () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      entries[`s${i}`] = `summary-${i}`;
    }
    const cache = makeCache(entries);

    const pruned = pruneCache(cache, 5);
    const keys = Object.keys(pruned.entries);

    expect(keys).toHaveLength(5);
    expect(keys).toEqual(["s5", "s6", "s7", "s8", "s9"]);
  });
});
