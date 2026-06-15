/**
 * Report module — generate Markdown insights section from analytics results.
 *
 * Pure function: typed analytics data in → Markdown string out.
 */

import type {
  Insight,
  CostAnomalyResult,
  ModelComparison,
  CostAuditReport,
} from "../types/index.js";
import path from "node:path";

/** Input bundle for the insights report generator. */
export interface InsightsReportInput {
  insights: Insight[];
  anomalyResult: CostAnomalyResult;
  modelComparisons: ModelComparison[];
  auditReport: CostAuditReport;
}

const SEVERITY_EMOJI: Record<Insight["severity"], string> = {
  info: "ℹ️",
  warning: "⚠️",
  actionable: "🔴",
};

/** Format a context line showing project names, date range, and session count. */
function formatInsightContext(i: Insight): string {
  const parts: string[] = [];

  // Project names (basename, truncate >3)
  if (i.projectPaths.length > 0) {
    const names = i.projectPaths.map((p) => path.basename(p));
    if (names.length <= 3) {
      parts.push(`📁 ${names.join("、")}`);
    } else {
      const shown = names.slice(0, 3).join("、");
      parts.push(`📁 ${shown} 等 ${names.length} 个`);
    }
  }

  // Date range
  if (i.dateRange !== null) {
    const from = i.dateRange.from.slice(5); // MM-DD
    const to = i.dateRange.to.slice(5);
    if (from === to) {
      parts.push(`📅 ${i.dateRange.from}`);
    } else {
      parts.push(`📅 ${from} ~ ${to}`);
    }
  }

  // Session count
  parts.push(`${i.sessionIds.length} 个会话`);

  return parts.join(" · ");
}

/**
 * Generate a Markdown insights section from all analytics results.
 *
 * @param data - Aggregated analytics output.
 * @returns Markdown string (may be empty if there is nothing to report).
 */
export function generateInsightsReport(data: InsightsReportInput): string {
  const sections: string[] = [];

  // --- Insights list ---
  if (data.insights.length > 0) {
    const lines = data.insights.map((i) => {
      const emoji = SEVERITY_EMOJI[i.severity];
      const main = `- ${emoji} **${i.title}** — ${i.description} _(${i.category})_`;
      const ctx = formatInsightContext(i);
      return ctx ? `${main}\n  ${ctx}` : main;
    });
    sections.push("### 🔍 关键洞察\n\n" + lines.join("\n"));
  }

  // --- Cost anomalies ---
  if (!data.anomalyResult.insufficientData && data.anomalyResult.anomalies.length > 0) {
    const rows = data.anomalyResult.anomalies.map((a) => {
      const costStr = a.cost.toFixed(2);
      const expectedStr = a.expectedCost.toFixed(2);
      const zStr = a.zScore.toFixed(1);
      return `| ${a.date} | $${costStr} | $${expectedStr} | ${zStr} | ${a.attribution.type} |`;
    });
    sections.push(
      "### 📉 成本异常\n\n" +
        "| 日期 | 实际成本 | 预期成本 | Z-Score | 归因 |\n" +
        "| --- | --- | --- | --- | --- |\n" +
        rows.join("\n")
    );
  }

  // --- Model comparison table ---
  if (data.modelComparisons.length > 0) {
    const rows = data.modelComparisons.map((m) => {
      const costStr = m.totalCost.toFixed(2);
      const avgStr = m.avgCostPerSession.toFixed(2);
      const ratioStr = m.outputInputRatio.toFixed(2);
      return `| ${m.model} | ${m.sessionCount} | $${costStr} | $${avgStr} | ${ratioStr} | ${m.multiModelSessionCount} |`;
    });
    sections.push(
      "### 🤖 模型对比\n\n" +
        "| 模型 | 会话数 | 总成本 | 平均成本 | 输出/输入比 | 多模型会话 |\n" +
        "| --- | --- | --- | --- | --- | --- |\n" +
        rows.join("\n")
    );
  }

  // --- Cost data audit ---
  const audit = data.auditReport;
  if (audit.totalSessions > 0) {
    const trustEmoji =
      audit.trustLevel === "high" ? "🟢" :
      audit.trustLevel === "medium" ? "🟡" : "🔴";
    sections.push(
      "### 🔐 成本数据质量\n\n" +
        `- **信任等级**: ${trustEmoji} ${audit.trustLevel.toUpperCase()}\n` +
        `- **总会话数**: ${audit.totalSessions}\n` +
        `- **来源分布**: inline ${audit.sourceDistribution.inline}, metrics ${audit.sourceDistribution.metrics}, merged ${audit.sourceDistribution.merged}\n` +
        `- **不完整率**: ${(audit.incompleteRate * 100).toFixed(1)}%\n` +
        `- **估算率**: ${(audit.isEstimatedRate * 100).toFixed(1)}%`
    );
  }

  if (sections.length === 0) return "";
  return "## 💡 洞察\n\n" + sections.join("\n\n");
}
