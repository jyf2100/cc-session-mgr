/**
 * Standup report generation — extracts structured status from a session.
 *
 * Produces a `StandupReport` with approaches taken, abandoned attempts,
 * uncertainties, review items, new dependencies, and context reset count.
 */

import type {
  JsonlEntry,
  StandupReport,
  StandupApproach,
  StandupUncertainty,
} from "../types/index.js";
import {
  extractTextContent,
  extractToolCalls,
  extractFilesModified,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Uncertainty markers in user messages. */
const UNCERTAINTY_MARKERS = ["?", "not sure", "maybe", "try"];

/** Install command patterns for dependency detection. */
const INSTALL_PATTERNS = [
  /npm\s+install\s+(.+)/,
  /npm\s+i\s+(.+)/,
  /npm\s+add\s+(.+)/,
  /yarn\s+add\s+(.+)/,
  /pnpm\s+add\s+(.+)/,
  /pip\s+install\s+(.+)/,
  /pip3\s+install\s+(.+)/,
  /bun\s+add\s+(.+)/,
];

// ---------------------------------------------------------------------------
// Abandoned approach detection
// ---------------------------------------------------------------------------

interface Attempt {
  description: string;
  filesModified: string[];
  entryIndex: number;
}

/**
 * Detect abandoned approaches by looking for user messages that signal
 * a course correction (e.g., "no", "try something else", "don't do that")
 * followed by a new direction.
 */
function detectAbandoned(entries: JsonlEntry[]): {
  final: StandupApproach[];
  abandoned: StandupApproach[];
} {
  const attempts: Attempt[] = [];
  let currentFiles: string[] = [];
  let currentDesc = "";
  let currentStart = 0;

  function flushAttempt() {
    if (currentDesc || currentFiles.length > 0) {
      attempts.push({
        description: currentDesc || "unnamed task",
        filesModified: [...currentFiles],
        entryIndex: currentStart,
      });
    }
    currentFiles = [];
    currentDesc = "";
  }

  const courseCorrectionPatterns =
    /\b(no|don't|stop|wrong|different|something else|try (?:a different|another)|not that|redo|restart)\b/i;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.type === "user") {
      const text = extractTextContent(entry).trim();

      if (currentDesc && courseCorrectionPatterns.test(text)) {
        flushAttempt();
        currentStart = i;
        continue;
      }

      if (!currentDesc && text.length > 0) {
        currentDesc = text.slice(0, 100);
        currentStart = i;
      }
    }

    if (entry.type === "assistant") {
      const calls = extractToolCalls([entry]);
      for (const call of calls) {
        if (["Edit", "Write", "MultiEdit"].includes(call.toolName)) {
          const path =
            (call.input.file_path as string | undefined) ??
            (call.input.filePath as string | undefined);
          if (path && !currentFiles.includes(path)) {
            currentFiles.push(path);
          }
        }
      }
    }
  }

  flushAttempt();

  if (attempts.length <= 1) {
    return { final: attempts, abandoned: [] };
  }

  return {
    final: [attempts[attempts.length - 1]],
    abandoned: attempts.slice(0, -1),
  };
}

// ---------------------------------------------------------------------------
// Dependency detection
// ---------------------------------------------------------------------------

function detectNewDependencies(entries: JsonlEntry[]): string[] {
  const calls = extractToolCalls(entries);
  const packages: string[] = [];

  for (const call of calls) {
    if (call.toolName !== "Bash") continue;
    const command = (call.input.command as string | undefined) ?? "";
    if (!command) continue;

    for (const pattern of INSTALL_PATTERNS) {
      const match = command.match(pattern);
      if (match) {
        const pkgArg = match[1].trim();
        const pkgs = pkgArg
          .split(/\s+/)
          .filter((p) => p.length > 0 && !p.startsWith("-"));
        for (const pkg of pkgs) {
          const name = pkg.split(/[@=<>~^]/)[0];
          if (name && !packages.includes(name)) {
            packages.push(name);
          }
        }
      }
    }
  }

  return packages;
}

// ---------------------------------------------------------------------------
// Uncertainty detection
// ---------------------------------------------------------------------------

function detectUncertainties(entries: JsonlEntry[]): StandupUncertainty[] {
  const uncertainties: StandupUncertainty[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "user") continue;

    const text = extractTextContent(entry).trim();
    if (!text) continue;

    const hasMarker = UNCERTAINTY_MARKERS.some((m) =>
      text.toLowerCase().includes(m.toLowerCase()),
    );
    if (hasMarker) {
      uncertainties.push({
        userMessage: text.slice(0, 200),
        entryIndex: i,
      });
    }
  }

  return uncertainties;
}

// ---------------------------------------------------------------------------
// Context reset counting
// ---------------------------------------------------------------------------

function countContextResets(entries: JsonlEntry[]): number {
  return entries.filter((e) => e.type === "compact_boundary").length;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Generate a structured standup report from session entries.
 */
export function generateStandup(entries: JsonlEntry[]): StandupReport {
  if (entries.length === 0) {
    return {
      approaches: [],
      abandoned: [],
      uncertainties: [],
      reviewItems: [],
      newDependencies: [],
      contextResetCount: 0,
    };
  }

  const { final, abandoned } = detectAbandoned(entries);
  const allFiles = extractFilesModified(entries);
  const newDependencies = detectNewDependencies(entries);
  const uncertainties = detectUncertainties(entries);
  const contextResetCount = countContextResets(entries);

  return {
    approaches: final,
    abandoned,
    uncertainties,
    reviewItems: allFiles,
    newDependencies,
    contextResetCount,
  };
}
