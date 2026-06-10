/**
 * Summary cache — persists per-session LLM summaries to avoid redundant API calls.
 *
 * Cache is keyed by sessionId, stored as JSON at `{claudeDir}/cc-session-mgr/cache/summaries.json`.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummaryCache {
  /** sessionId → summary text */
  entries: Record<string, string>;
  /** ISO timestamp of last cache write */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Return the cache file path for a given claude directory.
 *
 * @param claudeDir — Typically `~/.claude/`
 */
export function getCachePath(claudeDir: string): string {
  return `${claudeDir}/cc-session-mgr/cache/summaries.json`;
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/**
 * Load the summary cache from disk.
 *
 * Returns an empty cache if the file doesn't exist or is malformed.
 */
export async function loadCache(claudeDir: string): Promise<SummaryCache> {
  const path = getCachePath(claudeDir);

  try {
    const raw = await readFile(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      "entries" in parsed &&
      typeof (parsed as SummaryCache).entries === "object"
    ) {
      return parsed as SummaryCache;
    }
  } catch {
    // File not found or invalid JSON — return empty cache
  }

  return { entries: {}, updatedAt: new Date().toISOString() };
}

/**
 * Save the summary cache to disk.
 *
 * Creates parent directories if they don't exist.
 */
export async function saveCache(
  claudeDir: string,
  cache: SummaryCache,
): Promise<void> {
  const path = getCachePath(claudeDir);

  cache.updatedAt = new Date().toISOString();

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Get a cached summary for a session.
 *
 * Returns the summary text, or null if not cached.
 */
export function getCachedSummary(
  cache: SummaryCache,
  sessionId: string,
): string | null {
  const entry = cache.entries[sessionId];
  return typeof entry === "string" ? entry : null;
}

/**
 * Store a summary in the cache.
 *
 * Returns a new cache object (immutable update).
 */
export function setCachedSummary(
  cache: SummaryCache,
  sessionId: string,
  summary: string,
): SummaryCache {
  return {
    ...cache,
    entries: {
      ...cache.entries,
      [sessionId]: summary,
    },
  };
}

/**
 * Prune stale cache entries.
 *
 * Removes entries whose sessionId can be linked to sessions older than `maxAgeDays`.
 * Since we don't store timestamps per entry, this uses a simple heuristic:
 * if the cache has more than `maxEntries`, keep only the most recent `maxEntries`.
 *
 * @param cache — The cache to prune
 * @param maxEntries — Maximum number of entries to keep (default 500)
 */
export function pruneCache(
  cache: SummaryCache,
  maxEntries: number = 500,
): SummaryCache {
  const keys = Object.keys(cache.entries);

  if (keys.length <= maxEntries) {
    return cache;
  }

  // Keep the last `maxEntries` by insertion order (JSON preserves order)
  const kept = keys.slice(-maxEntries);
  const entries: Record<string, string> = {};
  for (const key of kept) {
    entries[key] = cache.entries[key]!;
  }

  return { ...cache, entries };
}
