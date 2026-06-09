import type { SessionSummary, DateGroup } from "../types/index.js";

/**
 * Group sessions by calendar date (using session start timestamp)
 * and compute per-day statistics.
 */
export function aggregateByDate(
  summaries: SessionSummary[],
  dateRange?: { start?: string; end?: string },
): DateGroup[] {
  const filtered = filterByDateRange(summaries, dateRange);
  const groups = new Map<string, SessionSummary[]>();

  for (const s of filtered) {
    const date = toDateString(s.startTime);
    if (!date) continue;

    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(s);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => buildDateGroup(date, sessions));
}

function filterByDateRange(
  summaries: SessionSummary[],
  range?: { start?: string; end?: string },
): SessionSummary[] {
  if (!range) return summaries;

  return summaries.filter((s) => {
    if (!s.startTime) return false;
    const date = toDateString(s.startTime)!;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  });
}

function buildDateGroup(date: string, sessions: SessionSummary[]): DateGroup {
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

  return {
    date,
    sessions,
    totalMessages,
    totalCost: Math.round(totalCost * 100) / 100,
    totalInputTokens,
    totalOutputTokens,
    models,
    activeSpan: computeActiveSpan(sessions),
  };
}

function computeActiveSpan(sessions: SessionSummary[]): string | null {
  const times: number[] = [];
  for (const s of sessions) {
    if (s.startTime) times.push(new Date(s.startTime).getTime());
    if (s.endTime) times.push(new Date(s.endTime).getTime());
  }
  if (times.length < 2) return null;

  times.sort((a, b) => a - b);
  const earliest = new Date(times[0]);
  const latest = new Date(times[times.length - 1]);

  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return `${fmt(earliest)} - ${fmt(latest)}`;
}

function toDateString(ts: string | null): string | null {
  if (!ts) return null;
  return ts.slice(0, 10); // "YYYY-MM-DD"
}
