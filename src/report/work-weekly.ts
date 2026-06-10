import type { WorkWeeklyReportData, WorkProjectWeek, SessionWorkSummary } from "../types/index.js";
import { toDateStr } from "../cli/tz-utils.js";

/**
 * Generate a project-centric Markdown weekly work report.
 *
 * Organized as: Project → LLM project summary → categorized session list with dates.
 * Falls back to heuristic when no project-level LLM summary is available.
 */
export function generateWorkWeeklyReport(data: WorkWeeklyReportData): string {
  if (data.totalSessions === 0) {
    return `# 工作周报: ${data.weekLabel}\n\nNo work sessions found for week ${data.weekLabel}.\n`;
  }

  const lines: string[] = [
    `# 工作周报: ${data.weekLabel}`,
    "",
    `> ${data.startDate} — ${data.endDate} · ${data.totalSessions} 个工作会话`,
    "",
  ];

  for (const project of data.projects) {
    const name = shortName(project.projectName);
    const count = project.sessions.length;

    lines.push(`## ${name} (${count} session${count > 1 ? "s" : ""})`);
    lines.push("");

    // Project-level summary paragraph
    if (project.projectSummary) {
      lines.push(project.projectSummary);
      lines.push("");
    }

    // Session bullets grouped by date
    const byDate = groupByDate(project.sessions, project.sessionDates);
    for (const [date, sessions] of byDate) {
      for (const session of sessions) {
        lines.push(formatWorkBullet(date, session));
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWorkBullet(date: string, session: SessionWorkSummary): string {
  const { primaryIntent, moduleSummary, fileEdits, llmSummary } = getSessionSignals(session);
  const fileCount = fileEdits.length;
  const intent = llmSummary ?? primaryIntent;
  const shortDate = date.slice(5); // MM-DD

  if (fileCount === 0) {
    return `- ${shortDate}: ${intent}`;
  }

  const modules = moduleSummary.length > 0
    ? moduleSummary.join(" · ")
    : `${fileCount} file${fileCount > 1 ? "s" : ""}`;

  return `- ${shortDate}: **${intent}** — ${fileCount} file${fileCount > 1 ? "s" : ""}\n  ${modules}`;
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

/**
 * Group sessions by their activity date within the report period.
 *
 * Uses `sessionDates` (built from day-slice data) to determine the display
 * date. For multi-day sessions, the earliest activity date in the week is used.
 * Falls back to `startTime` when no sessionDates entry exists (e.g. unit tests).
 */
function groupByDate(
  sessions: SessionWorkSummary[],
  sessionDates: Map<string, string[]>,
): Map<string, SessionWorkSummary[]> {
  const map = new Map<string, SessionWorkSummary[]>();
  for (const s of sessions) {
    const dates = sessionDates.get(s.sessionId);
    // Use earliest activity date in the week; fallback to startTime
    const date = (dates && dates.length > 0)
      ? dates[0]
      : (s.startTime ? toDateStr(s.startTime) ?? "unknown" : "unknown");
    const existing = map.get(date);
    if (existing) {
      existing.push(s);
    } else {
      map.set(date, [s]);
    }
  }
  return map;
}
