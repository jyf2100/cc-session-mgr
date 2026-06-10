import type { JsonlEntry, SessionSummary, DaySlice, FileEditEntry } from "../types/index.js";
import { toDateStr } from "../cli/tz-utils.js";

/**
 * Split a session's entries into per-day slices based on each entry's timestamp.
 *
 * Each entry is attributed to the calendar date (in the configured timezone)
 * of its `timestamp` field. Entries without timestamps fall back to the
 * session's start date.
 */
export function splitSessionByDay(
  entries: JsonlEntry[],
  summary: SessionSummary,
): DaySlice[] {
  const fallbackDate = toDateStr(summary.startTime);

  // Bucket entries by date
  const buckets = new Map<string, JsonlEntry[]>();

  for (const entry of entries) {
    const date = entry.timestamp
      ? toDateStr(entry.timestamp)
      : fallbackDate;
    if (!date) continue;

    if (!buckets.has(date)) {
      buckets.set(date, []);
    }
    buckets.get(date)!.push(entry);
  }

  // Build a DaySlice per date
  const slices: DaySlice[] = [];
  for (const [date, dateEntries] of buckets) {
    slices.push(buildDaySlice(date, dateEntries));
  }

  // Sort chronologically
  slices.sort((a, b) => a.date.localeCompare(b.date));

  return slices;
}

function buildDaySlice(date: string, entries: JsonlEntry[]): DaySlice {
  let user = 0;
  let assistant = 0;
  let system = 0;
  let other = 0;
  let cost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const modelSet = new Set<string>();
  const editMap = new Map<string, number>();

  for (const entry of entries) {
    // Message counts
    if (entry.type === "user") {
      user++;
    } else if (entry.type === "assistant") {
      assistant++;

      // Cost from inline costUSD
      if (typeof entry.costUSD === "number") {
        cost += entry.costUSD;
      }

      // Model
      const model = entry.model ?? entry.message?.model ?? null;
      if (typeof model === "string" && model) {
        modelSet.add(model);
      }

      // Token usage
      const usage = (entry.message as Record<string, unknown> | undefined)
        ?.usage as Record<string, unknown> | undefined;
      if (usage) {
        if (typeof usage.input_tokens === "number") inputTokens += usage.input_tokens;
        if (typeof usage.output_tokens === "number") outputTokens += usage.output_tokens;
      }

      // File edits from tool_use
      extractFileEditsFromEntry(entry, editMap);
    } else if (entry.type === "system") {
      system++;
    }
  }

  const fileEdits: FileEditEntry[] = [...editMap.entries()]
    .map(([filePath, editCount]) => ({ filePath, editCount }))
    .sort((a, b) => b.editCount - a.editCount);

  return {
    date,
    messageCounts: { user, assistant, system, other },
    cost: Math.round(cost * 100) / 100,
    inputTokens,
    outputTokens,
    models: [...modelSet],
    fileEdits,
    entryCount: entries.length,
  };
}

/**
 * Extract file edit operations from tool_use blocks in an assistant entry.
 */
function extractFileEditsFromEntry(
  entry: JsonlEntry,
  editMap: Map<string, number>,
): void {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      block.type === "tool_use" &&
      (block.name === "Write" || block.name === "Edit")
    ) {
      const filePath = extractFilePath(block.input);
      if (filePath) {
        editMap.set(filePath, (editMap.get(filePath) ?? 0) + 1);
      }
    }
  }
}

function extractFilePath(input: unknown): string | null {
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.file_path === "string") return obj.file_path;
    if (typeof obj.filePath === "string") return obj.filePath;
    if (typeof obj.path === "string") return obj.path;
  }
  return null;
}
