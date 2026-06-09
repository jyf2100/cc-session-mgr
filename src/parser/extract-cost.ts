import type { JsonlEntry, CostInfo } from "../types/index.js";
import { getPricing, estimateCost } from "./pricing.js";

/**
 * Extract and sum cost data from assistant entries in a session.
 *
 * Primary path: read `costUSD` from top-level field (Anthropic models).
 * Fallback path: read `message.usage` token counts and estimate cost
 * using the model pricing table.
 */
export function extractCostData(entries: JsonlEntry[]): CostInfo {
  let totalUSD = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let assistantWithCost = 0;
  let assistantTotal = 0;
  let isEstimated = false;
  let lastModel = "";

  for (const entry of entries) {
    if (entry.type !== "assistant") continue;

    assistantTotal++;

    // Collect model name from message.model or entry.model
    const model =
      (entry.message as Record<string, unknown> | undefined)?.model ??
      entry.model ??
      "";
    if (typeof model === "string" && model) {
      lastModel = model;
    }

    // Primary: top-level costUSD
    if (typeof entry.costUSD === "number") {
      totalUSD += entry.costUSD;
      assistantWithCost++;
      continue;
    }

    // Fallback: message.usage tokens
    const usage = (entry.message as Record<string, unknown> | undefined)
      ?.usage as Record<string, unknown> | undefined;

    if (usage) {
      const inTok =
        typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
      const outTok =
        typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
      const cacheTok =
        typeof usage.cache_read_input_tokens === "number"
          ? usage.cache_read_input_tokens
          : 0;

      inputTokens += inTok;
      outputTokens += outTok;
      cacheReadTokens += cacheTok;
      isEstimated = true;
    }
  }

  // Estimate cost from tokens when no direct costUSD was found
  if (isEstimated && assistantWithCost === 0) {
    const pricing = getPricing(lastModel);
    totalUSD = estimateCost(inputTokens, outputTokens, pricing);
  }

  return {
    totalUSD: Math.round(totalUSD * 100) / 100,
    source: "inline",
    incomplete: assistantTotal > 0 && assistantWithCost < assistantTotal,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    isEstimated,
  };
}
