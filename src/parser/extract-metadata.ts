import type { JsonlEntry, SessionSummary } from "../types/index.js";

/**
 * Extract session-level metadata from parsed JSONL entries.
 *
 * Scans entries to find sessionId, cwd, timestamps, version,
 * custom title, and compaction status.
 */
export function extractSessionMetadata(
  entries: JsonlEntry[],
  fallbackSessionId: string,
  encodedDir: string,
): Pick<
  SessionSummary,
  | "sessionId"
  | "projectPath"
  | "startTime"
  | "endTime"
  | "isCompacted"
  | "hasCustomTitle"
  | "customTitle"
> {
  let sessionId: string | null = null;
  let projectPath: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  let isCompacted = false;
  let hasCustomTitle = false;
  let customTitle: string | null = null;

  for (const entry of entries) {
    // Extract sessionId from first entry that has it
    if (!sessionId && entry.sessionId) {
      sessionId = entry.sessionId;
    }

    // Extract cwd (real project path) from first entry that has it
    if (entry.cwd && !projectPath) {
      projectPath = entry.cwd;
    }

    // Track timestamps
    if (entry.timestamp) {
      if (!startTime) {
        startTime = entry.timestamp;
      }
      endTime = entry.timestamp;
    }

    // Detect compaction
    if (entry.type === "compact_boundary") {
      isCompacted = true;
    }

    // Detect custom title
    if (entry.type === "custom-title" && typeof entry.title === "string") {
      hasCustomTitle = true;
      customTitle = entry.title;
    }
  }

  return {
    sessionId: sessionId ?? fallbackSessionId,
    projectPath: projectPath ?? encodedDir,
    startTime,
    endTime,
    isCompacted,
    hasCustomTitle,
    customTitle,
  };
}
