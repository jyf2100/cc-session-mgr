import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SessionWorkSummary, WorkContent } from "../types/index.js";
import { summarizeSession, summarizeSessions, summarizeProjectWeekly } from "./summarize.js";
import type { SummarizeOptions } from "./summarize.js";
import { anthropicProvider, ollamaProvider, cleanLlmOutput } from "./providers.js";

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

// ---------------------------------------------------------------------------
// Cache integration tests
// ---------------------------------------------------------------------------

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("summarizeSessions with cache", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = join(tmpdir(), `cc-test-cache-${Date.now()}`);
    await mkdir(cacheDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("uses cached summary instead of calling LLM", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: "Fresh summary" }],
        }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const session = makeSession({ sessionId: "cached-session-1" });

    // First call: populates cache
    await summarizeSessions([session], anthropicOptions, cacheDir);
    expect(session.workContent.llmSummary).toBe("Fresh summary");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Reset llmSummary and call again
    session.workContent.llmSummary = null;
    fetchSpy.mockClear();

    await summarizeSessions([session], anthropicOptions, cacheDir);
    expect(session.workContent.llmSummary).toBe("Fresh summary");
    // Should NOT have called fetch — cached hit
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes new summaries to cache after LLM call", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: "New summary" }],
        }),
    }) as unknown as typeof fetch;

    const session = makeSession({ sessionId: "new-session-xyz" });
    await summarizeSessions([session], anthropicOptions, cacheDir);

    expect(session.workContent.llmSummary).toBe("New summary");

    // Verify cache file exists and contains the summary
    const { readFile } = await import("node:fs/promises");
    const cachePath = join(cacheDir, "cc-session-mgr", "cache", "summaries.json");
    const raw = await readFile(cachePath, "utf-8");
    const cache = JSON.parse(raw) as Record<string, unknown>;
    expect(cache.entries).toHaveProperty("new-session-xyz", "New summary");
  });

  it("works without cache when claudeDir is omitted", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: "No cache summary" }],
        }),
    }) as unknown as typeof fetch;

    const sessions = [makeSession(), makeSession()];
    await summarizeSessions(sessions, anthropicOptions);

    // Both sessions should have been summarized via LLM
    expect(sessions[0].workContent.llmSummary).toBe("No cache summary");
    expect(sessions[1].workContent.llmSummary).toBe("No cache summary");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// summarizeProjectWeekly tests
// ---------------------------------------------------------------------------

describe("summarizeProjectWeekly", () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  it("returns project summary on successful API call", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [
            { type: "text", text: "Refactored the entire parser pipeline and added caching." },
          ],
        }),
    }) as unknown as typeof fetch;

    const sessions = [
      makeSession({
        startTime: "2026-06-08T10:00:00Z",
        workContent: makeWorkContent({ primaryIntent: "Add cache" }),
      }),
      makeSession({
        startTime: "2026-06-09T10:00:00Z",
        workContent: makeWorkContent({ primaryIntent: "Refactor parser" }),
      }),
    ];

    const result = await summarizeProjectWeekly(
      "/proj/cc-session-mgr",
      sessions,
      anthropicOptions,
    );

    expect(result).toBe("Refactored the entire parser pipeline and added caching.");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }) as unknown as typeof fetch;

    const result = await summarizeProjectWeekly(
      "/proj/test",
      [makeSession()],
      anthropicOptions,
    );

    expect(result).toBeNull();
  });

  it("sends correct provider format for Ollama", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { role: "assistant", content: "项目级摘要" } }],
        }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await summarizeProjectWeekly(
      "/proj/test",
      [makeSession()],
      ollamaOptions,
    );

    expect(result).toBe("项目级摘要");
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
  });
});

// ---------------------------------------------------------------------------
// cleanLlmOutput — leaked thinking detection
// ---------------------------------------------------------------------------

describe("cleanLlmOutput", () => {
  it("returns clean summaries unchanged", () => {
    const summary = "修复了登录页面的认证逻辑，优化了Token刷新机制。";
    expect(cleanLlmOutput(summary)).toBe(summary);
  });

  it("returns null for leaked chain-of-thought (meta-narrative)", () => {
    const leaked =
      "So, the main outcome is that the assistant helped the user find the correct commands to locate Ollama's logs on macOS. I need to mention the methods provided and the conclusion about the App running without logs. Wait, the user's primary intent was in Chinese, so the summary should be in Chinese. Hmm, maybe the user's messages are in Chinese. Let me check the original query again.";
    expect(cleanLlmOutput(leaked)).toBeNull();
  });

  it("returns null for English self-talk patterns", () => {
    const selfTalk =
      "Let me think about this. The user wants to build a session manager. I should mention the CLI tools. Actually, looking at the code, the parser module was refactored. I need to summarize this properly.";
    expect(cleanLlmOutput(selfTalk)).toBeNull();
  });

  it("preserves summaries with occasional 'I' references", () => {
    // A real summary might contain "I" once — that's fine, not meta-narrative
    const ok = "The assistant configured the CI pipeline and I verified the deployment was successful.";
    expect(cleanLlmOutput(ok)).toBe(ok);
  });

  it("strips thinking prefix, keeps trailing conclusion", () => {
    const mixed =
      "Okay let me analyze this session.\nFixed the authentication module and added JWT token refresh.";
    // Should extract the conclusion line
    const result = cleanLlmOutput(mixed);
    expect(result).toBe("Fixed the authentication module and added JWT token refresh.");
  });

  it("returns null for empty input", () => {
    expect(cleanLlmOutput("")).toBeNull();
    expect(cleanLlmOutput("   ")).toBeNull();
  });

  it("returns short clean text as-is", () => {
    const short = "配置了Ollama的日志输出路径";
    expect(cleanLlmOutput(short)).toBe(short);
  });
});
