import type { WeeklyReportData, ProjectGroup } from "../types/index.js";
import { formatCost, formatTokenCount } from "./format.js";

/**
 * Generate a Markdown weekly report with day-by-day table,
 * project ranking, and model usage breakdown.
 */
export function generateWeeklyReport(data: WeeklyReportData): string {
  const lines: string[] = [
    `# Weekly Report: ${data.weekLabel}`,
    "",
    `**Period:** ${data.startDate} – ${data.endDate}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Sessions | ${data.total.sessions} |`,
    `| Messages | ${data.total.messages} |`,
    `| Cost | ${formatCost(data.total.cost)} (${formatTokenCount(data.total.inputTokens)} in / ${formatTokenCount(data.total.outputTokens)} out) |`,
    "",
  ];

  // Day-by-day table
  if (data.days.length > 0) {
    lines.push("## Daily Breakdown");
    lines.push("");
    lines.push("| Date | Sessions | Messages | Cost | Tokens |");
    lines.push("|------|----------|----------|------|--------|");
    for (const day of data.days) {
      lines.push(
        `| ${day.date} | ${day.sessions.length} | ${day.totalMessages} | ${formatCost(day.totalCost)} | ${formatTokenCount(day.totalInputTokens)} in / ${formatTokenCount(day.totalOutputTokens)} out |`,
      );
    }
    lines.push("");
  }

  // Project ranking
  if (data.projectRanking.length > 0) {
    lines.push("## Project Ranking");
    lines.push("");
    lines.push("| Project | Sessions | Messages | Cost |");
    lines.push("|---------|----------|----------|------|");
    for (const p of data.projectRanking) {
      lines.push(
        `| ${projectName(p)} | ${p.sessions.length} | ${p.totalMessages} | ${formatCost(p.totalCost)} |`,
      );
    }
    lines.push("");
  }

  // Model usage
  const modelEntries = Object.entries(data.total.models);
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

  return lines.join("\n");
}

function projectName(group: ProjectGroup): string {
  const parts = group.projectPath.split("/");
  return parts[parts.length - 1] || group.projectPath;
}
