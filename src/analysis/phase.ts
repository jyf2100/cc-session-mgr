/**
 * Phase detection — splits a session into logical phases by user prompt boundaries.
 *
 * Each phase starts at a `type === "user"` entry with non-empty text content
 * and includes all subsequent entries until the next user prompt or end of array.
 */

import type { JsonlEntry, Phase, ToolCall } from "../types/index.js";
import {
  extractTextContent,
  extractToolCalls,
  extractFilesModified,
  sumCost,
  parseTimestamp,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum length for a phase name. */
const MAX_PHASE_NAME_LENGTH = 80;

// ---------------------------------------------------------------------------
// Phase name derivation
// ---------------------------------------------------------------------------

/**
 * Derive a phase name from user prompt content.
 * Collapses newlines to spaces, trims, and truncates to 80 chars.
 */
function derivePhaseName(content: string): string {
  const collapsed = content.replace(/\n/g, " ").trim();
  return collapsed.slice(0, MAX_PHASE_NAME_LENGTH);
}

// ---------------------------------------------------------------------------
// Error / retry counting
// ---------------------------------------------------------------------------

/**
 * Count entries that look like errors (tool_result with is_error or content
 * containing "Error").
 */
function countErrors(entries: JsonlEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.type !== "user") continue;
    const content = entry.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "tool_result" &&
          ((block as Record<string, unknown>).is_error === true ||
            (typeof (block as Record<string, unknown>).content === "string" &&
              ((block as Record<string, unknown>).content as string).includes(
                "Error",
              )))
        ) {
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Count retries — pairs of same tool call to same file/resource with an error
 * in between.
 */
function countRetries(entries: JsonlEntry[], toolCalls: ToolCall[]): number {
  let retries = 0;
  const errors = countErrors(entries);
  if (errors === 0 || toolCalls.length < 2) return 0;

  // Check consecutive tool calls with same name and primary input arg
  for (let i = 1; i < toolCalls.length; i++) {
    const prev = toolCalls[i - 1];
    const curr = toolCalls[i];
    if (prev.toolName === curr.toolName) {
      const prevPath =
        (prev.input.file_path as string | undefined) ??
        (prev.input.filePath as string | undefined);
      const currPath =
        (curr.input.file_path as string | undefined) ??
        (curr.input.filePath as string | undefined);
      if (prevPath && prevPath === currPath) {
        retries++;
      }
    }
  }
  return retries;
}

// ---------------------------------------------------------------------------
// Phase boundary detection
// ---------------------------------------------------------------------------

/**
 * Check if an entry is a user prompt (has non-empty text content).
 */
function isUserPrompt(entry: JsonlEntry): boolean {
  if (entry.type !== "user") return false;
  const text = extractTextContent(entry);
  return text.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Detect phases within a session by splitting on user prompt boundaries.
 *
 * Returns an array of `Phase` objects, each containing its entries, tool calls,
 * file modifications, error/retry counts, timing, and cost.
 */
export function detectPhases(entries: JsonlEntry[]): Phase[] {
  if (entries.length === 0) return [];

  // Find indices of user prompts to establish phase boundaries
  const boundaries: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (isUserPrompt(entries[i])) {
      boundaries.push(i);
    }
  }

  if (boundaries.length === 0) return [];

  const phases: Phase[] = [];

  for (let p = 0; p < boundaries.length; p++) {
    const startIdx = boundaries[p];
    const endIdx =
      p + 1 < boundaries.length ? boundaries[p + 1] : entries.length;

    const phaseEntries = entries.slice(startIdx, endIdx);
    const toolCalls = extractToolCalls(phaseEntries);
    const filesModified = extractFilesModified(phaseEntries);
    const costUSD = sumCost(phaseEntries);
    const errorCount = countErrors(phaseEntries);
    const retryCount = countRetries(phaseEntries, toolCalls);

    // Name from the user prompt that starts this phase
    const name = derivePhaseName(extractTextContent(entries[startIdx]));

    // Timing
    const firstTs = phaseEntries[0]?.timestamp;
    const lastTs = phaseEntries[phaseEntries.length - 1]?.timestamp;
    const startMs = parseTimestamp(firstTs);
    const endMs = parseTimestamp(lastTs);
    const hasTimestamps = !isNaN(startMs) && !isNaN(endMs);

    phases.push({
      index: p,
      name,
      startTime: hasTimestamps ? firstTs ?? "" : "",
      endTime: hasTimestamps ? lastTs ?? "" : "",
      durationMs: hasTimestamps ? endMs - startMs : 0,
      entries: phaseEntries,
      toolCalls,
      filesModified,
      errorCount,
      retryCount,
      costUSD,
    });
  }

  return phases;
}
