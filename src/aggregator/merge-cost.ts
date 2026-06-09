import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionSummary } from "../types/index.js";

interface CostEntry {
  session_id?: string;
  estimated_cost_usd?: number;
}

/**
 * Read `~/.claude/metrics/costs.jsonl` and enrich session summaries
 * with authoritative per-request cost data.
 *
 * When costs.jsonl has entries for a session, those values are used
 * as the authoritative cost (source becomes "metrics" or "merged").
 */
export async function mergeCostData(
  summaries: SessionSummary[],
  claudeDir: string,
): Promise<SessionSummary[]> {
  const costMap = await loadCostsJsonl(claudeDir);

  return summaries.map((s) => {
    const metricsCost = costMap.get(s.sessionId);
    if (metricsCost === undefined) return s;

    const inlineCost = s.cost.totalUSD;

    // If both sources exist, take the higher value (metrics is authoritative)
    const finalCost = Math.max(inlineCost, metricsCost);

    return {
      ...s,
      cost: {
        ...s.cost,
        totalUSD: Math.round(finalCost * 100) / 100,
        source: inlineCost > 0 ? "merged" : "metrics",
        incomplete: false,
      },
    };
  });
}

async function loadCostsJsonl(
  claudeDir: string,
): Promise<Map<string, number>> {
  const costMap = new Map<string, number>();
  const costsPath = join(claudeDir, "metrics", "costs.jsonl");

  let content: string;
  try {
    content = await readFile(costsPath, "utf-8");
  } catch {
    return costMap; // No costs file — that's fine
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    try {
      const entry = JSON.parse(trimmed) as CostEntry;
      if (entry.session_id && typeof entry.estimated_cost_usd === "number") {
        costMap.set(
          entry.session_id,
          (costMap.get(entry.session_id) ?? 0) + entry.estimated_cost_usd,
        );
      }
    } catch {
      // Skip malformed lines
    }
  }

  return costMap;
}
