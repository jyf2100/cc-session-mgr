import type { SessionSummary } from "../types/index.js";

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
      (s) => s.startTime !== null && s.startTime.slice(0, 10) >= filters.from!,
    );
  }

  if (filters.to) {
    filtered = filtered.filter(
      (s) => s.startTime !== null && s.startTime.slice(0, 10) <= filters.to!,
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
