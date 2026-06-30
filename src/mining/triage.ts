/**
 * @file triage 规则 + dry-run 展示(决策 2)。
 *
 * deep-dive: ≥ minTurns 人类轮次 或 ≥ AUTONOMOUS_TURN_THRESHOLD 自主轮次。
 *
 * 注:设计决策 2 的 "≥3 子agent" P0 未实现 —— SessionSummary 无该字段
 * (见 design.md Open Questions);用 messageCounts 估算。
 */

import type {
  MiningDigest,
  TriagedSession,
  TriageResult,
  MineConfig,
} from "./types.js";

/** 自主轮次阈值(决策 2)。 */
export const AUTONOMOUS_TURN_THRESHOLD = 50;

/** 默认人类轮次阈值(决策 2)。 */
export const DEFAULT_MIN_TURNS = 3;

/** 对单个 digest 应用 triage 规则。 */
export function triageDigest(
  digest: MiningDigest,
  minTurns: number,
): TriagedSession {
  const human = digest.humanTurns;
  const auto = digest.autonomousTurns;
  if (human >= minTurns) {
    return {
      digest,
      tier: "deep-dive",
      reason: `${human} 人类轮次(≥${minTurns})`,
    };
  }
  if (auto >= AUTONOMOUS_TURN_THRESHOLD) {
    return {
      digest,
      tier: "deep-dive",
      reason: `${auto} 自主轮次(≥${AUTONOMOUS_TURN_THRESHOLD})`,
    };
  }
  return {
    digest,
    tier: "aggregate-only",
    reason: `${human} 人类 / ${auto} 自主(低于阈值)`,
  };
}

/** 批量 triage,返回分流结果。 */
export function triageAll(
  digests: MiningDigest[],
  config: MineConfig,
): TriageResult {
  const all = digests.map((d) => triageDigest(d, config.minTurns));
  return {
    all,
    deepDive: all.filter((t) => t.tier === "deep-dive"),
    aggregateOnly: all.filter((t) => t.tier === "aggregate-only"),
  };
}

/**
 * dry-run 展示:分流结果表(不调 LLM,决策 2)。
 * 借鉴 sessions-insights 的 "What was filtered out" 透明展示。
 */
export function formatTriageSummary(result: TriageResult): string {
  const lines: string[] = [];
  lines.push(`# Mining Triage`);
  lines.push("");
  lines.push(
    `**会话总数:** ${result.all.length} · **deep-dive:** ${result.deepDive.length} · **aggregate-only:** ${result.aggregateOnly.length}`,
  );
  lines.push("");
  lines.push(`## deep-dive(将进入挖掘)`);
  if (result.deepDive.length === 0) lines.push(`- (无)`);
  for (const t of result.deepDive) {
    lines.push(
      `- \`${t.digest.sessionId.slice(0, 8)}\` ${t.digest.projectName} — ${t.reason}`,
    );
  }
  lines.push("");
  lines.push(`## aggregate-only(已过滤,不挖)`);
  if (result.aggregateOnly.length === 0) lines.push(`- (无)`);
  for (const t of result.aggregateOnly) {
    lines.push(
      `- \`${t.digest.sessionId.slice(0, 8)}\` ${t.digest.projectName} — ${t.reason}`,
    );
  }
  return lines.join("\n");
}
