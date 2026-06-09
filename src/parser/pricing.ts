/**
 * Model pricing table and cost estimation utilities.
 *
 * Prices are per 1M tokens (USD). When the model name is not found
 * exactly, the longest matching prefix is used. Unknown models
 * default to zero pricing.
 */

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPer1M: number;
  /** USD per 1M output tokens */
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude — June 2026 public pricing
  "claude-opus-4-8": { inputPer1M: 15, outputPer1M: 75 },
  "claude-opus-4-7": { inputPer1M: 15, outputPer1M: 75 },
  "claude-opus-4-6": { inputPer1M: 15, outputPer1M: 75 },
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-4-5": { inputPer1M: 0.8, outputPer1M: 4 },

  // OpenAI — approximate
  "gpt-4.1": { inputPer1M: 2, outputPer1M: 8 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "o3": { inputPer1M: 2, outputPer1M: 8 },
  "o4-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },

  // Google
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },

  // Others — unknown pricing, show tokens only
  "glm-5.1": { inputPer1M: 0, outputPer1M: 0 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 0, outputPer1M: 0 };

/**
 * Look up pricing for a model name.
 * Uses longest-prefix match (e.g. "claude-sonnet-4-6-20250514" → "claude-sonnet-4-6").
 */
export function getPricing(modelName: string): ModelPricing {
  // Exact match
  if (PRICING[modelName]) return PRICING[modelName];

  // Longest prefix match
  let bestMatch = "";
  for (const key of Object.keys(PRICING)) {
    if (modelName.startsWith(key) && key.length > bestMatch.length) {
      bestMatch = key;
    }
  }

  return bestMatch ? PRICING[bestMatch] : DEFAULT_PRICING;
}

/**
 * Estimate USD cost from token counts and model pricing.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
): number {
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M;
  return Math.round(cost * 100) / 100;
}
