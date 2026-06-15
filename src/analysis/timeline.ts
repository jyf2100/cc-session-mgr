/**
 * Session timeline — builds a chronological event stream from entries.
 *
 * Produces `TimelineResult` with per-entry events, phase groupings,
 * and a summary including wasted spend estimate.
 */

import type {
  JsonlEntry,
  TimelineEntry,
  TimelineEventType,
  TimelinePhase,
  TimelineResult,
  TimelineSummary,
} from "../types/index.js";
import {
  extractTextContent,
  extractToolCalls,
  sumCost,
  parseTimestamp,
} from "./helpers.js";
import { lintSession } from "./lint.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUMMARY_MAX_LENGTH = 60;

// ---------------------------------------------------------------------------
// Entry classification
// ---------------------------------------------------------------------------

/**
 * Classify a single entry into a timeline event type and summary.
 */
function classifyEntry(
  entry: JsonlEntry,
): { eventType: TimelineEventType; summary: string } {
  if (entry.type === "compact_boundary") {
    return { eventType: "compact", summary: "Context compaction" };
  }

  if (entry.type === "system") {
    return { eventType: "system_event", summary: "System message" };
  }

  if (entry.type === "user") {
    // Check if this is a tool_result
    const content = entry.message?.content;
    if (Array.isArray(content)) {
      const hasToolResult = content.some(
        (block) =>
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "tool_result",
      );
      if (hasToolResult) {
        const firstResult = content.find(
          (block) =>
            typeof block === "object" &&
            block !== null &&
            (block as Record<string, unknown>).type === "tool_result",
        ) as Record<string, unknown> | undefined;
        const isError = firstResult?.is_error === true;
        const resultText =
          typeof firstResult?.content === "string"
            ? (firstResult.content as string).slice(0, 40)
            : "tool result";
        return {
          eventType: "tool_result",
          summary: isError ? `Error: ${resultText}` : resultText,
        };
      }
    }

    // Regular user prompt
    const text = extractTextContent(entry).trim();
    return {
      eventType: "user_prompt",
      summary: text.slice(0, SUMMARY_MAX_LENGTH),
    };
  }

  if (entry.type === "assistant") {
    // Check if this entry contains tool calls
    const calls = extractToolCalls([entry]);
    if (calls.length > 0) {
      const toolSummary = calls
        .map((c) => {
          const path =
            (c.input.file_path as string | undefined) ??
            (c.input.filePath as string | undefined) ??
            (c.input.command as string | undefined) ??
            "";
          return path ? `${c.toolName} ${path}` : c.toolName;
        })
        .join("; ");
      return {
        eventType: "tool_call",
        summary: toolSummary.slice(0, SUMMARY_MAX_LENGTH),
      };
    }

    // Plain assistant response
    const text = extractTextContent(entry).trim();
    return {
      eventType: "assistant_response",
      summary: text.slice(0, SUMMARY_MAX_LENGTH),
    };
  }

  return { eventType: "system_event", summary: entry.type };
}

// ---------------------------------------------------------------------------
// Phase grouping
// ---------------------------------------------------------------------------

function buildPhases(
  entries: JsonlEntry[],
  timelineEntries: TimelineEntry[],
): TimelinePhase[] {
  if (timelineEntries.length === 0) return [];

  // Split at user_prompt boundaries
  const boundaries: number[] = [];
  for (let i = 0; i < timelineEntries.length; i++) {
    if (timelineEntries[i].eventType === "user_prompt") {
      boundaries.push(i);
    }
  }

  if (boundaries.length === 0) {
    return [
      buildSinglePhase("session", 0, timelineEntries.length - 1, timelineEntries),
    ];
  }

  const phases: TimelinePhase[] = [];
  for (let p = 0; p < boundaries.length; p++) {
    const startIdx = boundaries[p];
    const endIdx =
      p + 1 < boundaries.length ? boundaries[p + 1] - 1 : timelineEntries.length - 1;

    const name = timelineEntries[startIdx].summary || `Phase ${p + 1}`;
    phases.push(buildSinglePhase(name, startIdx, endIdx, timelineEntries));
  }

  return phases;
}

function buildSinglePhase(
  name: string,
  startIdx: number,
  endIdx: number,
  timelineEntries: TimelineEntry[],
): TimelinePhase {
  const phaseEntries = timelineEntries.slice(startIdx, endIdx + 1);
  const costUSD = phaseEntries.reduce((sum, e) => sum + e.costUSD, 0);
  const toolCallCount = phaseEntries.filter(
    (e) => e.eventType === "tool_call",
  ).length;
  const errorCount = phaseEntries.filter(
    (e) => e.eventType === "tool_result" && e.summary.startsWith("Error"),
  ).length;

  const firstTs = phaseEntries[0]?.timestamp ?? "";
  const lastTs = phaseEntries[phaseEntries.length - 1]?.timestamp ?? "";
  const startMs = parseTimestamp(firstTs);
  const endMs = parseTimestamp(lastTs);
  const durationMs = !isNaN(startMs) && !isNaN(endMs) ? endMs - startMs : 0;

  return {
    name,
    startIndex: startIdx,
    endIndex: endIdx,
    durationMs,
    costUSD,
    toolCallCount,
    errorCount,
  };
}

// ---------------------------------------------------------------------------
// Wasted spend estimation
// ---------------------------------------------------------------------------

function estimateWastedSpend(entries: JsonlEntry[]): number {
  const findings = lintSession(entries);
  const wasteRules = new Set(["tool-loop", "error-retry-loop"]);
  const wasteEntries = new Set<number>();

  for (const finding of findings) {
    if (wasteRules.has(finding.ruleId)) {
      for (const idx of finding.entries) {
        wasteEntries.add(idx);
      }
    }
  }

  let wastedCost = 0;
  for (const idx of wasteEntries) {
    if (idx < entries.length) {
      wastedCost += entries[idx].costUSD ?? 0;
    }
  }
  return wastedCost;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Build a timeline from session entries.
 */
export function buildTimeline(entries: JsonlEntry[]): TimelineResult {
  if (entries.length === 0) {
    return {
      entries: [],
      phases: [],
      summary: {
        totalDurationMs: 0,
        totalCost: 0,
        totalToolCalls: 0,
        wastedSpendUSD: 0,
      },
    };
  }

  // Build timeline entries
  const timelineEntries: TimelineEntry[] = entries.map((entry, i) => {
    const { eventType, summary } = classifyEntry(entry);
    return {
      index: i,
      timestamp: entry.timestamp ?? "",
      eventType,
      summary,
      costUSD: entry.costUSD ?? 0,
    };
  });

  // Build phases
  const phases = buildPhases(entries, timelineEntries);

  // Summary
  const totalCost = sumCost(entries);
  const totalToolCalls = extractToolCalls(entries).length;
  const wastedSpendUSD = estimateWastedSpend(entries);

  const firstTs = entries[0]?.timestamp;
  const lastTs = entries[entries.length - 1]?.timestamp;
  const startMs = parseTimestamp(firstTs);
  const endMs = parseTimestamp(lastTs);
  const totalDurationMs =
    !isNaN(startMs) && !isNaN(endMs) ? endMs - startMs : 0;

  return {
    entries: timelineEntries,
    phases,
    summary: {
      totalDurationMs,
      totalCost,
      totalToolCalls,
      wastedSpendUSD,
    },
  };
}
