/**
 * Insights engine — 基于规则的会话效率异常检测。
 *
 * 纯函数：接收 sessions，返回结构化的洞察列表。
 * 所有阈值基于数据驱动（中位数）而非硬编码。
 */

import type { SessionWorkSummary, Insight } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the median of an array of numbers. Returns 0 for empty input. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Create a dedup key from rule properties. */
function insightKey(category: string, title: string): string {
  return `${category}::${title}`;
}

/** Compute session duration in minutes from startTime to endTime. */
function sessionDurationMinutes(session: SessionWorkSummary): number | null {
  const { startTime, endTime } = session;
  if (!startTime || !endTime) return null;
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  if (isNaN(ms) || ms < 0) return null;
  return ms / 60_000;
}

/** Total tokens for a session (input + output). */
function totalTokens(session: SessionWorkSummary): number {
  return session.cost.inputTokens + session.cost.outputTokens;
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

interface RawInsight {
  severity: Insight["severity"];
  title: string;
  description: string;
  metric: string;
  category: string;
  sessionId: string;
  projectPath: string;
  date: string | undefined;
}

/** Check all rules against a single session and emit raw insights. */
function runRules(
  session: SessionWorkSummary,
  costMedian: number | null,
  tokenMedian: number | null,
  hasEnoughForStats: boolean,
): RawInsight[] {
  const insights: RawInsight[] = [];
  const sid = session.sessionId;
  const projectPath = session.projectPath;
  const date = session.startTime ? session.startTime.slice(0, 10) : undefined;
  const cost = session.cost.totalUSD;
  const tokens = totalTokens(session);
  const totalMessages =
    session.messageCounts.user + session.messageCounts.assistant;

  // Rule 1: 高消耗低活跃会话（需要统计阈值）
  if (hasEnoughForStats) {
    const isLowActivity =
      session.messageCounts.user < 3 || session.fileEdits.length === 0;

    if (costMedian === 0 && tokenMedian !== null && tokenMedian > 0) {
      // Zero-cost model: use token-based threshold
      if (tokens > tokenMedian * 2 && isLowActivity) {
        insights.push({
          severity: "warning",
          title: "高消耗低活跃会话",
          description: `会话消耗 ${(tokens / 1000).toFixed(1)}k tokens 超过中位数 2 倍，但活跃度较低。`,
          metric: `${(tokens / 1000).toFixed(1)}k tokens（中位数: ${(tokenMedian / 1000).toFixed(1)}k）`,
          category: "效率",
          sessionId: sid,
          projectPath,
          date,
        });
      }
    } else if (costMedian !== null && costMedian > 0) {
      // Non-zero cost: use cost-based threshold (original behavior)
      if (cost > costMedian * 2 && isLowActivity) {
        insights.push({
          severity: "warning",
          title: "高消耗低活跃会话",
          description: `会话成本 $${cost.toFixed(2)} 超过中位数 2 倍，但活跃度较低。`,
          metric: `$${cost.toFixed(2)}（中位数: $${costMedian.toFixed(2)}）`,
          category: "效率",
          sessionId: sid,
          projectPath,
          date,
        });
      }
    }
  }

  // Rule 2: 低效会话：高消耗少交互（需要统计阈值）
  if (
    hasEnoughForStats &&
    tokenMedian !== null &&
    tokenMedian > 0 &&
    totalMessages < 5 &&
    tokens > tokenMedian * 2
  ) {
    insights.push({
      severity: "info",
      title: "低效会话：高消耗少交互",
      description: `会话仅 ${totalMessages} 条消息却消耗 ${(tokens / 1000).toFixed(1)}k tokens — 可能使用了过重的模型或存在冗余。`,
      metric: `${totalMessages} 条消息，${(tokens / 1000).toFixed(1)}k tokens`,
      category: "成本",
      sessionId: sid,
      projectPath,
      date,
    });
  }

  // Rule 3: 单文件反复修改
  for (const edit of session.fileEdits) {
    if (edit.editCount > 5) {
      insights.push({
        severity: "actionable",
        title: "单文件反复修改",
        description: `文件 "${edit.filePath}" 在一个会话中被编辑了 ${edit.editCount} 次，可能存在反复调整。`,
        metric: `${edit.editCount} 次编辑：${edit.filePath}`,
        category: "效率",
        sessionId: sid,
        projectPath,
        date,
      });
    }
  }

  // Rule 4: 上下文窗口压力
  if (session.isCompacted) {
    insights.push({
      severity: "info",
      title: "上下文窗口压力",
      description: "会话被压缩（compacted），说明上下文窗口已满。",
      metric: "上下文已压缩",
      category: "健康",
      sessionId: sid,
      projectPath,
      date,
    });
  }

  // Rule 5: 会话中途切换模型
  if (session.models.length > 1) {
    const switchPath = session.models.join(" → ");
    insights.push({
      severity: "info",
      title: "会话中途切换模型",
      description: `会话切换了模型: ${switchPath}，可能表示不稳定或手动干预。`,
      metric: `切换路径: ${switchPath}`,
      category: "稳定性",
      sessionId: sid,
      projectPath,
      date,
    });
  }

  // Rule 6: 会话时长异常
  const durationMin = sessionDurationMinutes(session);
  if (durationMin !== null) {
    if (durationMin > 240) {
      insights.push({
        severity: "warning",
        title: "超长会话",
        description: `会话持续 ${Math.round(durationMin / 60)} 小时 ${Math.round(durationMin % 60)} 分钟，可能表示效率问题或卡住。`,
        metric: `${Math.round(durationMin / 60)}h ${Math.round(durationMin % 60)}m（估算时长）`,
        category: "时间",
        sessionId: sid,
        projectPath,
        date,
      });
    } else if (durationMin < 2) {
      insights.push({
        severity: "info",
        title: "超短会话",
        description: `会话仅持续 ${Math.round(durationMin * 60)} 秒，可能是误启动或立即放弃。`,
        metric: `${Math.round(durationMin * 60)}s（估算时长）`,
        category: "时间",
        sessionId: sid,
        projectPath,
        date,
      });
    }
  }

  // Rule 7: 工具效率异常
  const toolSummary = session.workContent?.toolCallSummary;
  if (toolSummary) {
    const bashCount = toolSummary["Bash"] ?? toolSummary["bash"] ?? 0;
    if (bashCount > 10 && session.fileEdits.length === 0) {
      insights.push({
        severity: "info",
        title: "高探索低产出",
        description: `会话执行了 ${bashCount} 次 Bash 命令但没有文件编辑产出 — 大量探索，少量产出。`,
        metric: `${bashCount} 次 Bash，0 次编辑`,
        category: "工具",
        sessionId: sid,
        projectPath,
        date,
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a deduplicated list of insights from work sessions.
 *
 * Rules with statistical thresholds (high-cost idle, inefficient session)
 * are only activated when ≥3 sessions are provided. Boolean rules
 * (compacted, model switch, duration, tool efficiency) always run.
 */
export function generateInsights(
  sessions: SessionWorkSummary[],
): Insight[] {
  if (sessions.length === 0) return [];

  const costs = sessions.map((s) => s.cost.totalUSD);
  const costMed = median(costs);
  const tokenMed = median(sessions.map((s) => totalTokens(s)));
  const hasEnoughForStats = sessions.length >= 3;

  // Run all rules for each session
  const rawInsights = sessions.flatMap((s) =>
    runRules(s, costMed, tokenMed, hasEnoughForStats),
  );

  // Deduplicate: merge same rule across sessions
  const buckets = new Map<string, Insight>();

  for (const raw of rawInsights) {
    const key = insightKey(raw.category, raw.title);
    const existing = buckets.get(key);
    if (existing) {
      existing.sessionIds.push(raw.sessionId);
      // Union projectPaths
      if (!existing.projectPaths.includes(raw.projectPath)) {
        existing.projectPaths.push(raw.projectPath);
      }
      // Widen dateRange
      if (raw.date !== undefined) {
        if (existing.dateRange === null) {
          existing.dateRange = { from: raw.date, to: raw.date };
        } else {
          if (raw.date < existing.dateRange.from) {
            existing.dateRange = { ...existing.dateRange, from: raw.date };
          }
          if (raw.date > existing.dateRange.to) {
            existing.dateRange = { ...existing.dateRange, to: raw.date };
          }
        }
      }
    } else {
      buckets.set(key, {
        severity: raw.severity,
        title: raw.title,
        description: raw.description,
        metric: raw.metric,
        category: raw.category,
        sessionIds: [raw.sessionId],
        projectPaths: [raw.projectPath],
        dateRange: raw.date !== undefined ? { from: raw.date, to: raw.date } : null,
      });
    }
  }

  // Rule 8: 会话碎片化（跨会话检测，需要 ≥6 会话）
  if (sessions.length >= 6) {
    const groups = new Map<string, SessionWorkSummary[]>();
    for (const s of sessions) {
      if (!s.startTime) continue;
      const date = s.startTime.slice(0, 10);
      const key = `${s.projectPath}::${date}`;
      const group = groups.get(key);
      if (group) {
        group.push(s);
      } else {
        groups.set(key, [s]);
      }
    }

    for (const [, groupSessions] of groups) {
      const shortSessions = groupSessions.filter((s) => {
        const dur = sessionDurationMinutes(s);
        return dur !== null && dur < 5;
      });

      if (shortSessions.length > 5) {
        const project = groupSessions[0].projectPath;
        const date = groupSessions[0].startTime!.slice(0, 10);
        const ids = shortSessions.map((s) => s.sessionId);
        buckets.set("效率::会话碎片化", {
          severity: "info",
          title: "会话碎片化",
          description: `项目 ${project} 在 ${date} 有 ${shortSessions.length} 个短会话（<5分钟），上下文可能反复丢失。`,
          metric: `${shortSessions.length} 个碎片化会话（${project}）`,
          category: "效率",
          sessionIds: ids,
          projectPaths: [project],
          dateRange: { from: date, to: date },
        });
      }
    }
  }

  return Array.from(buckets.values());
}
