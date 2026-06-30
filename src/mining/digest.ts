/**
 * @file 阶段① digest 生成 + worktree 归一(决策 12)。
 *
 * 从 SessionWorkSummary 构建 compact digest(确定性,无 LLM,不读原始 entries)。
 */

import type { MiningDigest } from "./types.js";
import type { SessionWorkSummary } from "../types/index.js";

/**
 * worktree 归一(决策 12):路径含 `worktrees` / `worktree` 段的,
 * 归并到主项目 basename。
 */
export function normalizeProjectName(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  const wtIdx = parts.findIndex((p) => p === "worktrees" || p === "worktree");
  // worktree 模式:<project>/.claude/worktrees/<name> —— 取 worktrees 前、跳过 .claude
  const relevant = (wtIdx >= 0 ? parts.slice(0, wtIdx) : parts).filter(
    (p) => p !== ".claude",
  );
  return relevant[relevant.length - 1] ?? projectPath;
}

/** 计算会话时长(ms);起止缺失或无效返回 0。 */
function durationMsBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, e - s);
}

/**
 * 从 SessionWorkSummary 构建 compact digest。
 * 仅用 summary 已有字段(快、确定性);工具序列来自 toolCallSummary 的键集合
 * (严格时序在阶段② 对 deep-dive 会话用 loadSessionEntries 取)。
 */
export function buildDigest(summary: SessionWorkSummary): MiningDigest {
  const mc = summary.messageCounts;
  const tools = Object.keys(summary.workContent.toolCallSummary);
  const topics = [
    summary.workContent.primaryIntent,
    ...summary.workContent.userIntents,
  ]
    .filter((s) => s.trim().length > 0)
    .slice(0, 5);

  return {
    sessionId: summary.sessionId,
    projectName: normalizeProjectName(summary.projectPath),
    projectPath: summary.projectPath,
    summary,
    humanTurns: mc.user,
    autonomousTurns: mc.assistant,
    toolSequence: tools,
    durationMs: durationMsBetween(summary.startTime, summary.endTime),
    topics,
    entryCount: mc.user + mc.assistant + mc.system + mc.other,
  };
}

/** 批量构建 digest。 */
export function buildDigests(summaries: SessionWorkSummary[]): MiningDigest[] {
  return summaries.map(buildDigest);
}
