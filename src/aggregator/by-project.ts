import type { SessionSummary, ProjectGroup, FileEditEntry } from "../types/index.js";

/**
 * Group sessions by decoded project path and compute per-project statistics.
 * Results are sorted by total session count (descending).
 */
export function aggregateByProject(
  summaries: SessionSummary[],
  projectFilter?: string,
): ProjectGroup[] {
  const filtered = projectFilter
    ? summaries.filter((s) =>
        s.projectPath.toLowerCase().includes(projectFilter.toLowerCase()),
      )
    : summaries;

  const groups = new Map<string, SessionSummary[]>();

  for (const s of filtered) {
    if (!groups.has(s.projectPath)) {
      groups.set(s.projectPath, []);
    }
    groups.get(s.projectPath)!.push(s);
  }

  return [...groups.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([projectPath, sessions]) => buildProjectGroup(projectPath, sessions));
}

function buildProjectGroup(
  projectPath: string,
  sessions: SessionSummary[],
): ProjectGroup {
  const totalMessages = sessions.reduce(
    (sum, s) => sum + s.messageCounts.user + s.messageCounts.assistant,
    0,
  );
  const totalCost = sessions.reduce((sum, s) => sum + s.cost.totalUSD, 0);
  const totalInputTokens = sessions.reduce((sum, s) => sum + s.cost.inputTokens, 0);
  const totalOutputTokens = sessions.reduce((sum, s) => sum + s.cost.outputTokens, 0);

  const models: Record<string, number> = {};
  for (const s of sessions) {
    for (const model of s.models) {
      models[model] = (models[model] ?? 0) + 1;
    }
  }

  // Merge file edits across all sessions and take top 10
  const allEdits = new Map<string, number>();
  for (const s of sessions) {
    for (const edit of s.fileEdits) {
      allEdits.set(edit.filePath, (allEdits.get(edit.filePath) ?? 0) + edit.editCount);
    }
  }
  const topFiles: FileEditEntry[] = [...allEdits.entries()]
    .map(([filePath, editCount]) => ({ filePath, editCount }))
    .sort((a, b) => b.editCount - a.editCount)
    .slice(0, 10);

  // Date range
  const timestamps = sessions
    .flatMap((s) => [s.startTime, s.endTime])
    .filter((t): t is string => t !== null)
    .sort();

  return {
    projectPath,
    sessions,
    totalMessages,
    totalCost: Math.round(totalCost * 100) / 100,
    totalInputTokens,
    totalOutputTokens,
    models,
    topFiles,
    dateRange: {
      start: timestamps[0] ?? null,
      end: timestamps[timestamps.length - 1] ?? null,
    },
  };
}
