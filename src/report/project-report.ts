import type { ProjectReportData } from "../types/index.js";
import { formatCost, formatTokenCount } from "./format.js";

/**
 * Generate a Markdown project analysis report showing history,
 * cost summary, top files, and recent sessions.
 */
export function generateProjectReport(data: ProjectReportData): string {
  const lines: string[] = [
    `# Project Report: ${data.projectPath}`,
    "",
    "## Overview",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Sessions | ${data.totalSessions} |`,
    `| Cost | ${formatCost(data.totalCost)} (${formatTokenCount(data.totalInputTokens)} in / ${formatTokenCount(data.totalOutputTokens)} out) |`,
    `| Top Model | ${data.topModel} |`,
  ];

  if (data.dateRange.start && data.dateRange.end) {
    lines.push(`| Active Period | ${data.dateRange.start} – ${data.dateRange.end} |`);
  }

  lines.push("");

  // Model distribution
  const modelEntries = Object.entries(data.models);
  if (modelEntries.length > 0) {
    lines.push("## Model Usage");
    lines.push("");
    lines.push("| Model | Sessions |");
    lines.push("|-------|----------|");
    for (const [model, count] of modelEntries) {
      lines.push(`| ${model} | ${count} |`);
    }
    lines.push("");
  }

  // Top edited files
  if (data.topFiles.length > 0) {
    lines.push("## Top Edited Files");
    lines.push("");
    lines.push("| File | Edits |");
    lines.push("|------|-------|");
    for (const f of data.topFiles.slice(0, 10)) {
      lines.push(`| ${f.filePath} | ${f.editCount} |`);
    }
    lines.push("");
  }

  // Recent sessions (last 5)
  if (data.recentSessions.length > 0) {
    lines.push("## Recent Sessions");
    lines.push("");
    for (const s of data.recentSessions) {
      const title = s.customTitle ?? s.sessionId.slice(0, 8);
      const time = s.startTime ? s.startTime.replace("T", " ").slice(0, 16) : "unknown";
      const msgs = s.messageCounts.user + s.messageCounts.assistant;
      lines.push(`- **${title}** — ${time} — ${msgs} msgs — ${formatCost(s.cost.totalUSD)} (${formatTokenCount(s.cost.inputTokens)} in / ${formatTokenCount(s.cost.outputTokens)} out)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
