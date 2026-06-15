/**
 * Cost anomaly detection — Z-score based "cost explosion day" detection.
 *
 * Pure function: takes DateGroup array, returns CostAnomalyResult.
 * Excludes zero-cost days from statistics, requires ≥7 data points.
 */

import type { DateGroup, CostAnomaly, CostAnomalyResult } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

function attributeAnomaly(day: DateGroup): CostAnomaly["attribution"] {
  const sessions = day.sessions;

  // Check model switch
  const switchedSessions = sessions.filter((s) => s.models.length > 1);
  if (switchedSessions.length > 0) {
    const models = [...new Set(switchedSessions.flatMap((s) => s.models))];
    return {
      type: "model_switch",
      detail: `Models used: ${models.join(", ")}`,
      sessionIds: switchedSessions.map((s) => s.sessionId),
    };
  }

  // Check token spike
  const outputTokens = sessions.map((s) => s.cost.outputTokens);
  const outputMedian = median(outputTokens);
  const spikeSessions = sessions.filter(
    (s) => s.cost.outputTokens > outputMedian * 3 && outputMedian > 0,
  );
  if (spikeSessions.length > 0) {
    return {
      type: "token_spike",
      detail: `${spikeSessions.length} session(s) with output tokens >3× median (${outputMedian})`,
      sessionIds: spikeSessions.map((s) => s.sessionId),
    };
  }

  // Check long session
  const durations = sessions
    .filter((s) => s.startTime && s.endTime)
    .map((s) => {
      const start = new Date(s.startTime!).getTime();
      const end = new Date(s.endTime!).getTime();
      return (end - start) / (1000 * 60); // minutes
    });
  const durationMedian = median(durations);
  const longSessions = sessions.filter((s) => {
    if (!s.startTime || !s.endTime) return false;
    const dur = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / (1000 * 60);
    return dur > durationMedian * 3 && durationMedian > 0;
  });
  if (longSessions.length > 0) {
    return {
      type: "long_session",
      detail: `${longSessions.length} session(s) longer than 3× median duration (${durationMedian.toFixed(0)} min)`,
      sessionIds: longSessions.map((s) => s.sessionId),
    };
  }

  return {
    type: "unknown",
    detail: "No clear attribution found",
    sessionIds: [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect cost anomalies using Z-score analysis.
 * Requires ≥7 data points (after excluding zero-cost days).
 */
export function detectCostAnomalies(days: DateGroup[]): CostAnomalyResult {
  // Filter out zero-cost days for statistics
  const activeDays = days.filter((d) => d.totalCost > 0);

  if (activeDays.length < 7) {
    return {
      anomalies: [],
      insufficientData: true,
      meanCost: 0,
      stddevCost: 0,
      dataPointCount: activeDays.length,
    };
  }

  const costs = activeDays.map((d) => d.totalCost);
  const avg = mean(costs);
  const sd = stddev(costs, avg);

  // Avoid division by zero if all costs are identical (use tolerance for FP)
  if (sd < 1e-10) {
    return {
      anomalies: [],
      insufficientData: false,
      meanCost: avg,
      stddevCost: 0,
      dataPointCount: activeDays.length,
    };
  }

  const threshold = avg + 2 * sd;

  const anomalies: CostAnomaly[] = activeDays
    .filter((d) => d.totalCost > threshold)
    .map((d) => {
      const z = (d.totalCost - avg) / sd;
      return {
        date: d.date,
        cost: d.totalCost,
        expectedCost: avg,
        zScore: z,
        attribution: attributeAnomaly(d),
      };
    });

  return {
    anomalies,
    insufficientData: false,
    meanCost: avg,
    stddevCost: sd,
    dataPointCount: activeDays.length,
  };
}
