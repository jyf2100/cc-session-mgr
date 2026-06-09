import type { JsonlEntry, FileEditEntry } from "../types/index.js";

/**
 * Scan tool_use entries for file edit operations (Write, Edit)
 * and produce a summary of modified files with edit counts.
 */
export function extractFileEditSummary(entries: JsonlEntry[]): FileEditEntry[] {
  const editMap = new Map<string, number>();

  for (const entry of entries) {
    if (entry.type !== "assistant") continue;

    // Tool calls are in message.content as an array of content blocks
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;

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

  return [...editMap.entries()]
    .map(([filePath, editCount]) => ({ filePath, editCount }))
    .sort((a, b) => b.editCount - a.editCount);
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
