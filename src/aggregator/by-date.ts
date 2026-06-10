import type { SessionSummary, DateGroup, DayIndexedSession } from "../types/index.js";
import { formatTime } from "../cli/tz-utils.js";

/**
 * Group day-indexed sessions by calendar date using per-day slices,
 * and compute per-day statistics.
 *
 * A session appears in every date where it has a non-empty DaySlice.
 */
export function aggregateByDate(
  indexed: DayIndexedSession[],
  dateRange?: { start?: string; end?: string },
): DateGroup[] {
  const groups = new Map<string, SessionSummary[]>();
  const sliceData = new Map<string, { messages: number; cost: number; inputTokens: number; outputTokens: number; models: Record<string, number> }[]>();

  for (const { summary, daySlices } of indexed) {
    for (const slice of daySlices) {
      if (dateRange) {
        if (dateRange.start && slice.date < dateRange.start) continue;
        if (dateRange.end && slice.date > dateRange.end) continue;
      }

      if (!groups.has(slice.date)) {
        groups.set(slice.date, []);
        sliceData.set(slice.date, []);
      }
      groups.get(slice.date)!.push(summary);

      const models: Record<string, number> = {};
      for (const model of slice.models) {
        models[model] = (models[model] ?? 0) + 1;
      }

      sliceData.get(slice.date)!.push({
        messages: slice.messageCounts.user + slice.messageCounts.assistant,
        cost: slice.cost,
        inputTokens: slice.inputTokens,
        outputTokens: slice.outputTokens,
        models,
      });
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => {
      const dataPoints = sliceData.get(date) ?? [];
      const totalMessages = dataPoints.reduce((sum, d) => sum + d.messages, 0);
      const totalCost = dataPoints.reduce((sum, d) => sum + d.cost, 0);
      const totalInputTokens = dataPoints.reduce((sum, d) => sum + d.inputTokens, 0);
      const totalOutputTokens = dataPoints.reduce((sum, d) => sum + d.outputTokens, 0);
      const models: Record<string, number> = {};
      for (const d of dataPoints) {
        for (const [model, count] of Object.entries(d.models)) {
          models[model] = (models[model] ?? 0) + count;
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
    });
}

function computeActiveSpan(sessions: SessionSummary[]): string | null {
  const times: { ts: string }[] = [];
  for (const s of sessions) {
    if (s.startTime) times.push({ ts: s.startTime });
    if (s.endTime) times.push({ ts: s.endTime });
  }
  if (times.length < 2) return null;

  const sorted = times
    .map((t) => ({ ts: t.ts, ms: new Date(t.ts).getTime() }))
    .sort((a, b) => a.ms - b.ms);

  return `${formatTime(sorted[0].ts)} - ${formatTime(sorted[sorted.length - 1].ts)}`;
}
