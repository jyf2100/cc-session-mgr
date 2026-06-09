/**
 * Summarize module — LLM-powered session work summaries.
 *
 * Supports Anthropic and Ollama as providers.
 * Auto-detects provider when no explicit configuration is given.
 */

export { buildSummaryPrompt } from "./prompt.js";
export {
  type ProviderKind,
  type LlmProviderConfig,
  type LlmProvider,
} from "./providers.js";
export {
  summarizeSession,
  summarizeSessions,
  detectProvider,
} from "./summarize.js";
export type { SummarizeOptions } from "./summarize.js";
