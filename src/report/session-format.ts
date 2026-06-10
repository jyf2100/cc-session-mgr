import type { SessionSummary, SessionWorkSummary } from "../types/index.js";
import { formatCostWithTokens } from "./format.js";
import { toDateStr } from "../cli/tz-utils.js";

/**
 * Format a session ID to its short form (first 8 characters).
 */
function shortId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

/**
 * Format a date string (ISO) to YYYY-MM-DD.
 */
function formatDate(iso: string | null): string {
  if (!iso) return "N/A";
  return toDateStr(iso) ?? "N/A";
}

/**
 * Format a single session as a Markdown table row.
 * Columns: shortId | title | date | msgs | cost
 */
export function formatSessionRow(s: SessionSummary): string {
  const id = shortId(s.sessionId);
  const title = s.customTitle ?? "Untitled";
  const date = formatDate(s.startTime);
  const msgs = s.messageCounts.user + s.messageCounts.assistant;
  const cost = formatCostWithTokens(s.cost);
  return `| ${id} | ${title} | ${date} | ${msgs} | ${cost} |`;
}

/**
 * Format a list of sessions as a Markdown table with header and count line.
 * Sessions are expected to be pre-sorted (most recent first).
 *
 * @param sessions - The sessions to display
 * @param limit - Maximum number of rows to show (0 = unlimited)
 */
export function formatSessionList(
  sessions: SessionSummary[],
  limit: number,
): string {
  if (sessions.length === 0) {
    return "No sessions found matching the criteria.\n";
  }

  const appliedLimit = limit > 0 ? limit : sessions.length;
  const shown = sessions.slice(0, appliedLimit);

  const header = `Showing ${sessions.length} session(s) (limit: ${appliedLimit})\n`;
  const tableHeader = "| ID | Title | Date | Msgs | Cost |\n|------|------|------|------|------|";
  const rows = shown.map(formatSessionRow).join("\n");

  return `${header}\n${tableHeader}\n${rows}\n`;
}

/**
 * Format a full session detail view.
 */
export function formatSessionDetail(s: SessionSummary | SessionWorkSummary): string {
  const lines: string[] = [];

  lines.push(`# Session Detail\n`);

  lines.push(`**ID:** ${s.sessionId}`);
  lines.push(`**Project:** ${s.projectPath}`);

  const start = s.startTime ?? "N/A";
  const end = s.endTime ?? "N/A";
  lines.push(`**Time:** ${start} → ${end}`);

  const mc = s.messageCounts;
  lines.push(
    `**Messages:** ${mc.user + mc.assistant} total (user: ${mc.user}, assistant: ${mc.assistant}, system: ${mc.system})`,
  );

  lines.push(`**Cost:** ${formatCostWithTokens(s.cost)}`);

  if (s.cost.inputTokens > 0 || s.cost.outputTokens > 0) {
    lines.push(
      `**Tokens:** ${s.cost.inputTokens.toLocaleString()} in / ${s.cost.outputTokens.toLocaleString()} out`,
    );
  }

  if (s.cost.isEstimated) {
    lines.push(`  (estimated from token counts)`);
  }

  lines.push(`\n**Models:** ${s.models.length > 0 ? s.models.join(", ") : "N/A"}`);

  lines.push(`\n**File Edits:**`);
  if (s.fileEdits.length === 0) {
    lines.push(`No file edits in this session.`);
  } else {
    const sorted = [...s.fileEdits].sort((a, b) => b.editCount - a.editCount);
    const top20 = sorted.slice(0, 20);
    for (const fe of top20) {
      lines.push(`- ${fe.filePath} (${fe.editCount} edits)`);
    }
    if (sorted.length > 20) {
      lines.push(`  ... and ${sorted.length - 20} more files`);
    }
  }

  if ("workContent" in s && s.workContent.llmSummary) {
    lines.push(`\n**LLM Summary:** ${s.workContent.llmSummary}`);
  }

  return lines.join("\n") + "\n";
}
