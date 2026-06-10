/**
 * LLM provider adapters for Anthropic and Ollama APIs.
 *
 * Each provider knows how to build an HTTP request and parse the response.
 * The summarize layer calls these adapters via the `LlmProvider` interface.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderKind = "anthropic" | "ollama";

export interface LlmProviderConfig {
  /** Model identifier (e.g. "claude-haiku-4-5-20251001" or "qwen3:8b") */
  model: string;
  /** API base URL (no trailing slash) */
  baseUrl: string;
  /** API key — required for Anthropic, optional for Ollama */
  apiKey?: string;
}

export interface LlmProvider {
  /** Build the URL and fetch init for a chat completion request. */
  buildRequest(
    prompt: string,
    config: LlmProviderConfig,
  ): { url: string; init: RequestInit };
  /** Extract the text content from a successful API response body. */
  parseResponse(body: unknown): string | null;
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

export const anthropicProvider: LlmProvider = {
  buildRequest(prompt: string, config: LlmProviderConfig) {
    const url = `${config.baseUrl}/v1/messages`;
    const body = {
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user" as const, content: prompt }],
    };
    return {
      url,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        },
        body: JSON.stringify(body),
      },
    };
  },

  parseResponse(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const content = b.content;
    if (!Array.isArray(content) || content.length === 0) return null;
    const first = content[0] as Record<string, unknown>;
    if (first.type === "text" && typeof first.text === "string") {
      return first.text.trim() || null;
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// Output cleaning — detect and strip leaked thinking/chain-of-thought
// ---------------------------------------------------------------------------

/**
 * Phrases that indicate the model is narrating its thought process
 * rather than producing a clean summary.
 */
const THINKING_PATTERNS = [
  /^(?:okay|alright|sure|well|let\s+me|let's|i'll|i\s+will|i\s+need\s+to)\b/i,
  /^(?:the\s+user'?s?\s+(?:main|primary|key)\s+intent|this\s+session\s+(?:is|was|shows|involves|appears))/i,
  /^(?:based\s+on|looking\s+at|from\s+the|analyzing)\b/i,
];

/**
 * Meta-narrative keywords — when several of these appear in the output,
 * the model is talking to itself rather than producing a summary.
 * Each is a regex that matches anywhere in the text.
 */
const META_NARRATIVE_MARKERS = [
  /\bi\s+need\s+to\b/i,
  /\bi\s+should\b/i,
  /\bwait[,.]?\b/i,
  /\bhm+m+[,.]?\b/i,
  /\blet\s+me\s+(?:check|think|look|analyze|review|re-?read|see)/i,
  /\blooking\s+back\b/i,
  /\bbut\s+(?:looking|the)\b/i,
  /\bmaybe\s+(?:the|user|i|it)/i,
  /\bso\s+the\s+(?:main|key|primary|outcome|result)\b/i,
  /\bi\s+(?:have\s+to|must|will)\s+(?:mention|include|provide|write|produce)\b/i,
];

/**
 * Lines that look like actual summary conclusions (not thinking).
 * A good summary starts with a verb or subject, describing what was done.
 */
const CONCLUSION_STARTS = [
  // Chinese
  /^(?:完成|修复|实现|添加|构建|创建|部署|优化|分析|确认|解决|更新|迁移|编写|配置|检查|定位|找到|查看)\b/,
  // English
  /^(?:fixed|added|implemented|created|built|deployed|updated|refactored|migrated|configured|resolved|verified|analyzed|confirmed|completed|wrote|set\s+up|checked|found)\b/i,
];

/**
 * Clean LLM output by detecting and removing leaked thinking/chain-of-thought.
 *
 * Some models (especially Qwen3) sometimes produce meta-commentary like
 * "Okay, let's tackle this summary..." instead of directly outputting
 * the summary. This function detects such patterns and extracts the
 * actual summary portion.
 */
export function cleanLlmOutput(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // Meta-narrative density check: if the output contains multiple self-talk
  // markers, the model is narrating its thinking process — reject entirely.
  const metaCount = META_NARRATIVE_MARKERS.reduce(
    (acc, re) => acc + (re.test(text) ? 1 : 0),
    0,
  );
  if (metaCount >= 3) return null;

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // If the entire text is short and doesn't start with thinking patterns,
  // trust it as-is (most common case — clean output).
  if (lines.length <= 2 && !THINKING_PATTERNS.some((p) => p.test(lines[0] ?? ""))) {
    return text;
  }

  // Look for the last line that starts with a conclusion verb
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (CONCLUSION_STARTS.some((p) => p.test(line))) {
      return line;
    }
  }

  // If first line is clearly thinking, try to extract the non-thinking part.
  // Often the model thinks first, then produces the actual summary at the end.
  if (THINKING_PATTERNS.some((p) => p.test(lines[0] ?? ""))) {
    // Return the last line as the best guess — usually the actual summary
    const last = lines[lines.length - 1]!;
    if (last.length >= 10) return last;

    // If even the last line is short/suspicious, return null (will use
    // reasoning fallback or heuristic instead)
    return null;
  }

  // No thinking detected — return as-is
  return text;
}

// ---------------------------------------------------------------------------
// Ollama provider (OpenAI-compatible chat completions)
// ---------------------------------------------------------------------------

export const ollamaProvider: LlmProvider = {
  buildRequest(prompt: string, config: LlmProviderConfig) {
    const url = `${config.baseUrl}/v1/chat/completions`;
    // Append /no_think to disable chain-of-thought for thinking models
    // (Qwen3, DeepSeek-R1, etc.). Models that don't support it will
    // simply ignore the instruction — harmless.
    const noThinkPrompt = prompt + "\n/no_think";
    const body = {
      model: config.model,
      max_tokens: 512,
      messages: [{ role: "user" as const, content: noThinkPrompt }],
      stream: false,
    };
    return {
      url,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    };
  },

  parseResponse(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const choices = b.choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const first = choices[0] as Record<string, unknown>;
    const message = first.message as Record<string, unknown> | undefined;
    if (!message) return null;

    // Standard OpenAI-compatible response
    if (typeof message.content === "string") {
      const cleaned = cleanLlmOutput(message.content);
      if (cleaned) return cleaned;
    }

    // Thinking/reasoning models (e.g. Qwen3.5, DeepSeek-R1) put the
    // actual output in `reasoning` when `content` is empty.  Scan for
    // lines that look like conclusions, strip thinking-chain noise,
    // and cap the fallback to avoid returning raw chain-of-thought.
    if (typeof message.reasoning === "string") {
      const reasoning = message.reasoning.trim();
      if (reasoning) {
        const MAX_REASONING_LEN = 500;
        const draftRe = /^Draft\s*\d+\s*:\s*/i;
        const bulletRe = /^\s*[-*]\s*/;
        // Lines that look like conclusions (English + Chinese)
        const conclusionRe =
          /^(?:In summary|Overall|The session|To summarize|In conclusion|In short|To conclude|\u603b\u7ed3|\u603b\u7684\u6765\u8bf4|\u7efc\u4e0a|\u6240\u4ee5|\u56e0\u6b64)/i;
        const lines = reasoning
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 10)
          .map((l) => l.replace(draftRe, "").replace(bulletRe, "").trim())
          .filter((l) => l.length > 5);

        // Prefer the last line that starts with a conclusion phrase
        const conclusionLine = [...lines].reverse().find((l) => conclusionRe.test(l));
        if (conclusionLine) return conclusionLine;

        // Otherwise prefer the last line that ends with a period (full sentence)
        const sentenceLine = [...lines].reverse().find((l) => /[.!?。！？]$/.test(l));
        if (sentenceLine) return sentenceLine;

        // Fallback: last cleaned line, if any
        if (lines.length > 0 && lines[lines.length - 1]!.length >= 10) {
          return lines[lines.length - 1]!;
        }

        // Raw reasoning truncated if nothing better found
        if (reasoning.length > MAX_REASONING_LEN) {
          return reasoning.slice(0, MAX_REASONING_LEN) + "\u2026";
        }
        // Too short to be useful
        return reasoning.length < 10 ? null : reasoning;
      }
    }

    return null;
  },
};

// ---------------------------------------------------------------------------
// Provider lookup
// ---------------------------------------------------------------------------

export function getProvider(kind: ProviderKind): LlmProvider {
  switch (kind) {
    case "anthropic":
      return anthropicProvider;
    case "ollama":
      return ollamaProvider;
  }
}
