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

// ---------------------------------------------------------------------------
// Range-based report types (monthly / quarterly)
// ---------------------------------------------------------------------------

/** Breakdown granularity for range-based reports. */
export type RangeBreakdown = "weekly" | "monthly";

/** Options for aggregateWorkByRange(). */
export interface AggregateWorkByRangeOptions {
  /** How to break down sub-periods within the range. */
  breakdown: RangeBreakdown;
}

/** A sub-period bucket within a date range (week or month). */
export interface RangeBreakdownBucket {
  /** Human-readable label: "2026-W23" (weekly) or "2026-06" (monthly). */
  label: string;
  /** Start date of the bucket. */
  startDate: string; // YYYY-MM-DD
  /** End date of the bucket. */
  endDate: string; // YYYY-MM-DD
  /** Number of sessions active in this bucket. */
  sessionCount: number;
}

/** All sessions for one project across a date range (month or quarter). */
export interface WorkProjectRange {
  projectName: string;
  sessions: SessionWorkSummary[];
  /** LLM-generated project-level summary for the range. */
  projectSummary: string | null;
  /** Breakdown by sub-period (weekly for monthly, monthly for quarterly). */
  breakdown: RangeBreakdownBucket[];
  /** Top edited files across the range (sorted by edit count, max 10). */
  topFiles: FileEditEntry[];
  /** Total cost across all sessions in this project. */
  totalCost: number;
  /** Total input tokens. */
  totalInputTokens: number;
  /** Total output tokens. */
  totalOutputTokens: number;
}

/** Data for a monthly work report. */
export interface WorkMonthlyReportData {
  year: number;
  month: number; // 1–12
  label: string; // "2026-06"
  startDate: string; // YYYY-MM-DD (first day of month)
  endDate: string; // YYYY-MM-DD (last day of month)
  projects: WorkProjectRange[];
  totalSessions: number;
  totalCost: number;
}

/** Data for a quarterly work report. */
export interface WorkQuarterlyReportData {
  year: number;
  quarter: number; // 1–4
  label: string; // "2026-Q2"
  startDate: string; // YYYY-MM-DD (first day of quarter)
  endDate: string; // YYYY-MM-DD (last day of quarter)
  projects: WorkProjectRange[];
  totalSessions: number;
  totalCost: number;
}

// ---------------------------------------------------------------------------
// Analytics types (input/output of analytics functions)
// ---------------------------------------------------------------------------

/** A single insight generated by the analytics engine. */
export interface Insight {
  severity: "info" | "warning" | "actionable";
  title: string;
  description: string;
  metric: string;
  category: string;
  sessionIds: string[];
  projectPaths: string[];
  dateRange: { from: string; to: string } | null;
}

/** A single cost anomaly detected by Z-score analysis. */
export interface CostAnomaly {
  date: string;
  cost: number;
  expectedCost: number;
  zScore: number;
  attribution: {
    type: "model_switch" | "token_spike" | "long_session" | "unknown";
    detail: string;
    sessionIds: string[];
  };
}

/** Result of Z-score cost anomaly detection across days. */
export interface CostAnomalyResult {
  anomalies: CostAnomaly[];
  insufficientData: boolean;
  meanCost: number;
  stddevCost: number;
  dataPointCount: number;
}

/** Per-model cost and efficiency metrics for model comparison. */
export interface ModelComparison {
  model: string;
  sessionCount: number;
  totalCost: number;
  avgCostPerSession: number;
  avgCostPerEdit: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  outputInputRatio: number;
  avgMessagesPerSession: number;
  /** Average session duration in minutes. Computed only from sessions with both startTime and endTime. */
  avgDurationMinutes: number;
  multiModelSessionCount: number;
}

/** Cost data quality audit report. */
export interface CostAuditReport {
  totalSessions: number;
  sourceDistribution: {
    inline: number;
    metrics: number;
    merged: number;
  };
  incompleteCount: number;
  incompleteRate: number;
  isEstimatedCount: number;
  isEstimatedRate: number;
  trustLevel: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Deep session analysis types
// ---------------------------------------------------------------------------

/** A single tool call extracted from an assistant message's content blocks. */
export interface ToolCall {
  toolName: string;
  /** Tool-specific input (e.g. { filePath: "src/foo.ts" } for Read). */
  input: Record<string, unknown>;
  /** Index of the parent assistant entry in the entries array. */
  entryIndex: number;
}

/** A logical phase within a session, delimited by user prompts. */
export interface Phase {
  index: number;
  name: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  entries: JsonlEntry[];
  toolCalls: ToolCall[];
  filesModified: string[];
  errorCount: number;
  retryCount: number;
  costUSD: number;
}

// ---------------------------------------------------------------------------
// Session lint types
// ---------------------------------------------------------------------------

export type LintSeverity = "info" | "warning" | "error";

export type LintRuleId =
  | "tool-loop"
  | "reasoning-spiral"
  | "budget-proximity"
  | "context-saturation"
  | "redundant-read"
  | "error-retry-loop"
  | "no-output";

export interface LintFinding {
  ruleId: LintRuleId;
  severity: LintSeverity;
  message: string;
  /** Indices into the source entries array that triggered this finding. */
  entries: number[];
}

/** Configurable thresholds for lint rules. */
export interface LintConfig {
  toolLoopThreshold: number;
  reasoningSpiralThreshold: number;
  budgetThreshold: number;
  contextSaturationOutputTokens: number;
  contextSaturationMinCost: number;
  redundantReadThreshold: number;
  errorRetryThreshold: number;
  noOutputToolThreshold: number;
}

// ---------------------------------------------------------------------------
// Standup report types
// ---------------------------------------------------------------------------

export interface StandupApproach {
  description: string;
  filesModified: string[];
}

export interface StandupUncertainty {
  userMessage: string;
  entryIndex: number;
}

export interface StandupReport {
  approaches: StandupApproach[];
  abandoned: StandupApproach[];
  uncertainties: StandupUncertainty[];
  reviewItems: string[];
  newDependencies: string[];
  contextResetCount: number;
}

// ---------------------------------------------------------------------------
// Session timeline types
// ---------------------------------------------------------------------------

export type TimelineEventType =
  | "user_prompt"
  | "assistant_response"
  | "tool_call"
  | "tool_result"
  | "system_event"
  | "compact";

export interface TimelineEntry {
  index: number;
  timestamp: string;
  eventType: TimelineEventType;
  summary: string;
  costUSD: number;
}

export interface TimelinePhase {
  name: string;
  startIndex: number;
  endIndex: number;
  durationMs: number;
  costUSD: number;
  toolCallCount: number;
  errorCount: number;
}

export interface TimelineSummary {
  totalDurationMs: number;
  totalCost: number;
  totalToolCalls: number;
  wastedSpendUSD: number;
}

export interface TimelineResult {
  entries: TimelineEntry[];
  phases: TimelinePhase[];
  summary: TimelineSummary;
}

// ---------------------------------------------------------------------------
// Session postmortem types
// ---------------------------------------------------------------------------

export type CrashType =
  | "context_window_exceeded"
  | "oom"
  | "timeout";

export interface CrashInfo {
  type: CrashType;
  timestamp: string;
  lastUserPrompt: string;
}

export interface PostmortemTimelineEntry {
  entryIndex: number;
  annotation: string;
  isTrigger: boolean;
}

export interface PostmortemViolation {
  rule: string;
  description: string;
}

export interface PostmortemResult {
  crashInfo: CrashInfo | null;
  rootCauseTimeline: PostmortemTimelineEntry[];
  agentsMdViolations: PostmortemViolation[];
  recoverySuggestions: string[];
}

// ---------------------------------------------------------------------------
// Session diff types
// ---------------------------------------------------------------------------

export type PhaseAlignmentStatus = "matched" | "inserted" | "deleted";

export interface PhaseAlignment {
  phaseA: Phase | null;
  phaseB: Phase | null;
  status: PhaseAlignmentStatus;
}

export interface MetricDelta {
  phaseName: string;
  costDelta: number;
  toolCallCountDelta: number;
  errorCountDelta: number;
  durationDeltaMs: number;
}

export type DivergenceReason = "cost_spike" | "tool_divergence";

export interface DivergencePoint {
  phaseName: string;
  reason: DivergenceReason;
  description: string;
}

export interface SessionDiff {
  phaseAlignment: PhaseAlignment[];
  metricDeltas: MetricDelta[];
  divergencePoints: DivergencePoint[];
}

// ---------------------------------------------------------------------------
// Context scoring types
// ---------------------------------------------------------------------------

export type ContextGrade = "A" | "B" | "C" | "D" | "F";

export interface ContextScoreDimensions {
  completeness: number;
  specificity: number;
  consistency: number;
  recency: number;
}

export interface ContextScore {
  grade: ContextGrade;
  overallScore: number;
  dimensions: ContextScoreDimensions;
  detectedSections: string[];
  missingSections: string[];
  sessionCorrelation: "positive" | "negative" | "neutral" | "unknown";
}
