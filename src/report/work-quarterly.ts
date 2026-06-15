import type { WorkQuarterlyReportData, WorkProjectRange } from "../types/index.js";

/**
 * Generate a project-centric Markdown quarterly work report.
 *
 * Organized as: overview header → per-project sections with monthly breakdown
 * and top files. No individual session listing — strategic summary level.
 */
export function generateWorkQuarterlyReport(data: WorkQuarterlyReportData): string {
  if (data.totalSessions === 0) {
    return `# 工作季报: ${data.label}\n\nNo work sessions found for ${data.label}.\n`;
  }

  const lines: string[] = [
    `# 工作季报: ${data.label}`,
    "",
    `> ${data.startDate} — ${data.endDate} · ${data.totalSessions} 个工作会话 · $${data.totalCost.toFixed(2)}`,
    "",
  ];

  for (const project of data.projects) {
    lines.push(...formatProjectSection(project));
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatProjectSection(project: WorkProjectRange): string[] {
  const name = shortName(project.projectName);
  const count = project.sessions.length;
  const lines: string[] = [];

  lines.push(`## ${name} (${count} session${count > 1 ? "s" : ""})`);
  lines.push("");

  // Project-level summary paragraph
  if (project.projectSummary) {
    lines.push(project.projectSummary);
    lines.push("");
  }

  // Monthly breakdown
  if (project.breakdown.length > 0) {
    lines.push("### 月度分布");
    lines.push("");
    for (const bucket of project.breakdown) {
      lines.push(
        `- **${bucket.label}** (${bucket.startDate} — ${bucket.endDate}): ${bucket.sessionCount} 个活跃日`,
      );
    }
    lines.push("");
  }

  // Top files
  if (project.topFiles.length > 0) {
    lines.push("### 主要文件变更");
    lines.push("");
    for (const file of project.topFiles) {
      const short = file.filePath.split("/").pop() ?? file.filePath;
      lines.push(`- ${short} (${file.editCount} edit${file.editCount > 1 ? "s" : ""})`);
    }
    lines.push("");
  }

  return lines;
}

function shortName(projectPath: string): string {
  const parts = projectPath.split("/");
  return parts[parts.length - 1] || projectPath;
}
