import type { JsonlEntry, MessageCounts } from "../types/index.js";

const KNOWN_TYPES = new Set(["user", "assistant", "system"]);

/**
 * Count message types and identify the model from a session's entries.
 *
 * @returns An object with message counts and the set of models used.
 */
export function extractMessageStats(
  entries: JsonlEntry[],
): { counts: MessageCounts; models: string[] } {
  const counts: MessageCounts = { user: 0, assistant: 0, system: 0, other: 0 };
  const modelSet = new Set<string>();

  for (const entry of entries) {
    // Only count user and assistant as "messages" for context purposes
    if (entry.type === "user") {
      counts.user++;
    } else if (entry.type === "assistant") {
      counts.assistant++;
    } else if (entry.type === "system") {
      counts.system++;
    } else if (KNOWN_TYPES.has(entry.type)) {
      // Shouldn't reach here, but guard against future additions
      counts.other++;
    }
    // Non-message types (compact_boundary, mode, etc.) are not counted

    // Extract model from assistant entries
    if (entry.type === "assistant") {
      const model =
        entry.model ?? entry.message?.model ?? null;
      if (model) {
        modelSet.add(model);
      }
    }
  }

  return {
    counts,
    models: [...modelSet],
  };
}
