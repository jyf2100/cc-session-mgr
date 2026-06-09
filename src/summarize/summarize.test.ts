import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SessionWorkSummary, WorkContent } from "../types/index.js";
import { summarizeSession, summarizeSessions } from "./summarize.js";
import type { SummarizeOptions } from "./summarize.js";
import { anthropicProvider, ollamaProvider } from "./providers.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWorkContent(overrides?: Partial<WorkContent>): WorkContent {
  return {
    primaryIntent: "Build auth module",
    userIntents: ["Add login page"],
    toolCallSummary: { Write: 2, Edit: 1 },
    bashCommands: ["npm test"],
    moduleSummary: ["auth (2)"],
    assistantSnippets: ["Created auth module."],
    compactedSummary: null,
    llmSummary: null,
    ...overrides,
  };
}

function makeSession(
  overrides?: Partial<SessionWorkSummary>,
): SessionWorkSummary {
  return {
    sessionId: "s1",
    projectPath: "/proj/test",
    encodedDir: "-proj-test",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T11:00:00Z",
    messageCounts: { user: 1, assistant: 1, system: 0, other: 0 },
    cost: {
      totalUSD: 0,
      source: "inline",
      incomplete: false,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: [],
    fileEdits: [{ filePath: "src/auth/login.ts", editCount: 2 }],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    workContent: makeWorkContent(),
    ...overrides,
  };
}

const anthropicOptions: SummarizeOptions = {
  provider: "anthropic",
  config: {
    model: "claude-haiku-4-5-20251001",
    baseUrl: "https://api.anthropic.com",
    apiKey: "test-key",
  },
};

const ollamaOptions: SummarizeOptions = {
  provider: "ollama",
  config: {
    model: "qwen3:8b",
    baseUrl: "http://localhost:11434",
  },
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(response: {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    statusText: response.ok ? "OK" : "Error",
    json:
      response.json ??
      (() => Promise.resolve(null)),
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Anthropic provider tests
// ---------------------------------------------------------------------------

describe("summarizeSession (Anthropic)", () => {
  it("returns summary on successful API call", async () => {
    mockFetch({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [
            {
              type: "text",
              text: "Built the authentication module with login and session management.",
            },
          ],
        }),
    });

    const result = await summarizeSession(makeSession(), anthropicOptions);
    expect(result).toBe(
      "Built the authentication module with login and session management.",
    );
  });

  it("sends correct Anthropic request format", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: "Summary" }],
        }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await summarizeSession(makeSession(), anthropicOptions);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toHaveProperty("x-api-key", "test-key");
    expect(init.headers).toHaveProperty("anthropic-version", "2023-06-01");
  });

  it("returns null on API error", async () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    mockFetch({ ok: false, status: 500 });

    const result = await summarizeSession(makeSession(), anthropicOptions);
    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("returns null for empty session", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const emptySession = makeSession({
      workContent: makeWorkContent({
        primaryIntent: "Untitled session",
        userIntents: [],
        toolCallSummary: {},
        bashCommands: [],
        moduleSummary: [],
        assistantSnippets: [],
        compactedSummary: null,
      }),
      fileEdits: [],
    });

    const result = await summarizeSession(emptySession, anthropicOptions);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Ollama provider tests
// ---------------------------------------------------------------------------

describe("summarizeSession (Ollama)", () => {
  it("returns summary on successful API call", async () => {
    mockFetch({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                role: "assistant",
                content: "实现了认证模块，包含登录和会话管理功能。",
              },
            },
          ],
        }),
    });

    const result = await summarizeSession(makeSession(), ollamaOptions);
    expect(result).toBe("实现了认证模块，包含登录和会话管理功能。");
  });

  it("sends correct Ollama request format", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { role: "assistant", content: "Summary" } }],
        }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await summarizeSession(makeSession(), ollamaOptions);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    // No auth header for Ollama
    expect(init.headers).not.toHaveProperty("x-api-key");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("qwen3:8b");
    expect(body.stream).toBe(false);
  });

  it("returns null on API error", async () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    mockFetch({ ok: false, status: 500 });

    const result = await summarizeSession(makeSession(), ollamaOptions);
    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Provider adapter unit tests
// ---------------------------------------------------------------------------

describe("provider adapters", () => {
  it("Anthropic parseResponse extracts text", () => {
    const body = { content: [{ type: "text", text: "Hello world" }] };
    expect(anthropicProvider.parseResponse(body)).toBe("Hello world");
  });

  it("Anthropic parseResponse returns null for empty content", () => {
    expect(anthropicProvider.parseResponse({ content: [] })).toBeNull();
    expect(anthropicProvider.parseResponse(null)).toBeNull();
  });

  it("Ollama parseResponse extracts text", () => {
    const body = {
      choices: [{ message: { role: "assistant", content: "Hello world" } }],
    };
    expect(ollamaProvider.parseResponse(body)).toBe("Hello world");
  });

  it("Ollama parseResponse returns null for empty choices", () => {
    expect(ollamaProvider.parseResponse({ choices: [] })).toBeNull();
    expect(ollamaProvider.parseResponse(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Retry tests
// ---------------------------------------------------------------------------

describe("retry on 429", () => {
  it("retries up to 3 times on rate limit", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: "text", text: "Success after retry" }],
          }),
      });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await summarizeSession(makeSession(), anthropicOptions);
    expect(result).toBe("Success after retry");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  }, 10000);

  it("returns null after exhausting retries", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await summarizeSession(makeSession(), anthropicOptions);
    expect(result).toBeNull();
    // Initial + 3 retries = 4 calls
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  }, 15000);
});

// ---------------------------------------------------------------------------
// Batch tests
// ---------------------------------------------------------------------------

describe("summarizeSessions", () => {
  it("summarizes multiple sessions sequentially", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => {
        callCount++;
        return Promise.resolve({
          content: [{ type: "text", text: `Summary ${callCount}` }],
        });
      },
    }) as unknown as typeof fetch;

    const sessions = [makeSession(), makeSession(), makeSession()];
    await summarizeSessions(sessions, anthropicOptions);

    expect(sessions[0].workContent.llmSummary).toBe("Summary 1");
    expect(sessions[1].workContent.llmSummary).toBe("Summary 2");
    expect(sessions[2].workContent.llmSummary).toBe("Summary 3");
  });

  it("sets null on failed session without stopping others", async () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Error",
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: "text", text: `Summary ${callCount}` }],
          }),
      });
    }) as unknown as typeof fetch;

    const sessions = [makeSession(), makeSession(), makeSession()];
    await summarizeSessions(sessions, anthropicOptions);

    expect(sessions[0].workContent.llmSummary).toContain("Summary");
    expect(sessions[1].workContent.llmSummary).toBeNull();
    expect(sessions[2].workContent.llmSummary).toContain("Summary");
    expect(stderrSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Ollama reasoning fallback tests
// ---------------------------------------------------------------------------

describe("Ollama parseResponse reasoning fallback", () => {
  it("extracts from reasoning when content is empty", () => {
    const body = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            reasoning:
              "Let me think about this.\nThe user built a session manager with CLI tools.\n实现了一个会话管理器CLI工具。",
          },
        },
      ],
    };
    expect(ollamaProvider.parseResponse(body)).toBe(
      "实现了一个会话管理器CLI工具。",
    );
  });

  it("strips Draft N: prefixes from reasoning lines", () => {
    const body = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            reasoning:
              "Draft 1: Some initial thought about the session\nDraft 2: Refactored the parser module with new utilities\nDraft 3: Final summary of the parser refactoring work",
          },
        },
      ],
    };
    const result = ollamaProvider.parseResponse(body);
    expect(result).toBe("Final summary of the parser refactoring work");
  });

  it("handles reasoning with only short lines gracefully", () => {
    const body = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            reasoning: "ok\nyes\nhmm\ndone",
          },
        },
      ],
    };
    // All lines are short (< 10 chars), so filters remove them;
    // falls back to returning the full reasoning text
    const result = ollamaProvider.parseResponse(body);
    expect(result).toBe("ok\nyes\nhmm\ndone");
  });

  it("returns null when both content and reasoning are empty", () => {
    const body = {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            reasoning: "",
          },
        },
      ],
    };
    expect(ollamaProvider.parseResponse(body)).toBeNull();
  });
});
