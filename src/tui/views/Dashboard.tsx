import React from "react";
import { Box, Text } from "ink";
import { useTuiStore } from "../store.js";
import { aggregateWorkByDate } from "../../aggregator/work-by-date.js";
import { formatCost, formatTokenCount } from "../../report/format.js";

/**
 * Dashboard view: today's overview + recent activity.
 */
export function Dashboard(): React.ReactElement {
  const indexed = useTuiStore((s) => s.indexed);

  // Aggregate all days
  const allDays = aggregateWorkByDate(indexed);
  const today = allDays.length > 0 ? allDays[allDays.length - 1] : null;
  const recentDays = allDays.slice(-7);

  if (allDays.length === 0) {
    return React.createElement(
      Box,
      { padding: 1 },
      React.createElement(
        Text,
        { dimColor: true },
        "No session data found. Run some Claude Code sessions first!",
      ),
    );
  }

  // Compute totals
  const totalCost = indexed.reduce(
    (sum, s) => sum + s.summary.cost.totalUSD,
    0,
  );
  const totalInputTokens = indexed.reduce(
    (sum, s) => sum + s.summary.cost.inputTokens,
    0,
  );
  const totalOutputTokens = indexed.reduce(
    (sum, s) => sum + s.summary.cost.outputTokens,
    0,
  );
  const totalMessages = indexed.reduce(
    (sum, s) =>
      sum + s.summary.messageCounts.user + s.summary.messageCounts.assistant,
    0,
  );
  const modelCounts: Record<string, number> = {};
  for (const s of indexed) {
    for (const m of s.summary.models) {
      modelCounts[m] = (modelCounts[m] || 0) + 1;
    }
  }
  const topModels = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Today stats
  const todayCost = today
    ? today.projects.reduce(
        (s, p) =>
          s + p.sessions.reduce((ss, ses) => ss + ses.cost.totalUSD, 0),
        0,
      )
    : 0;
  const todayMessages = today
    ? today.projects.reduce(
        (s, p) =>
          s +
          p.sessions.reduce(
            (ss, ses) =>
              ss +
              ses.messageCounts.user +
              ses.messageCounts.assistant,
            0,
          ),
        0,
      )
    : 0;

  return React.createElement(
    Box,
    { flexDirection: "column", paddingY: 1 },

    // ── Today ──
    React.createElement(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      React.createElement(
        Text,
        { bold: true, color: "green" },
        `Today: ${today?.date ?? "N/A"}`,
      ),
      today &&
        React.createElement(
          Text,
          null,
          `  ${today.sessionCount} sessions │ ${today.projects.length} projects │ ${formatCost(todayCost)}`,
        ),
      today &&
        React.createElement(
          Text,
          null,
          `  ${todayMessages} messages │ In: ${formatTokenCount(today.projects.reduce((s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.inputTokens, 0), 0))} Out: ${formatTokenCount(today.projects.reduce((s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.outputTokens, 0), 0))}`,
        ),
    ),

    // ── All-time Stats ──
    React.createElement(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      React.createElement(Text, { bold: true }, "All-time Stats"),
      React.createElement(
        Text,
        null,
        `  Sessions: ${indexed.length} │ Messages: ${totalMessages} │ Cost: ${formatCost(totalCost)}`,
      ),
      React.createElement(
        Text,
        null,
        `  Tokens: ${formatTokenCount(totalInputTokens)} in / ${formatTokenCount(totalOutputTokens)} out`,
      ),
    ),

    // ── Top Models ──
    topModels.length > 0 &&
      React.createElement(
        Box,
        { flexDirection: "column", marginBottom: 1 },
        React.createElement(Text, { bold: true }, "Top Models"),
        ...topModels.map(([model, count], i) =>
          React.createElement(
            Text,
            { key: i },
            `  ${model}: ${count} sessions`,
          ),
        ),
      ),

    // ── Recent 7 Days ──
    React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, { bold: true }, "Recent 7 Days"),
      ...recentDays.map((day, i) => {
        const dayCost = day.projects.reduce(
          (s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.totalUSD, 0),
          0,
        );
        const dayMsgs = day.projects.reduce(
          (s, p) =>
            s +
            p.sessions.reduce(
              (ss, ses) => ss + ses.messageCounts.user + ses.messageCounts.assistant,
              0,
            ),
          0,
        );
        const dayInTokens = day.projects.reduce(
          (s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.inputTokens, 0),
          0,
        );
        const dayOutTokens = day.projects.reduce(
          (s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.outputTokens, 0),
          0,
        );
        return React.createElement(
          Text,
          { key: i },
          `  ${day.date} │ ${day.sessionCount} ses │ ${dayMsgs} msg │ ${formatTokenCount(dayInTokens)}in/${formatTokenCount(dayOutTokens)}out │ ${formatCost(dayCost)}`,
        );
      }),
    ),
  );
}
