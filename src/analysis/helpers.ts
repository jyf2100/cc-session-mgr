/**
 * Shared pure-function utilities for the analysis layer.
 *
 * Every function operates on `JsonlEntry[]` or a single `JsonlEntry`
 * and returns a derived value with no side effects.
 */

import type { JsonlEntry, ToolCall } from "../types/index.js";

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Extract plain text from a `JsonlEntry`'s `message.content` field.
 *
 * Content can be:
 * - a plain string
 * - an array of content blocks (`{ type: "text", text: "..." }`)
 * - missing / undefined
 */
export function extractTextContent(entry: JsonlEntry): string {
  const content = entry.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" &&
          block !== null &&
          block.type === "text" &&
          typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Tool call extraction
// ---------------------------------------------------------------------------

interface ToolUseBlock {
  type: "tool_use";
  id?: string;
  name: string;
  input: Record<string, unknown>;
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as Record<string, unknown>).type === "tool_use" &&
    typeof (block as Record<string, unknown>).name === "string"
  );
}

/**
 * Extract all `tool_use` blocks from an array of entries.
 * Returns `ToolCall[]` with the parent entry index attached.
 */
export function extractToolCalls(entries: JsonlEntry[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (let i = 0; i < entries.length; i++) {
    const content = entries[i].message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (isToolUseBlock(block)) {
        calls.push({
          toolName: block.name,
          input: block.input ?? {},
          entryIndex: i,
        });
      }
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// File path extraction
// ---------------------------------------------------------------------------

/** File-editing tools that carry a `filePath` or `file_path` in their input. */
const FILE_EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

/**
 * Extract unique file paths modified by tool calls in the given entries.
 * Only counts tools that write/edit files (Edit, Write, MultiEdit).
 */
export function extractFilesModified(entries: JsonlEntry[]): string[] {
  const paths = new Set<string>();
  const calls = extractToolCalls(entries);
  for (const call of calls) {
    if (!FILE_EDIT_TOOLS.has(call.toolName)) continue;
    const path =
      (call.input.file_path as string | undefined) ??
      (call.input.filePath as string | undefined);
    if (typeof path === "string" && path.length > 0) {
      paths.add(path);
    }
  }
  return [...paths];
}

// ---------------------------------------------------------------------------
// Cost helpers
// ---------------------------------------------------------------------------

/** Sum all `costUSD` values present in the entries array. */
export function sumCost(entries: JsonlEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (typeof entry.costUSD === "number") {
      total += entry.costUSD;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Parse a timestamp string into milliseconds since epoch.
 * Returns `NaN` for missing or unparseable timestamps.
 */
export function parseTimestamp(ts: string | undefined): number {
  if (!ts) return NaN;
  return Date.parse(ts);
}
