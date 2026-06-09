import type { WorkWeeklyData, SessionWorkSummary } from "../types/index.js";

/**
 * Generate a Markdown weekly work report with day-by-day breakdown.
 */
export function generateWorkWeeklyReport(data: WorkWeeklyData): string {
  if (data.totalSessions === 0) {
    return `# 工作周报: ${data.weekLabel}\n\nNo work sessions found for week ${data.weekLabel}.\n`;
  }

  const lines: string[] = [
    `# 工作周报: ${data.weekLabel}`,
    "",
    `> ${data.startDate} — ${data.endDate} · ${data.totalSessions} 个工作会话`,
    "",
  ];

  for (const day of data.days) {
    lines.push(`### ${day.date} (${day.sessionCount} sessions)`);
    lines.push("");

    for (const project of day.projects) {
      lines.push(`**${shortName(project.projectName)}**`);
      lines.push("");

      for (const session of project.sessions) {
        lines.push(formatWorkBullet(session));
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatWorkBullet(session: SessionWorkSummary): string {
  const { primaryIntent, moduleSummary, fileEdits, llmSummary } = getSessionSignals(session);
  const fileCount = fileEdits.length;

  // Prefer LLM-generated summary when available
  const intent = llmSummary ?? primaryIntent;

  if (fileCount === 0) {
    return `- ${intent}`;
  }

  const modules = moduleSummary.length > 0
    ? moduleSummary.join(" · ")
    : `${fileCount} file${fileCount > 1 ? "s" : ""}`;

  return `- **${intent}** — ${fileCount} file${fileCount > 1 ? "s" : ""}\n  ${modules}`;
}

function getSessionSignals(session: SessionWorkSummary) {
  return {
    primaryIntent: session.workContent.primaryIntent,
    moduleSummary: session.workContent.moduleSummary,
    fileEdits: session.fileEdits,
    llmSummary: session.workContent.llmSummary,
  };
}

function shortName(projectPath: string): string {
  const parts = projectPath.split("/");
  return parts[parts.length - 1] || projectPath;
}
