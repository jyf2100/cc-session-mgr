import type { CostInfo } from "../types/index.js";

/**
 * Format a USD cost value for display.
 * Always shows exactly 2 decimal places with a $ prefix.
 */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/**
 * Format a token count for display.
 * Uses K for thousands, M for millions.
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return String(tokens);
}

/**
 * Format cost with token stats: "$X.XX (N in / M out)"
 */
export function formatCostWithTokens(cost: CostInfo): string {
  const costStr = formatCost(cost.totalUSD);
  if (cost.inputTokens === 0 && cost.outputTokens === 0) {
    return costStr;
  }
  const inStr = formatTokenCount(cost.inputTokens);
  const outStr = formatTokenCount(cost.outputTokens);
  return `${costStr} (${inStr} in / ${outStr} out)`;
}
