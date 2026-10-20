import React, { useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { useTuiStore } from "../store.js";
import { getActiveTheme } from "../theme.js";
import { aggregateWorkByDate } from "../../aggregator/work-by-date.js";
import { formatCost, formatTokenCount } from "../../report/format.js";
import { buildWorkDailyMarkdown } from "../../report/pipeline.js";
import { writeReport } from "../../report/output.js";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Daily report view with ←/→ date navigation + `e` to export.
 */
export function DailyReport(): React.ReactElement {
  const dailyDate = useTuiStore((s) => s.dailyDate);
  const navigateDaily = useTuiStore((s) => s.navigateDaily);
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

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await buildWorkDailyMarkdown(indexed, dailyDate, {
        summarizeOptions,
        claudeDir: claudeDir || undefined,
        onProgress: setExportStatus,
      });

      if (!result) {
        setExportMsg(`No sessions found for ${dailyDate}`);
        return;
      }

      const dir = reportDir || homedir();
      const outPath = join(dir, `work-daily-${dailyDate}.md`);
      await writeReport(result.markdown, outPath);
      setExportMsg(`Exported: ${outPath}`);
    } catch (err: unknown) {
      setExportMsg(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
      setExportStatus(null);
    }
  }, [indexed, dailyDate, reportDir, claudeDir, summarizeOptions, setExporting, setExportStatus]);

  useInput((input, key) => {
    if (filterActive) return;
    if (key.leftArrow) navigateDaily(-1);
    if (key.rightArrow) navigateDaily(1);
    if (input === "e") handleExport();
  });

  const allDays = aggregateWorkByDate(indexed);
  const dayData = allDays.find((d) => d.date === dailyDate);

  if (!dayData) {
    return React.createElement(
      Box,
      { flexDirection: "column", padding: 1 },
      React.createElement(
        Text,
        { bold: true },
        `Daily Report: ${dailyDate}`,
      ),
      React.createElement(
        Text,
        { ...theme.dim },
        "No sessions on this date. Use ←/→ to navigate.",
      ),
    );
  }

  // Aggregate stats
  const totalCost = dayData.projects.reduce(
    (s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.totalUSD, 0),
    0,
  );
  const totalInputTokens = dayData.projects.reduce(
    (s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.inputTokens, 0),
    0,
  );
  const totalOutputTokens = dayData.projects.reduce(
    (s, p) => s + p.sessions.reduce((ss, ses) => ss + ses.cost.outputTokens, 0),
    0,
  );
  const totalMessages = dayData.projects.reduce(
    (s, p) =>
      s +
      p.sessions.reduce(
        (ss, ses) => ss + ses.messageCounts.user + ses.messageCounts.assistant,
        0,
      ),
    0,
  );

  // Model distribution
  const modelCounts: Record<string, number> = {};
  for (const p of dayData.projects) {
    for (const ses of p.sessions) {
      for (const m of ses.models) {
        modelCounts[m] = (modelCounts[m] || 0) + 1;
      }
    }
  }
  const models = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);

  return React.createElement(
    Box,
    { flexDirection: "column", paddingY: 1 },

    // Date header
    React.createElement(
      Text,
      { bold: true, color: theme.primary },
      `Daily Report: ${dailyDate}`,
    ),

    // Summary stats
    React.createElement(
      Text,
      null,
      `${dayData.sessionCount} sessions │ ${dayData.projects.length} projects │ ${totalMessages} messages │ ${formatCost(totalCost)}`,
    ),
    React.createElement(
      Text,
      { ...theme.dim },
      `Tokens: ${formatTokenCount(totalInputTokens)} in / ${formatTokenCount(totalOutputTokens)} out`,
    ),

    // Model distribution
    models.length > 0 &&
      React.createElement(
        Text,
        null,
        `Models: ${models.map(([m, c]) => `${m}(${c})`).join(" ")}`,
      ),

    // Per-project breakdown
    ...dayData.projects.map((proj, pi) => {
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
          `▸ ${proj.projectName}`,
        ),
        React.createElement(
          Text,
          { ...theme.dim },
          `  ${proj.sessions.length} sessions │ ${projMsgs} messages │ ${formatCost(projCost)}`,
        ),
        ...proj.sessions.map((ses, j) => {
          const title = ses.customTitle ?? ses.sessionId.slice(0, 12);
          const intent = ses.workContent?.llmSummary ?? ses.workContent?.primaryIntent;
          const fileCount = ses.fileEdits.length;
          const modules = ses.workContent?.moduleSummary;
          const time = ses.startTime
            ? ses.startTime.replace("T", " ").slice(11, 16)
            : "";

          return React.createElement(
            Box,
            { key: j, flexDirection: "column" },
            React.createElement(
              Text,
              null,
              `  ${time} ${title} │ ${formatCost(ses.cost.totalUSD)}`,
            ),
            intent &&
              React.createElement(
                Text,
                { ...theme.dim },
                `    ${intent.slice(0, 80)}${intent.length > 80 ? "..." : ""}`,
              ),
            modules && modules.length > 0 &&
              React.createElement(
                Text,
                { ...theme.dim },
                `    modules: ${modules.slice(0, 3).join(", ")}${modules.length > 3 ? " ..." : ""}`,
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
              ? "←/→: change date  e: export markdown (with LLM summary)"
              : "←/→: change date  e: export markdown (no LLM — use --llm to enable)",
          ),
  );
}
