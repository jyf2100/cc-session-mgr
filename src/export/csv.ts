/**
 * Export module — render session lists as CSV.
 *
 * Pure function: no side effects, no file I/O.
 */

import type { SessionWorkSummary } from "../types/index.js";

/** CSV column headers — matches the spec's 12-column requirement. */
const CSV_HEADERS = [
  "sessionId",
  "project",
  "startTime",
  "endTime",
  "cost",
  "model",
  "inputTokens",
  "outputTokens",
  "userMessages",
  "assistantMessages",
  "fileEditCount",
  "isCompacted",
] as const;

/**
 * Escape a single CSV cell value per RFC 4180.
 *
 * - If the value contains a comma, double-quote, or newline → wrap in quotes
 *   and double any internal quotes.
 * - Otherwise return as-is.
 */
function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Convert a session's data to a CSV row string.
 */
function sessionToRow(session: SessionWorkSummary): string {
  const cost = session.cost.totalUSD;
  const tokens = session.cost;
  const mc = session.messageCounts;

  const cells: string[] = [
    session.sessionId,
    session.projectPath,
    session.startTime ?? "",
    session.endTime ?? "",
    String(cost),
    session.models.join("; "),
    String(tokens.inputTokens ?? 0),
    String(tokens.outputTokens ?? 0),
    String(mc.user),
    String(mc.assistant),
    String(session.fileEdits.length),
    String(session.isCompacted),
  ];

  return cells.map(escapeCsvCell).join(",");
}

/**
 * Render an array of work sessions as a CSV string.
 *
 * @param sessions - Sessions to export. Empty array produces header-only output.
 * @returns CSV string with header row + one row per session.
 */
export function renderCsv(sessions: SessionWorkSummary[]): string {
  const header = CSV_HEADERS.join(",");
  const rows = sessions.map(sessionToRow);
  return [header, ...rows].join("\n");
}
