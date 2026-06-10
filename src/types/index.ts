/**
 * Core type definitions for cc-session-mgr.
 *
 * These types model the Claude Code JSONL session data structure
 * and the aggregated summaries derived from it.
 */

// ---------------------------------------------------------------------------
// JSONL raw entry types
// ---------------------------------------------------------------------------

/** The set of known `type` values in Claude Code JSONL transcript files. */
export type JsonlEntryType =
  | "user"
  | "assistant"
  | "system"
  | "summary"
  | "compact_boundary"
  | "custom-title"
  | "last-prompt"
  | "tag"
  | "mode"
  | "permission-mode"
  | "worktree-state"
  | "pr-link"
  | "file-history-snapshot"
  | "content-replacement"
  | "queue-operation"
  | "progress";

/**
 * A single line from a JSONL transcript file.
 *
 * Only the fields we care about are typed; unknown fields are preserved
 * via the index signature for forward-compatibility.
 */
export interface JsonlEntry {
  type: string;
  sessionId?: string;
  uuid?: string;
  parentUuid?: string;
  timestamp?: string;
  cwd?: string;
  version?: string;
  costUSD?: number;
  model?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
  };
  isCompactSummary?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Parsed session results
// ---------------------------------------------------------------------------

export interface MessageCounts {
  user: number;
  assistant: number;
  system: number;
  other: number;
}

export interface CostInfo {
  totalUSD: number;
  source: "inline" | "metrics" | "merged";
  incomplete: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  isEstimated: boolean;
}

export interface FileEditEntry {
  filePath: string;
  editCount: number;
}

// ---------------------------------------------------------------------------
// Session summary (output of parse phase)
// ---------------------------------------------------------------------------

export interface SessionSummary {
  sessionId: string;
  projectPath: string;
  encodedDir: string;
  startTime: string | null;
  endTime: string | null;
  messageCounts: MessageCounts;
  cost: CostInfo;
  models: string[];
  fileEdits: FileEditEntry[];
  isCompacted: boolean;
  hasCustomTitle: boolean;
  customTitle: string | null;
}

// ---------------------------------------------------------------------------
// Day-level splitting types
// ---------------------------------------------------------------------------

/** Per-day slice of a session, derived from entry-level timestamps. */
export interface DaySlice {
  /** Calendar date (YYYY-MM-DD) in the configured timezone. */
  date: string;
  /** Message counts for entries on this date. */
  messageCounts: MessageCounts;
  /** Cost attributed to this date (inline costUSD from entries). */
  cost: number;
  /** Input tokens from entries on this date. */
  inputTokens: number;
  /** Output tokens from entries on this date. */
  outputTokens: number;
  /** Models used by assistant entries on this date. */
  models: string[];
  /** File edits from tool_use entries on this date. */
  fileEdits: FileEditEntry[];
  /** Total number of entries on this date. */
  entryCount: number;
}

/** A session summary enriched with per-day breakdowns. */
export interface DayIndexedSession {
  /** Full-session summary (unchanged from buildSessionSummaries). */
  summary: SessionSummary;
  /** Per-day slices, one per calendar date with activity. */
  daySlices: DaySlice[];
}

// ---------------------------------------------------------------------------
// Aggregation types (output of aggregate phase)
// ---------------------------------------------------------------------------

export interface DateGroup {
  date: string; // YYYY-MM-DD
  sessions: SessionSummary[];
  totalMessages: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  models: Record<string, number>;
  activeSpan: string | null; // "09:00 - 17:30" or null
}

export interface WeekGroup {
  weekLabel: string; // "2026-W23"
  startDate: string; // YYYY-MM-DD (Monday)
  endDate: string; // YYYY-MM-DD (Sunday)
  days: DateGroup[];
  totalSessions: number;
  totalMessages: number;
  totalCost: number;
  models: Record<string, number>;
}

export interface ProjectGroup {
  projectPath: string;
  sessions: SessionSummary[];
  totalMessages: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  models: Record<string, number>;
  topFiles: FileEditEntry[];
  dateRange: { start: string | null; end: string | null };
}

// ---------------------------------------------------------------------------
// Report data types (input to report generator)
// ---------------------------------------------------------------------------

export interface DailyReportData {
  date: string;
  groups: ProjectGroup[];
  total: {
    sessions: number;
    messages: number;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    models: Record<string, number>;
  };
}

export interface WeeklyReportData {
  weekLabel: string;
  startDate: string;
  endDate: string;
  days: DateGroup[];
  projectRanking: ProjectGroup[];
  total: {
    sessions: number;
    messages: number;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    models: Record<string, number>;
  };
}

export interface ProjectReportData {
  projectPath: string;
  totalSessions: number;
  dateRange: { start: string | null; end: string | null };
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  topModel: string;
  models: Record<string, number>;
  topFiles: FileEditEntry[];
  recentSessions: SessionSummary[];
}

// ---------------------------------------------------------------------------
// Work content types (for work-content-oriented reports)
// ---------------------------------------------------------------------------

/** Work content signals extracted from conversation data. */
export interface WorkContent {
  primaryIntent: string;
  userIntents: string[];
  toolCallSummary: Record<string, number>;
  bashCommands: string[];
  moduleSummary: string[];
  assistantSnippets: string[];
  compactedSummary: string | null;
  llmSummary: string | null;
}

/** A session summary enriched with work content. */
export interface SessionWorkSummary extends SessionSummary {
  workContent: WorkContent;
}

/** A work session enriched with per-day breakdowns. */
export interface DayIndexedWorkSession {
  /** Full work-session summary. */
  summary: SessionWorkSummary;
  /** Per-day slices, one per calendar date with activity. */
  daySlices: DaySlice[];
}

/** Work sessions grouped by project for a single day. */
export interface WorkProjectDay {
  projectName: string;
  sessions: SessionWorkSummary[];
}

/** Data for a single-day work report. */
export interface WorkDailyData {
  date: string; // YYYY-MM-DD
  projects: WorkProjectDay[];
  sessionCount: number;
}

/** Data for a weekly work report. */
export interface WorkWeeklyData {
  weekLabel: string; // "2026-W23"
  startDate: string; // YYYY-MM-DD (Monday)
  endDate: string; // YYYY-MM-DD (Sunday)
  days: WorkDailyData[];
  totalSessions: number;
}

/** All sessions for one project across a whole week. */
export interface WorkProjectWeek {
  projectName: string;
  sessions: SessionWorkSummary[];
  /** LLM-generated project-level summary for the week */
  projectSummary: string | null;
  /** Maps sessionId → dates within this week where the session has activity. */
  sessionDates: Map<string, string[]>;
}

/** Project-centric data for the weekly work report. */
export interface WorkWeeklyReportData {
  weekLabel: string; // "2026-W23"
  startDate: string; // YYYY-MM-DD (Monday)
  endDate: string; // YYYY-MM-DD (Sunday)
  projects: WorkProjectWeek[];
  totalSessions: number;
}
