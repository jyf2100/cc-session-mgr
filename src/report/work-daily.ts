import type { WorkDailyData, SessionWorkSummary } from "../types/index.js";

/**
 * Generate a Markdown daily work report describing what was accomplished.
 */
export function generateWorkDailyReport(data: WorkDailyData): string {
  if (data.sessionCount === 0) {
    return `# 工作日报: ${data.date}\n\nNo work sessions found for ${data.date}.\n`;
  }

  const lines: string[] = [
    `# 工作日报: ${data.date}`,
    "",
    `> ${data.sessionCount} 个工作会话`,
    "",
  ];

  for (const project of data.projects) {
    lines.push(`## ${shortName(project.projectName)}`);
    lines.push("");

    for (const session of project.sessions) {
      lines.push(formatWorkBullet(session));
    }

    lines.push("");
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
