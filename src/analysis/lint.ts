/**
 * Session lint — runs 7 behavioral quality rules against a session's entries.
 *
 * Each rule inspects the entries array and emits `LintFinding` objects when
 * a threshold or pattern is breached. All functions are pure.
 */

import type {
  JsonlEntry,
  LintConfig,
  LintFinding,
  LintSeverity,
  LintRuleId,
} from "../types/index.js";
import {
  extractToolCalls,
  extractFilesModified,
  extractTextContent,
  sumCost,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: LintConfig = {
  toolLoopThreshold: 3,
  reasoningSpiralThreshold: 4,
  budgetThreshold: 5.0,
  contextSaturationOutputTokens: 50_000,
  contextSaturationMinCost: 2.0,
  redundantReadThreshold: 3,
  errorRetryThreshold: 2,
  noOutputToolThreshold: 5,
};

function mergeConfig(partial?: Partial<LintConfig>): LintConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}

// ---------------------------------------------------------------------------
// Helper: is assistant entry with no tool calls?
// ---------------------------------------------------------------------------

function isAssistantWithoutTools(entry: JsonlEntry): boolean {
  if (entry.type !== "assistant") return false;
  const content = entry.message?.content;
  if (typeof content === "string") return true;
  if (!Array.isArray(content)) return true;
  return !content.some(
    (block) =>
      typeof block === "object" &&
      block !== null &&
      (block as Record<string, unknown>).type === "tool_use",
  );
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/** R1: Tool loop — same tool + same primary arg consecutively ≥ threshold. */
function checkToolLoop(
  entries: JsonlEntry[],
  config: LintConfig,
): LintFinding[] {
  const calls = extractToolCalls(entries);
  if (calls.length < config.toolLoopThreshold) return [];

  const findings: LintFinding[] = [];

  // Group consecutive same-tool-same-path sequences
  let runStart = 0;
  for (let i = 1; i <= calls.length; i++) {
    const inRun =
      i < calls.length &&
      calls[i].toolName === calls[runStart].toolName &&
      (calls[i].input.file_path ?? calls[i].input.filePath) ===
        (calls[runStart].input.file_path ?? calls[runStart].input.filePath);

    if (!inRun) {
      const runLen = i - runStart;
      if (runLen >= config.toolLoopThreshold) {
        findings.push({
          ruleId: "tool-loop",
          severity: "warning",
          message: `${calls[runStart].toolName} called ${runLen} times consecutively with same arguments`,
          entries: calls.slice(runStart, i).map((c) => c.entryIndex),
        });
      }
      runStart = i;
    }
  }

  return findings;
}

/** R2: Reasoning spiral — consecutive assistant entries without tool calls. */
function checkReasoningSpiral(
  entries: JsonlEntry[],
  config: LintConfig,
): LintFinding[] {
  const findings: LintFinding[] = [];
  let runStart = -1;
  let runLen = 0;

  for (let i = 0; i < entries.length; i++) {
    if (isAssistantWithoutTools(entries[i])) {
      if (runStart === -1) runStart = i;
      runLen++;
    } else {
      if (runLen >= config.reasoningSpiralThreshold) {
        findings.push({
          ruleId: "reasoning-spiral",
          severity: "warning",
          message: `${runLen} consecutive assistant turns without tool calls`,
          entries: Array.from({ length: runLen }, (_, k) => runStart + k),
        });
      }
      runStart = -1;
      runLen = 0;
    }
  }

  // Check final run
  if (runLen >= config.reasoningSpiralThreshold) {
    findings.push({
      ruleId: "reasoning-spiral",
      severity: "warning",
      message: `${runLen} consecutive assistant turns without tool calls`,
      entries: Array.from({ length: runLen }, (_, k) => runStart + k),
    });
  }

  return findings;
}

/** R3: Budget proximity — total cost exceeds 90% of threshold. */
function checkBudgetProximity(
  entries: JsonlEntry[],
  config: LintConfig,
): LintFinding[] {
  const totalCost = sumCost(entries);
  const threshold = config.budgetThreshold * 0.9;
  if (totalCost >= threshold) {
    return [
      {
        ruleId: "budget-proximity",
        severity: "warning",
        message: `Session cost $${totalCost.toFixed(2)} is within 10% of budget $${config.budgetThreshold.toFixed(2)}`,
        entries: [],
      },
    ];
  }
  return [];
}

/** R4: Context saturation — high tokens, high cost, no file edits. */
function checkContextSaturation(
  entries: JsonlEntry[],
  config: LintConfig,
): LintFinding[] {
  const files = extractFilesModified(entries);
  if (files.length > 0) return [];

  const totalCost = sumCost(entries);
  if (totalCost < config.contextSaturationMinCost) return [];

  // Estimate output tokens from message content
  let outputTokens = 0;
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    const text = extractTextContent(entry);
    // Rough estimate: ~4 chars per token
    outputTokens += Math.ceil(text.length / 4);
  }

  if (outputTokens > config.contextSaturationOutputTokens) {
    return [
      {
        ruleId: "context-saturation",
        severity: "warning",
        message: `High output (~${outputTokens} tokens) and cost ($${totalCost.toFixed(2)}) with no file modifications`,
        entries: [],
      },
    ];
  }
  return [];
}

/** R5: Redundant read — same file read ≥ threshold times with no intervening write. */
function checkRedundantRead(
  entries: JsonlEntry[],
  config: LintConfig,
): LintFinding[] {
  const calls = extractToolCalls(entries);
  const readCounts = new Map<string, { count: number; indices: number[] }>();
  const writtenFiles = new Set<string>();

  // Track files that have been written
  for (const call of calls) {
    if (["Edit", "Write", "MultiEdit"].includes(call.toolName)) {
      const path =
        (call.input.file_path as string | undefined) ??
        (call.input.filePath as string | undefined);
      if (path) writtenFiles.add(path);
    }
  }

  // Count reads of files that were never written
  for (const call of calls) {
    if (call.toolName !== "Read") continue;
    const path =
      (call.input.file_path as string | undefined) ??
      (call.input.filePath as string | undefined);
    if (!path || writtenFiles.has(path)) continue;

    const existing = readCounts.get(path);
    if (existing) {
      existing.count++;
      existing.indices.push(call.entryIndex);
    } else {
      readCounts.set(path, { count: 1, indices: [call.entryIndex] });
    }
  }

  const findings: LintFinding[] = [];
  for (const [path, data] of readCounts) {
    if (data.count >= config.redundantReadThreshold) {
      findings.push({
        ruleId: "redundant-read",
        severity: "warning",
        message: `${path} read ${data.count} times without modification`,
        entries: data.indices,
      });
    }
  }
  return findings;
}

/** R6: Error retry loop — same tool+path error followed by retries. */
function checkErrorRetryLoop(
  entries: JsonlEntry[],
  config: LintConfig,
): LintFinding[] {
  const calls = extractToolCalls(entries);
  const findings: LintFinding[] = [];

  // Track errors per (tool, path) pair
  const errorOps = new Map<string, { count: number; indices: number[] }>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "user") continue;

    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;

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
        // Find the preceding tool call to identify the operation
        const prevCall = [...calls]
          .reverse()
          .find((c) => c.entryIndex < i);
        if (prevCall) {
          const path =
            (prevCall.input.file_path as string | undefined) ??
            (prevCall.input.filePath as string | undefined) ??
            "";
          const key = `${prevCall.toolName}:${path}`;
          const existing = errorOps.get(key);
          if (existing) {
            existing.count++;
            existing.indices.push(i);
          } else {
            errorOps.set(key, { count: 1, indices: [i] });
          }
        }
      }
    }
  }

  for (const [, data] of errorOps) {
    if (data.count >= config.errorRetryThreshold) {
      findings.push({
        ruleId: "error-retry-loop",
        severity: "error",
        message: `Tool operation failed ${data.count} times in a retry loop`,
        entries: data.indices,
      });
    }
  }

  return findings;
}

/** R7: No output — many tool calls but zero file modifications. */
function checkNoOutput(
  entries: JsonlEntry[],
  config: LintConfig,
): LintFinding[] {
  const calls = extractToolCalls(entries);
  if (calls.length < config.noOutputToolThreshold) return [];

  const files = extractFilesModified(entries);
  if (files.length === 0) {
    return [
      {
        ruleId: "no-output",
        severity: "info",
        message: `${calls.length} tool calls with no file modifications`,
        entries: calls.map((c) => c.entryIndex),
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Run all 7 lint rules against a session's entries.
 * Returns an array of findings (empty if session is clean).
 */
export function lintSession(
  entries: JsonlEntry[],
  config?: Partial<LintConfig>,
): LintFinding[] {
  const cfg = mergeConfig(config);

  return [
    ...checkToolLoop(entries, cfg),
    ...checkReasoningSpiral(entries, cfg),
    ...checkBudgetProximity(entries, cfg),
    ...checkContextSaturation(entries, cfg),
    ...checkRedundantRead(entries, cfg),
    ...checkErrorRetryLoop(entries, cfg),
    ...checkNoOutput(entries, cfg),
  ];
}
