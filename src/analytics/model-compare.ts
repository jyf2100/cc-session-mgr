/**
 * Model comparison — group sessions by models[0], compute cost & token metrics.
 *
 * Pure function: takes sessions, returns ModelComparison[] sorted by totalCost desc.
 */

import type { SessionWorkSummary, ModelComparison } from "../types/index.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare models by grouping sessions on their primary model (models[0]).
 * Multi-model sessions are attributed to models[0] and counted in multiModelSessionCount.
 */
export function compareModels(
  sessions: SessionWorkSummary[],
): ModelComparison[] {
  if (sessions.length === 0) return [];

  // Group by models[0]
  const buckets = new Map<
    string,
    {
      sessions: SessionWorkSummary[];
      multiModelCount: number;
    }
  >();

  for (const session of sessions) {
    const model = session.models[0] ?? "unknown";
    const existing = buckets.get(model);
    if (existing) {
      existing.sessions.push(session);
      if (session.models.length > 1) {
        existing.multiModelCount++;
      }
    } else {
      buckets.set(model, {
        sessions: [session],
        multiModelCount: session.models.length > 1 ? 1 : 0,
      });
    }
  }

  // Compute metrics per model
  const results: ModelComparison[] = [];

  for (const [model, { sessions: modelSessions, multiModelCount }] of buckets) {
    const totalCost = modelSessions.reduce(
      (sum, s) => sum + s.cost.totalUSD,
      0,
    );
    const sessionCount = modelSessions.length;
    const totalInputTokens = modelSessions.reduce(
      (sum, s) => sum + s.cost.inputTokens,
      0,
    );
    const totalOutputTokens = modelSessions.reduce(
      (sum, s) => sum + s.cost.outputTokens,
      0,
    );
    const totalEdits = modelSessions.reduce(
      (sum, s) => sum + s.fileEdits.reduce((eSum, e) => eSum + e.editCount, 0),
      0,
    );
    const totalMessages = modelSessions.reduce(
      (sum, s) => sum + s.messageCounts.user + s.messageCounts.assistant,
      0,
    );

    // Duration — only from sessions with both startTime and endTime
    const durations = modelSessions
      .map((s) => {
        if (!s.startTime || !s.endTime) return null;
        const ms =
          new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
        return ms > 0 ? ms / 60_000 : null; // minutes
      })
      .filter((d): d is number => d !== null);

    const avgDurationMinutes =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;

    results.push({
      model,
      sessionCount,
      totalCost,
      avgCostPerSession: sessionCount > 0 ? totalCost / sessionCount : 0,
      avgCostPerEdit: totalEdits > 0 ? totalCost / totalEdits : 0,
      totalInputTokens,
      totalOutputTokens,
      outputInputRatio:
        totalInputTokens > 0 ? totalOutputTokens / totalInputTokens : 0,
      avgMessagesPerSession:
        sessionCount > 0 ? totalMessages / sessionCount : 0,
      avgDurationMinutes,
      multiModelSessionCount: multiModelCount,
    });
  }

  // Sort by totalCost descending
  results.sort((a, b) => b.totalCost - a.totalCost);

  return results;
}
