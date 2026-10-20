import React, { useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { useTuiStore } from "../store.js";
import { getActiveTheme } from "../theme.js";
import { aggregateWorkByDate } from "../../aggregator/work-by-date.js";
import {
  aggregateWorkByWeek,
  aggregateWorkByProject,
} from "../../aggregator/work-by-week.js";
import { formatCost, formatTokenCount } from "../../report/format.js";
import { buildWorkWeeklyMarkdown } from "../../report/pipeline.js";
import { writeReport } from "../../report/output.js";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Weekly report view with ←/→ week navigation + `e` to export.
 */
export function WeeklyReport(): React.ReactElement {
  const weeklyYear = useTuiStore((s) => s.weeklyYear);
  const weeklyWeek = useTuiStore((s) => s.weeklyWeek);
  const navigateWeekly = useTuiStore((s) => s.navigateWeekly);
  const filterActive = useTuiStore((s) => s.filterActive);
  const indexed = useTuiStore((s) => s.indexed);
  const reportDir = useTuiStore((s) => s.reportDir);
  const claudeDir = useTuiStore((s) => s.claudeDir);
  const summarizeOptions = useTuiStore((s) => s.summarizeOptions);
  const exporting = useTuiStore((s) => s.exporting);
  const exportStatus = useTuiStore((s) => s.exportStatus);
  const setExporting = useTuiStore((s) => s.setExporting);
  const setExportStatus = useTuiStore((s) => s.setExportStatus);
  const [exportMsg, setExportMsg] = React.useState<string | null>(null);
  const theme = getActiveTheme();

  const weekLabel = `${weeklyYear}-W${String(weeklyWeek).padStart(2, "0")}`;

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await buildWorkWeeklyMarkdown(indexed, weeklyYear, weeklyWeek, {
        summarizeOptions,
        claudeDir: claudeDir || undefined,
        onProgress: setExportStatus,
      });

      if (!result) {
        setExportMsg(`No sessions found for ${weekLabel}`);
        return;
      }

      const dir = reportDir || homedir();
      const outPath = join(dir, `work-weekly-${weekLabel}.md`);
      await writeReport(result.markdown, outPath);
      setExportMsg(`Exported: ${outPath}`);
    } catch (err: unknown) {
      setExportMsg(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
      setExportStatus(null);
    }
  }, [indexed, weeklyYear, weeklyWeek, weekLabel, reportDir, claudeDir, summarizeOptions, setExporting, setExportStatus]);

  useInput((input, key) => {
    if (filterActive) return;
    if (key.leftArrow) navigateWeekly(-1);
    if (key.rightArrow) navigateWeekly(1);
    if (input === "e") handleExport();
  });

  // Pipeline: indexed → daily data → weekly data → project-centric
  const dailyData = aggregateWorkByDate(indexed);
  const allWeeks = aggregateWorkByWeek(dailyData);
  const weekData = allWeeks.find((w) => w.weekLabel === weekLabel);

  if (!weekData) {
    return React.createElement(
      Box,
      { flexDirection: "column", padding: 1 },
      React.createElement(
        Text,
        { bold: true },
        `Weekly Report: ${weekLabel}`,
      ),
      React.createElement(
        Text,
        { ...theme.dim },
        "No sessions this week. Use ←/→ to navigate.",
      ),
    );
  }

  // Project-centric view
  const projectView = aggregateWorkByProject(weekData);

  // Aggregate stats
  const totalCost = projectView.projects.reduce(
    (sum, p) => sum + p.sessions.reduce((ss, s) => ss + s.cost.totalUSD, 0),
    0,
  );
  const totalInputTokens = projectView.projects.reduce(
    (sum, p) => sum + p.sessions.reduce((ss, s) => ss + s.cost.inputTokens, 0),
    0,
  );
  const totalOutputTokens = projectView.projects.reduce(
    (sum, p) => sum + p.sessions.reduce((ss, s) => ss + s.cost.outputTokens, 0),
    0,
  );
  const totalMessages = projectView.projects.reduce(
    (sum, p) =>
      sum +
      p.sessions.reduce(
        (ss, s) => ss + s.messageCounts.user + s.messageCounts.assistant,
        0,
      ),
    0,
  );

  // Model distribution
  const modelCounts: Record<string, number> = {};
  for (const p of projectView.projects) {
    for (const ses of p.sessions) {
      for (const m of ses.models) {
        modelCounts[m] = (modelCounts[m] || 0) + 1;
      }
    }
  }
  const models = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);

  // Daily breakdown from week's daily data
  const weekDailyData = dailyData.filter((d) => {
    const dayDate = new Date(d.date + "T00:00:00");
    const monday = new Date(weeklyYear, 0, 1 + (weeklyWeek - 1) * 7);
    const weekStart = new Date(monday);
    weekStart.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return dayDate >= weekStart && dayDate <= weekEnd;
  });

  return React.createElement(
    Box,
    { flexDirection: "column", paddingY: 1 },

    // Week header + summary
    React.createElement(
      Text,
      { bold: true, color: theme.primary },
      `Weekly Report: ${weekLabel}`,
    ),
    React.createElement(
      Text,
      null,
      `${projectView.startDate} → ${projectView.endDate} │ ${projectView.totalSessions} sessions │ ${totalMessages} messages │ ${formatCost(totalCost)}`,
    ),
    React.createElement(
      Text,
      { ...theme.dim },
      `Tokens: ${formatTokenCount(totalInputTokens)} in / ${formatTokenCount(totalOutputTokens)} out`,
    ),

    // Models
    models.length > 0 &&
      React.createElement(
        Text,
        null,
        `Models: ${models.map(([m, c]) => `${m}(${c})`).join(" ")}`,
      ),

    // Daily breakdown
    weekDailyData.length > 0 &&
      React.createElement(
        Box,
        { flexDirection: "column", marginTop: 1 },
        React.createElement(Text, { bold: true }, "Daily Breakdown"),
        ...weekDailyData.map((d, i) => {
          const dCost = d.projects.reduce(
            (s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.totalUSD, 0),
            0,
          );
          const dMsgs = d.projects.reduce(
            (s, p) =>
              s +
              p.sessions.reduce(
                (ss, ses) => ss + ses.messageCounts.user + ses.messageCounts.assistant,
                0,
              ),
            0,
          );
          return React.createElement(
            Text,
            { key: i },
            `  ${d.date} │ ${d.sessionCount} ses │ ${dMsgs} msg │ ${formatCost(dCost)}`,
          );
        }),
      ),

    // Per-project breakdown
    ...projectView.projects.map((proj, pi) => {
      const projCost = proj.sessions.reduce((s, ses) => s + ses.cost.totalUSD, 0);
      const projMsgs = proj.sessions.reduce(
        (s, ses) => s + ses.messageCounts.user + ses.messageCounts.assistant,
        0,
      );

      return React.createElement(
        Box,
        { key: pi, flexDirection: "column", marginTop: 1 },
        React.createElement(
          Text,
          { bold: true },
          `▸ ${proj.projectName} (${proj.sessions.length} sessions, ${projMsgs} messages, ${formatCost(projCost)})`,
        ),
        proj.projectSummary &&
          React.createElement(
            Text,
            { ...theme.dim },
            `  ${proj.projectSummary}`,
          ),
        ...proj.sessions.map((ses, j) => {
          const title = ses.customTitle ?? ses.sessionId.slice(0, 12);
          const intent = ses.workContent?.llmSummary ?? ses.workContent?.primaryIntent;
          const fileCount = ses.fileEdits.length;
          const date = ses.startTime
            ? ses.startTime.replace("T", " ").slice(5, 16)
            : "";

          return React.createElement(
            Box,
            { key: j, flexDirection: "column" },
            React.createElement(
              Text,
              null,
              `  ${date} ${title} │ ${formatCost(ses.cost.totalUSD)}`,
            ),
            intent &&
              React.createElement(
                Text,
                { ...theme.dim },
                `    ${intent.slice(0, 80)}${intent.length > 80 ? "..." : ""}`,
              ),
            fileCount > 0 &&
              React.createElement(
                Text,
                { ...theme.dim },
                `    ${fileCount} files edited`,
              ),
          );
        }),
      );
    }),

    // Export message or hint
    exporting
      ? React.createElement(Text, { color: theme.warning }, exportStatus ?? "Exporting...")
      : exportMsg
        ? React.createElement(Text, { color: theme.success }, exportMsg)
        : React.createElement(
            Text,
            { ...theme.dim },
            summarizeOptions
              ? "←/→: change week  e: export markdown (with LLM summary)"
              : "←/→: change week  e: export markdown (no LLM — use --llm to enable)",
          ),
  );
}
