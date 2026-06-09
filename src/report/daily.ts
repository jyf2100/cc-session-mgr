import type { DailyReportData, ProjectGroup } from "../types/index.js";
import { formatCost, formatTokenCount } from "./format.js";

/**
 * Generate a Markdown daily report showing all session activity for a given date.
 */
export function generateDailyReport(data: DailyReportData): string {
  if (data.total.sessions === 0) {
    return `# Daily Report: ${data.date}\n\nNo sessions found for ${data.date}.\n`;
  }

  const lines: string[] = [
    `# Daily Report: ${data.date}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Sessions | ${data.total.sessions} |`,
    `| Messages | ${data.total.messages} |`,
    `| Cost | ${formatCost(data.total.cost)} (${formatTokenCount(data.total.inputTokens)} in / ${formatTokenCount(data.total.outputTokens)} out) |`,
    `| Projects | ${data.groups.length} |`,
    "",
  ];

  // Model distribution
  const modelEntries = Object.entries(data.total.models);
  if (modelEntries.length > 0) {
    lines.push("**Models:** " + modelEntries.map(([m, c]) => `${m} (${c})`).join(", "));
    lines.push("");
  }

  // Per-project breakdown
  for (const group of data.groups) {
    lines.push(`## ${projectName(group)}`);
    lines.push("");
    lines.push(`- **Sessions:** ${group.sessions.length}`);
    lines.push(`- **Messages:** ${group.totalMessages}`);
    lines.push(`- **Cost:** ${formatCost(group.totalCost)}`);

    if (group.topFiles.length > 0) {
      lines.push(`- **Top files:** ${group.topFiles.slice(0, 5).map((f) => `${f.filePath} (${f.editCount})`).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function projectName(group: ProjectGroup): string {
  const parts = group.projectPath.split("/");
  return parts[parts.length - 1] || group.projectPath;
}
