/**
 * Cost data audit — statistics on cost source quality and trust level.
 *
 * Pure function: takes sessions, returns CostAuditReport.
 */

import type { SessionSummary, CostAuditReport } from "../types/index.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit cost data quality across sessions.
 * Computes source distribution, incomplete/estimated rates, and overall trust level.
 */
export function auditCostData(sessions: SessionSummary[]): CostAuditReport {
  const totalSessions = sessions.length;

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      sourceDistribution: { inline: 0, metrics: 0, merged: 0 },
      incompleteCount: 0,
      incompleteRate: 0,
      isEstimatedCount: 0,
      isEstimatedRate: 0,
      trustLevel: "low",
    };
  }

  // Source distribution
  let inline = 0;
  let metrics = 0;
  let merged = 0;

  for (const session of sessions) {
    const src = session.cost.source;
    if (src === "inline") inline++;
    else if (src === "metrics") metrics++;
    else if (src === "merged") merged++;
  }

  // Incomplete & estimated counts
  const incompleteCount = sessions.filter((s) => s.cost.incomplete).length;
  const isEstimatedCount = sessions.filter((s) => s.cost.isEstimated).length;

  const incompleteRate = incompleteCount / totalSessions;
  const isEstimatedRate = isEstimatedCount / totalSessions;

  // Trust level assessment
  const mergedRatio = merged / totalSessions;
  let trustLevel: CostAuditReport["trustLevel"];

  if (incompleteRate < 0.1 && isEstimatedRate < 0.2 && mergedRatio > 0.5) {
    trustLevel = "high";
  } else if (incompleteRate < 0.3 && isEstimatedRate < 0.5) {
    trustLevel = "medium";
  } else {
    trustLevel = "low";
  }

  return {
    totalSessions,
    sourceDistribution: { inline, metrics, merged },
    incompleteCount,
    incompleteRate,
    isEstimatedCount,
    isEstimatedRate,
    trustLevel,
  };
}
