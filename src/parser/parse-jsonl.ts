import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { JsonlEntry } from "../types/index.js";

/**
 * Stream-parse a Claude Code JSONL transcript file.
 *
 * Uses readline to process one line at a time without loading the
 * entire file into memory. Malformed lines are skipped with a warning.
 *
 * @param filePath - Absolute path to a `.jsonl` session transcript
 * @returns Array of successfully parsed JSON objects
 */
export async function parseJsonlStream(filePath: string): Promise<JsonlEntry[]> {
  const entries: JsonlEntry[] = [];

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber++;

    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    try {
      const parsed = JSON.parse(trimmed) as JsonlEntry;
      entries.push(parsed);
    } catch {
      // Skip malformed lines — forward-compatible with format changes
      console.warn(
        `[cc-session-mgr] Skipping malformed line ${lineNumber} in ${filePath}`,
      );
    }
  }

  return entries;
}
