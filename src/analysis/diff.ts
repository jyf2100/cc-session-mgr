/**
 * Session diff — compares two sessions via phase alignment.
 *
 * Uses LCS on phase names to align phases, then computes metric deltas
 * and identifies divergence points.
 */

import type {
  JsonlEntry,
  Phase,
  PhaseAlignment,
  PhaseAlignmentStatus,
  MetricDelta,
  DivergencePoint,
  SessionDiff,
} from "../types/index.js";
import { detectPhases } from "./phase.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cost ratio threshold for cost_spike divergence. */
const COST_SPIKE_RATIO = 2;

/** Error count delta threshold for divergence. */
const ERROR_DELTA_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// LCS phase alignment
// ---------------------------------------------------------------------------

/**
 * Align phases using longest common subsequence on phase names.
 * Phase names are compared case-insensitively after trimming.
 */
function alignPhases(phasesA: Phase[], phasesB: Phase[]): PhaseAlignment[] {
  const m = phasesA.length;
  const n = phasesB.length;

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (phasesMatch(phasesA[i - 1], phasesB[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find alignment
  const alignments: PhaseAlignment[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      phasesMatch(phasesA[i - 1], phasesB[j - 1])
    ) {
      alignments.push({
        phaseA: phasesA[i - 1],
        phaseB: phasesB[j - 1],
        status: "matched",
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      alignments.push({
        phaseA: null,
        phaseB: phasesB[j - 1],
        status: "inserted",
      });
      j--;
    } else {
      alignments.push({
        phaseA: phasesA[i - 1],
        phaseB: null,
        status: "deleted",
      });
      i--;
    }
  }

  return alignments.reverse();
}

/**
 * Check if two phases match by name similarity.
 */
function phasesMatch(a: Phase, b: Phase): boolean {
  const nameA = normalizePhaseName(a.name);
  const nameB = normalizePhaseName(b.name);
  return nameA === nameB;
}

function normalizePhaseName(name: string): string {
  return name.toLowerCase().trim().slice(0, 50);
}

// ---------------------------------------------------------------------------
// Metric deltas
// ---------------------------------------------------------------------------

function computeMetricDeltas(
  alignments: PhaseAlignment[],
): MetricDelta[] {
  const deltas: MetricDelta[] = [];

  for (const alignment of alignments) {
    if (alignment.status !== "matched") continue;
    if (!alignment.phaseA || !alignment.phaseB) continue;

    const a = alignment.phaseA;
    const b = alignment.phaseB;

    deltas.push({
      phaseName: a.name,
      costDelta: b.costUSD - a.costUSD,
      toolCallCountDelta: b.toolCalls.length - a.toolCalls.length,
      errorCountDelta: b.errorCount - a.errorCount,
      durationDeltaMs: b.durationMs - a.durationMs,
    });
  }

  return deltas;
}

// ---------------------------------------------------------------------------
// Divergence detection
// ---------------------------------------------------------------------------

function detectDivergences(
  alignments: PhaseAlignment[],
): DivergencePoint[] {
  const points: DivergencePoint[] = [];

  for (const alignment of alignments) {
    if (alignment.status !== "matched") continue;
    if (!alignment.phaseA || !alignment.phaseB) continue;

    const a = alignment.phaseA;
    const b = alignment.phaseB;
    const name = a.name;

    // Cost spike: > 2x difference and non-trivial cost
    const minCost = Math.min(a.costUSD, b.costUSD);
    const maxCost = Math.max(a.costUSD, b.costUSD);
    if (minCost > 0 && maxCost / minCost > COST_SPIKE_RATIO) {
      points.push({
        phaseName: name,
        reason: "cost_spike",
        description: `Cost: $${a.costUSD.toFixed(2)} → $${b.costUSD.toFixed(2)} (${(maxCost / minCost).toFixed(1)}x difference)`,
      });
    }

    // Error count delta > threshold
    if (Math.abs(b.errorCount - a.errorCount) > ERROR_DELTA_THRESHOLD) {
      points.push({
        phaseName: name,
        reason: "cost_spike",
        description: `Errors: ${a.errorCount} → ${b.errorCount}`,
      });
    }

    // Tool divergence: different tool sets used
    const toolsA = getToolSet(a);
    const toolsB = getToolSet(b);
    if (!setsEqual(toolsA, toolsB) && toolsA.size > 0 && toolsB.size > 0) {
      points.push({
        phaseName: name,
        reason: "tool_divergence",
        description: `Tools: ${[...toolsA].join(", ")} → ${[...toolsB].join(", ")}`,
      });
    }
  }

  return points;
}

function getToolSet(phase: Phase): Set<string> {
  const tools = new Set<string>();
  for (const call of phase.toolCalls) {
    tools.add(call.toolName);
  }
  return tools;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Compare two sessions via phase alignment, metric deltas, and divergence points.
 */
export function diffSessions(
  a: JsonlEntry[],
  b: JsonlEntry[],
): SessionDiff {
  const phasesA = detectPhases(a);
  const phasesB = detectPhases(b);

  // Handle empty sessions
  if (phasesA.length === 0 && phasesB.length === 0) {
    return { phaseAlignment: [], metricDeltas: [], divergencePoints: [] };
  }

  if (phasesA.length === 0) {
    return {
      phaseAlignment: phasesB.map((p) => ({
        phaseA: null,
        phaseB: p,
        status: "inserted" as PhaseAlignmentStatus,
      })),
      metricDeltas: [],
      divergencePoints: [],
    };
  }

  if (phasesB.length === 0) {
    return {
      phaseAlignment: phasesA.map((p) => ({
        phaseA: p,
        phaseB: null,
        status: "deleted" as PhaseAlignmentStatus,
      })),
      metricDeltas: [],
      divergencePoints: [],
    };
  }

  const phaseAlignment = alignPhases(phasesA, phasesB);
  const metricDeltas = computeMetricDeltas(phaseAlignment);
  const divergencePoints = detectDivergences(phaseAlignment);

  return { phaseAlignment, metricDeltas, divergencePoints };
}
