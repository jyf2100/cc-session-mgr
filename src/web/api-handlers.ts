import type { SessionSummary, JsonlEntry, Phase, LintFinding, TimelineResult, PostmortemResult } from "../types/index.js";
import { toDateStr } from "../cli/tz-utils.js";
import { detectPhases, lintSession, buildTimeline, analyzePostmortem } from "../analysis/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectJson {
  name: string;
  path: string;
  sessionCount: number;
  dateRange: { start: string | null; end: string | null };
}

export interface SessionJson {
  id: string;
  shortId: string;
  title: string;
  project: string;
  startTime: string | null;
  endTime: string | null;
  messages: { user: number; assistant: number; system: number };
  cost: { totalUSD: number; inputTokens: number; outputTokens: number; isEstimated: boolean };
  models: string[];
  fileEditCount: number;
}

export interface SessionDetailJson extends SessionJson {
  fileEdits: { filePath: string; editCount: number }[];
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

interface ProjectAcc {
  path: string;
  sessions: SessionSummary[];
  dateStart: string | null;
  dateEnd: string | null;
}

function aggregateByProject(
  summaries: SessionSummary[],
): Map<string, ProjectAcc> {
  const map = new Map<string, ProjectAcc>();

  for (const s of summaries) {
    const name = s.projectPath.split("/").pop() ?? s.projectPath;
    const existing = map.get(name);
    if (existing) {
      existing.sessions.push(s);
      if (s.startTime) {
        if (!existing.dateStart || s.startTime < existing.dateStart) {
          existing.dateStart = s.startTime;
        }
        if (!existing.dateEnd || s.startTime > existing.dateEnd) {
          existing.dateEnd = s.startTime;
        }
      }
    } else {
      map.set(name, {
        path: s.projectPath,
        sessions: [s],
        dateStart: s.startTime,
        dateEnd: s.startTime,
      });
    }
  }

  return map;
}

function toSessionJson(s: SessionSummary): SessionJson {
  return {
    id: s.sessionId,
    shortId: s.sessionId.slice(0, 8),
    title: s.customTitle ?? "Untitled",
    project: s.projectPath.split("/").pop() ?? s.projectPath,
    startTime: s.startTime,
    endTime: s.endTime,
    messages: {
      user: s.messageCounts.user,
      assistant: s.messageCounts.assistant,
      system: s.messageCounts.system,
    },
    cost: {
      totalUSD: s.cost.totalUSD,
      inputTokens: s.cost.inputTokens,
      outputTokens: s.cost.outputTokens,
      isEstimated: s.cost.isEstimated,
    },
    models: s.models,
    fileEditCount: s.fileEdits.length,
  };
}

// ---------------------------------------------------------------------------
// API handlers — return JSON-safe data
// ---------------------------------------------------------------------------

/**
 * GET /api/projects — aggregate sessions by project.
 */
export function handleProjects(summaries: SessionSummary[], sort?: string): ProjectJson[] {
  const map = aggregateByProject(summaries);
  const result: ProjectJson[] = [];

  for (const [name, acc] of map) {
    result.push({
      name,
      path: acc.path,
      sessionCount: acc.sessions.length,
      dateRange: { start: acc.dateStart, end: acc.dateEnd },
    });
  }

  if (sort === "time") {
    result.sort((a, b) => {
      const ta = a.dateRange.end ?? "";
      const tb = b.dateRange.end ?? "";
      return tb.localeCompare(ta);
    });
  } else {
    result.sort((a, b) => b.sessionCount - a.sessionCount);
  }

  return result;
}

/**
 * GET /api/sessions?project=&from=&to=
 * Filter by project substring and date range, return most recent first.
 */
export function handleSessions(
  summaries: SessionSummary[],
  filters: { project?: string; from?: string; to?: string },
): SessionJson[] {
  let filtered = summaries;

  if (filters.project) {
    const lower = filters.project.toLowerCase();
    filtered = filtered.filter((s) =>
      s.projectPath.toLowerCase().includes(lower),
    );
  }

  if (filters.from) {
    filtered = filtered.filter(
      (s) => s.startTime !== null && toDateStr(s.startTime)! >= filters.from!,
    );
  }

  if (filters.to) {
    filtered = filtered.filter(
      (s) => s.startTime !== null && toDateStr(s.startTime)! <= filters.to!,
    );
  }

  // Sort by startTime descending
  const sorted = [...filtered].sort((a, b) => {
    const ta = a.startTime ?? "";
    const tb = b.startTime ?? "";
    return tb.localeCompare(ta);
  });

  return sorted.map(toSessionJson);
}

/**
 * GET /api/sessions/:id — find by ID prefix, return full detail.
 * Returns { status, data } for the caller to set HTTP status.
 */
export function handleSessionDetail(
  summaries: SessionSummary[],
  idPrefix: string,
): { status: number; data: SessionDetailJson | { error: string; matches?: string[] } } {
  const matches = summaries.filter((s) =>
    s.sessionId.startsWith(idPrefix),
  );

  if (matches.length === 0) {
    return { status: 404, data: { error: `Session not found: ${idPrefix}` } };
  }

  if (matches.length > 1) {
    return {
      status: 400,
      data: {
        error: `Multiple sessions match prefix '${idPrefix}'. Please use a longer prefix.`,
        matches: matches.map((s) => s.sessionId),
      },
    };
  }

  const s = matches[0];
  return {
    status: 200,
    data: {
      ...toSessionJson(s),
      fileEdits: [...s.fileEdits].sort((a, b) => b.editCount - a.editCount).slice(0, 20),
    },
  };
}

// ---------------------------------------------------------------------------
// Session analysis (serialized, browser-safe JSON)
// ---------------------------------------------------------------------------

export interface PhaseJson {
  name: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  toolCount: number;
  filesModified: string[];
  errorCount: number;
  retryCount: number;
  costUSD: number;
}

export interface LintFindingJson {
  ruleId: string;
  severity: string;
  message: string;
}

export interface TimelinePhaseJson {
  name: string;
  durationMs: number;
  costUSD: number;
  toolCallCount: number;
  errorCount: number;
}

export interface TimelineSummaryJson {
  totalDurationMs: number;
  totalCost: number;
  totalToolCalls: number;
  wastedSpendUSD: number;
}

export interface TimelineJson {
  phases: TimelinePhaseJson[];
  summary: TimelineSummaryJson;
}

export interface PostmortemViolationJson {
  rule: string;
  description: string;
}

export interface PostmortemJson {
  hasCrash: boolean;
  crashType: string | null;
  lastUserPrompt: string | null;
  rootCauseSteps: string[];
  violations: PostmortemViolationJson[];
  recoverySuggestions: string[];
}

export interface SessionAnalysisJson {
  phases: PhaseJson[];
  lintFindings: LintFindingJson[];
  timeline: TimelineJson;
  postmortem: PostmortemJson;
}

/**
 * Run deep analysis on a session's raw entries.
 * Pure function — no I/O, safe to call on the request path.
 * Returns a serialized, browser-friendly shape (no heavy data like
 * entries[] or toolCalls[]).
 */
export function handleSessionAnalysis(entries: JsonlEntry[]): SessionAnalysisJson {
  const phases = detectPhases(entries);
  const lintFindings = lintSession(entries);
  const timeline = buildTimeline(entries);
  const postmortem = analyzePostmortem(entries);

  return {
    phases: phases.map(p => ({
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      durationMs: p.durationMs,
      toolCount: p.toolCalls.length,
      filesModified: p.filesModified,
      errorCount: p.errorCount,
      retryCount: p.retryCount,
      costUSD: p.costUSD,
    })),
    lintFindings: lintFindings.map(f => ({
      ruleId: f.ruleId,
      severity: f.severity,
      message: f.message,
    })),
    timeline: {
      phases: timeline.phases.map(tp => ({
        name: tp.name,
        durationMs: tp.durationMs,
        costUSD: tp.costUSD,
        toolCallCount: tp.toolCallCount,
        errorCount: tp.errorCount,
      })),
      summary: {
        totalDurationMs: timeline.summary.totalDurationMs,
        totalCost: timeline.summary.totalCost,
        totalToolCalls: timeline.summary.totalToolCalls,
        wastedSpendUSD: timeline.summary.wastedSpendUSD,
      },
    },
    postmortem: {
      hasCrash: postmortem.crashInfo !== null,
      crashType: postmortem.crashInfo?.type ?? null,
      lastUserPrompt: postmortem.crashInfo?.lastUserPrompt ?? null,
      rootCauseSteps: postmortem.rootCauseTimeline.map(e => e.annotation),
      violations: postmortem.agentsMdViolations,
      recoverySuggestions: postmortem.recoverySuggestions,
    },
  };
}
