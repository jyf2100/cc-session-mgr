/**
 * Session postmortem — analyzes failed sessions for crash info,
 * root cause timeline, CLAUDE.md violations, and recovery suggestions.
 */

import type {
  JsonlEntry,
  CrashInfo,
  CrashType,
  PostmortemResult,
  PostmortemTimelineEntry,
  PostmortemViolation,
} from "../types/index.js";
import {
  extractTextContent,
  extractToolCalls,
  extractFilesModified,
  parseTimestamp,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of trailing entries to examine for root cause timeline. */
const ROOT_CAUSE_WINDOW = 10;

/** Time gap (ms) threshold for timeout detection — 30 minutes. */
const TIMEOUT_GAP_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Crash detection
// ---------------------------------------------------------------------------

interface CrashDetection {
  type: CrashType;
  timestamp: string;
  lastUserPrompt: string;
}

function detectCrash(entries: JsonlEntry[]): CrashDetection | null {
  if (entries.length === 0) return null;

  const lastUserPrompt = findLastUserPrompt(entries);
  const lastTimestamp =
    entries[entries.length - 1].timestamp ?? "";

  // Check for context window exceeded in the last 5 entries
  for (let i = entries.length - 1; i >= Math.max(0, entries.length - 5); i--) {
    const entry = entries[i];
    if (entry.type === "system") {
      const text = extractTextContent(entry).toLowerCase();
      if (
        text.includes("context window") ||
        text.includes("context length") ||
        text.includes("token limit") ||
        text.includes("max tokens")
      ) {
        return {
          type: "context_window_exceeded",
          timestamp: entry.timestamp ?? lastTimestamp,
          lastUserPrompt,
        };
      }
    }
    if (entry.type === "assistant") {
      const text = extractTextContent(entry).toLowerCase();
      if (
        text.includes("context window exceeded") ||
        text.includes("context length exceeded")
      ) {
        return {
          type: "context_window_exceeded",
          timestamp: entry.timestamp ?? lastTimestamp,
          lastUserPrompt,
        };
      }
    }
  }

  // Check for OOM / SIGKILL
  for (let i = entries.length - 1; i >= Math.max(0, entries.length - 5); i--) {
    const entry = entries[i];
    const text = extractTextContent(entry).toLowerCase();
    if (
      text.includes("oom") ||
      text.includes("out of memory") ||
      text.includes("sigkill") ||
      text.includes("memory limit")
    ) {
      return {
        type: "oom",
        timestamp: entry.timestamp ?? lastTimestamp,
        lastUserPrompt,
      };
    }
  }

  // Check for timeout — large time gap between last two entries
  if (entries.length >= 2) {
    const lastTs = parseTimestamp(entries[entries.length - 1].timestamp);
    const prevTs = parseTimestamp(entries[entries.length - 2].timestamp);
    if (
      !isNaN(lastTs) &&
      !isNaN(prevTs) &&
      lastTs - prevTs > TIMEOUT_GAP_MS
    ) {
      return {
        type: "timeout",
        timestamp: entries[entries.length - 1].timestamp ?? "",
        lastUserPrompt,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Root cause timeline
// ---------------------------------------------------------------------------

function buildRootCauseTimeline(
  entries: JsonlEntry[],
): PostmortemTimelineEntry[] {
  if (entries.length === 0) return [];

  const start = Math.max(0, entries.length - ROOT_CAUSE_WINDOW);
  const timeline: PostmortemTimelineEntry[] = [];
  let foundTrigger = false;

  for (let i = start; i < entries.length; i++) {
    const entry = entries[i];
    let annotation = "";
    let isTrigger = false;

    if (entry.type === "user") {
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        const hasError = content.some(
          (block) =>
            typeof block === "object" &&
            block !== null &&
            (block as Record<string, unknown>).type === "tool_result" &&
            (block as Record<string, unknown>).is_error === true,
        );
        if (hasError) {
          annotation = "Error result received";
          if (!foundTrigger) {
            isTrigger = true;
            foundTrigger = true;
          }
        }
      }
    }

    if (entry.type === "system") {
      const text = extractTextContent(entry).toLowerCase();
      if (
        text.includes("error") ||
        text.includes("fail") ||
        text.includes("crash")
      ) {
        annotation = "System error event";
      }
    }

    if (entry.type === "assistant") {
      const calls = extractToolCalls([entry]);
      if (calls.length > 0) {
        annotation = `Tool calls: ${calls.map((c) => c.toolName).join(", ")}`;
      }
    }

    if (annotation) {
      timeline.push({ entryIndex: i, annotation, isTrigger });
    }
  }

  return timeline;
}

// ---------------------------------------------------------------------------
// CLAUDE.md violation detection
// ---------------------------------------------------------------------------

function detectViolations(entries: JsonlEntry[]): PostmortemViolation[] {
  const violations: PostmortemViolation[] = [];
  const filesModified = extractFilesModified(entries);
  const calls = extractToolCalls(entries);

  const sourceFiles = filesModified.filter(
    (f) =>
      !f.includes(".test.") &&
      !f.includes(".spec.") &&
      !f.includes("__tests__"),
  );
  const testFiles = filesModified.filter(
    (f) =>
      f.includes(".test.") ||
      f.includes(".spec.") ||
      f.includes("__tests__"),
  );

  if (sourceFiles.length >= 3 && testFiles.length === 0) {
    violations.push({
      rule: "test-coverage",
      description: `Modified ${sourceFiles.length} source files without creating any test files`,
    });
  }

  const readCalls = calls.filter((c) => c.toolName === "Read");
  if (readCalls.length > 20 && filesModified.length === 0) {
    violations.push({
      rule: "no-output",
      description: `Read ${readCalls.length} files without making any modifications`,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Recovery suggestions
// ---------------------------------------------------------------------------

function generateRecoverySuggestions(crashType: CrashType): string[] {
  switch (crashType) {
    case "context_window_exceeded":
      return [
        "Use /compact more frequently to reduce context size",
        "Split the task into smaller, more focused sessions",
        "Reduce the scope of file reads — use specific line ranges",
        "Start a fresh session for the next part of the task",
      ];
    case "oom":
      return [
        "Reduce concurrent file operations",
        "Check for infinite loops in tool calls",
        "Break large file operations into smaller batches",
        "Restart the session with a smaller context window",
      ];
    case "timeout":
      return [
        "The session may have stalled — check the last operation",
        "Consider splitting long-running tasks into stages",
        "Use /compact to free up resources",
      ];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findLastUserPrompt(entries: JsonlEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === "user") {
      const content = entries[i].message?.content;
      if (typeof content === "string") {
        return content.slice(0, 100);
      }
      if (Array.isArray(content)) {
        const hasToolResult = content.some(
          (block) =>
            typeof block === "object" &&
            block !== null &&
            (block as Record<string, unknown>).type === "tool_result",
        );
        if (!hasToolResult) {
          const textBlock = content.find(
            (block) =>
              typeof block === "object" &&
              block !== null &&
              (block as Record<string, unknown>).type === "text",
          );
          if (textBlock) {
            return ((textBlock as Record<string, unknown>).text as string)?.slice(0, 100) ?? "";
          }
        }
      }
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Analyze a session for crash information, root causes, and violations.
 */
export function analyzePostmortem(entries: JsonlEntry[]): PostmortemResult {
  if (entries.length === 0) {
    return {
      crashInfo: null,
      rootCauseTimeline: [],
      agentsMdViolations: [],
      recoverySuggestions: [],
    };
  }

  const crash = detectCrash(entries);

  if (crash === null) {
    return {
      crashInfo: null,
      rootCauseTimeline: [],
      agentsMdViolations: [],
      recoverySuggestions: [],
    };
  }

  const crashInfo: CrashInfo = {
    type: crash.type,
    timestamp: crash.timestamp,
    lastUserPrompt: crash.lastUserPrompt,
  };

  const rootCauseTimeline = buildRootCauseTimeline(entries);
  const agentsMdViolations = detectViolations(entries);
  const recoverySuggestions = generateRecoverySuggestions(crash.type);

  return {
    crashInfo,
    rootCauseTimeline,
    agentsMdViolations,
    recoverySuggestions,
  };
}
