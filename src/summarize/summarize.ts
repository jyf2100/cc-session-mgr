/**
 * LLM-based session summarization.
 *
 * Calls the configured provider (Anthropic or Ollama) to generate
 * a natural-language summary for each session. Falls back gracefully
 * when the API is unavailable or not configured.
 */

import type { SessionWorkSummary, WorkContent, FileEditEntry } from "../types/index.js";
import type { ProviderKind, LlmProviderConfig } from "./providers.js";
import { getProvider } from "./providers.js";
import { buildSummaryPrompt, buildProjectWeeklyPrompt } from "./prompt.js";
import { loadCache, saveCache, getCachedSummary, setCachedSummary, pruneCache } from "./cache.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummarizeOptions {
  /** Which LLM provider to use */
  provider: ProviderKind;
  /** Provider-specific configuration */
  config: LlmProviderConfig;
}

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

/**
 * Auto-detect the best available LLM provider.
 *
 * Priority:
 * 1. Anthropic (if ANTHROPIC_API_KEY is set)
 * 2. Ollama (if http://localhost:11434 responds)
 * 3. null (no provider available)
 */
export async function detectProvider(): Promise<{
  provider: ProviderKind;
  config: LlmProviderConfig;
} | null> {
  // Check Anthropic first
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  if (anthropicKey) {
    return {
      provider: "anthropic",
      config: {
        model: process.env["LLM_MODEL"] ?? "claude-haiku-4-5-20251001",
        baseUrl: process.env["LLM_BASE_URL"] ?? "https://api.anthropic.com",
        apiKey: anthropicKey,
      },
    };
  }

  // Check Ollama
  const ollamaUrl = process.env["LLM_BASE_URL"] ?? "http://localhost:11434";
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const model = process.env["LLM_MODEL"];
      if (!model) {
        process.stderr.write(
          "Ollama detected but no model specified. Use --llm-model <name> to enable.\n",
        );
        return null;
      }
      return {
        provider: "ollama",
        config: { model, baseUrl: ollamaUrl },
      };
    }
  } catch {
    // Ollama not running — skip silently
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a session has no meaningful work content. */
function isEmptyWorkContent(wc: WorkContent, fileEdits: FileEditEntry[]): boolean {
  return (
    wc.primaryIntent === "Untitled session" &&
    wc.userIntents.length === 0 &&
    Object.keys(wc.toolCallSummary).length === 0 &&
    wc.bashCommands.length === 0 &&
    wc.moduleSummary.length === 0 &&
    wc.assistantSnippets.length === 0 &&
    !wc.compactedSummary &&
    fileEdits.length === 0
  );
}

// Single session summarization
// ---------------------------------------------------------------------------

/**
 * Generate an LLM summary for a single session.
 *
 * Returns the summary text, or null if the session has no content,
 * the API call fails, or retries are exhausted.
 */
export async function summarizeSession(
  session: SessionWorkSummary,
  options: SummarizeOptions,
): Promise<string | null> {
  const wc = session.workContent;

  // Skip empty sessions
  if (isEmptyWorkContent(wc, session.fileEdits)) {
    return null;
  }

  const provider = getProvider(options.provider);
  const prompt = buildSummaryPrompt(session);
  const { url, init } = provider.buildRequest(prompt, options.config);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        process.stderr.write(
          `LLM API error: ${response.status} ${response.statusText}\n`,
        );
        return null;
      }

      const body: unknown = await response.json();
      const result = provider.parseResponse(body);
      if (!result) {
        const keys = body && typeof body === "object" ? Object.keys(body as Record<string, unknown>).join(", ") : String(body);
        process.stderr.write(
          `LLM parseWarning: response missing expected text. Keys: ${keys}\n`,
        );
      }
      return result;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `LLM API error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${message}\n`,
      );
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Batch summarization
// ---------------------------------------------------------------------------

/**
 * Generate LLM summaries for a list of sessions (sequential).
 *
 * Mutates `session.workContent.llmSummary` in place for each session.
 * Silently skips sessions that fail or have no content.
 *
 * When `claudeDir` is provided, reads and writes a per-session summary cache
 * so that daily and weekly reports share results without redundant API calls.
 */
export async function summarizeSessions(
  sessions: SessionWorkSummary[],
  options: SummarizeOptions,
  claudeDir?: string,
): Promise<void> {
  let cache = claudeDir ? await loadCache(claudeDir) : null;
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let cached = 0;
  const total = sessions.length;
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const tag = `[${i + 1}/${total}]`;

    // Check cache first
    const cachedSummary = cache
      ? getCachedSummary(cache, session.sessionId)
      : null;
    if (cachedSummary !== null) {
      cached++;
      session.workContent.llmSummary = cachedSummary;
      process.stderr.write(`${tag} CACHED ${cachedSummary}\n`);
      continue;
    }

    const summary = await summarizeSession(session, options);
    if (summary === null) {
      const isEmpty = isEmptyWorkContent(session.workContent, session.fileEdits);
      if (isEmpty) {
        skipped++;
        process.stderr.write(`${tag} SKIP  ${session.workContent.primaryIntent}\n`);
      } else {
        failed++;
        process.stderr.write(`${tag} FAIL  ${session.workContent.primaryIntent}\n`);
      }
    } else {
      ok++;
      process.stderr.write(`${tag} OK    ${summary}\n`);
      if (cache) {
        cache = setCachedSummary(cache, session.sessionId, summary);
      }
    }
    session.workContent.llmSummary = summary;
  }

  // Persist cache if enabled
  if (cache && claudeDir) {
    cache = pruneCache(cache);
    await saveCache(claudeDir, cache);
  }

  const parts = [`${ok} summarized`];
  if (cached > 0) parts.push(`${cached} cached`);
  parts.push(`${failed} failed`, `${skipped} empty/skipped`);
  process.stderr.write(`Summary: ${parts.join(", ")}\n`);
}

// ---------------------------------------------------------------------------
// Project-level weekly summarization
// ---------------------------------------------------------------------------

/**
 * Generate a project-level weekly summary using per-session summaries
 * as input. Calls `buildProjectWeeklyPrompt` to construct the prompt,
 * then sends it through the configured LLM provider.
 *
 * Returns the summary text, or null on failure.
 */
export async function summarizeProjectWeekly(
  projectName: string,
  sessions: SessionWorkSummary[],
  options: SummarizeOptions,
): Promise<string | null> {
  const provider = getProvider(options.provider);
  const prompt = buildProjectWeeklyPrompt(projectName, sessions);
  const { url, init } = provider.buildRequest(prompt, options.config);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        process.stderr.write(
          `Project LLM API error: ${response.status} ${response.statusText}\n`,
        );
        return null;
      }

      const body: unknown = await response.json();
      const result = provider.parseResponse(body);
      if (!result) {
        process.stderr.write(
          `Project LLM parseWarning: response missing expected text.\n`,
        );
      }
      return result;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `Project LLM API error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${message}\n`,
      );
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return null;
    }
  }

  return null;
}
