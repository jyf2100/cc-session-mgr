import { homedir } from "node:os";
import { join } from "node:path";
import { buildSessionSummaries } from "../aggregator/build-summaries.js";
import { mergeCostData } from "../aggregator/merge-cost.js";
import { formatSessionList, formatSessionDetail } from "../report/session-format.js";
import { toDateStr } from "./tz-utils.js";
import { writeReport } from "../report/output.js";
import type { SessionSummary } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ListOptions {
  project?: string;
  from?: string;
  to?: string;
  limit: number;
  claudeDir?: string;
  output?: string;
}

interface ShowOptions {
  claudeDir?: string;
  output?: string;
}

function resolveClaudeDir(claudeDir?: string): string {
  return claudeDir ?? join(homedir(), ".claude");
}

/**
 * Filter sessions by project substring and date range.
 */
function filterSessions(
  sessions: SessionSummary[],
  opts: { project?: string; from?: string; to?: string },
): SessionSummary[] {
  let filtered = sessions;

  if (opts.project) {
    const lower = opts.project.toLowerCase();
    filtered = filtered.filter((s) =>
      s.projectPath.toLowerCase().includes(lower),
    );
  }

  if (opts.from) {
    filtered = filtered.filter(
      (s) => s.startTime !== null && toDateStr(s.startTime)! >= opts.from!,
    );
  }

  if (opts.to) {
    filtered = filtered.filter(
      (s) => s.startTime !== null && toDateStr(s.startTime)! <= opts.to!,
    );
  }

  return filtered;
}

/**
 * Sort sessions by startTime descending (most recent first).
 */
function sortByRecent(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => {
    const ta = a.startTime ?? "";
    const tb = b.startTime ?? "";
    return tb.localeCompare(ta);
  });
}

/**
 * Find a session by ID prefix. Returns the session, or throws on
 * ambiguous / not-found.
 */
function findByPrefix(
  sessions: SessionSummary[],
  prefix: string,
): SessionSummary {
  const matches = sessions.filter((s) => s.sessionId.startsWith(prefix));

  if (matches.length === 0) {
    throw new Error(`Session not found: ${prefix}`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple sessions match prefix '${prefix}'. Please use a longer prefix.`,
    );
  }

  return matches[0];
}

// ---------------------------------------------------------------------------
// Public handlers
// ---------------------------------------------------------------------------

/**
 * Load all session data (parse + merge cost).
 */
async function loadSummaries(claudeDir: string): Promise<SessionSummary[]> {
  const raw = await buildSessionSummaries(claudeDir);
  return mergeCostData(raw, claudeDir);
}

/**
 * Run `session list` command.
 */
export async function runList(opts: ListOptions): Promise<void> {
  const claudeDir = resolveClaudeDir(opts.claudeDir);
  const all = await loadSummaries(claudeDir);
  const filtered = filterSessions(all, opts);
  const sorted = sortByRecent(filtered);
  const markdown = formatSessionList(sorted, opts.limit);
  await writeReport(markdown, opts.output);
}

/**
 * Run `session show <sessionId>` command.
 */
export async function runShow(
  sessionId: string,
  opts: ShowOptions,
): Promise<void> {
  const claudeDir = resolveClaudeDir(opts.claudeDir);
  const all = await loadSummaries(claudeDir);

  const session = findByPrefix(all, sessionId);
  const markdown = formatSessionDetail(session);
  await writeReport(markdown, opts.output);
}

// ---------------------------------------------------------------------------
// Exported for testing
// ---------------------------------------------------------------------------

export { filterSessions, sortByRecent, findByPrefix };
