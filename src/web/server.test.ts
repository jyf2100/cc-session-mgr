import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { startServer } from "./server.js";
import type { SessionSummary } from "../types/index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSummary(
  overrides: Partial<SessionSummary> & { sessionId: string },
): SessionSummary {
  return {
    projectPath: "/home/dev/app",
    encodedDir: "-home-dev-app",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T10:30:00Z",
    messageCounts: { user: 3, assistant: 3, system: 0, other: 0 },
    cost: {
      totalUSD: 0.05,
      source: "inline",
      incomplete: false,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: ["claude-sonnet-4-6"],
    fileEdits: [],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    ...overrides,
  };
}

async function fetchJson(port: number, path: string): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const data = await res.json();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  return { status: res.status, headers, data };
}

async function fetchHtml(port: number, path: string): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  return { status: res.status, headers, text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Web server", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    port = 13456 + Math.floor(Math.random() * 1000);
    const summaries = [
      makeSummary({ sessionId: "aaa11111-2222-3333", projectPath: "/home/dev/my-project" }),
      makeSummary({ sessionId: "bbb44444-5555-6666", projectPath: "/home/dev/other-project" }),
    ];
    server = startServer(summaries, port, "/fake/claude");
    await new Promise<void>((resolve) => {
      server.on("listening", () => resolve());
    });
  });

  afterAll(() => {
    server.close();
  });

  it("serves HTML for GET /", async () => {
    const { status, headers, text } = await fetchHtml(port, "/");
    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("text/html");
    expect(text).toContain("Claude Code Session Browser");
  });

  it("returns JSON projects for GET /api/projects", async () => {
    const { status, headers, data } = await fetchJson(port, "/api/projects");
    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("application/json");
    const projects = data as { name: string; sessionCount: number }[];
    expect(projects.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i - 1].sessionCount).toBeGreaterThanOrEqual(projects[i].sessionCount);
    }
  });

  it("returns JSON sessions with project filter", async () => {
    const { status, data } = await fetchJson(port, "/api/sessions?project=my-project");
    expect(status).toBe(200);
    const sessions = data as { id: string; project: string }[];
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    for (const s of sessions) {
      expect(s.project).toBe("my-project");
    }
  });

  it("returns JSON sessions with date filter", async () => {
    const { status, data } = await fetchJson(port, "/api/sessions?from=2026-06-09&to=2026-06-09");
    expect(status).toBe(200);
    const sessions = data as { id: string }[];
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns session detail for GET /api/sessions/:id", async () => {
    const { status, data } = await fetchJson(port, "/api/sessions/aaa11111");
    expect(status).toBe(200);
    const detail = data as { id: string; fileEdits: unknown[] };
    expect(detail.id).toBe("aaa11111-2222-3333");
    expect(Array.isArray(detail.fileEdits)).toBe(true);
  });

  it("returns 404 for unknown session prefix", async () => {
    const { status, data } = await fetchJson(port, "/api/sessions/nonexistent");
    expect(status).toBe(404);
    expect((data as { error: string }).error).toContain("not found");
  });

  it("returns 404 for unknown routes", async () => {
    const { status, data } = await fetchJson(port, "/api/unknown");
    expect(status).toBe(404);
    expect((data as { error: string }).error).toBe("Not found");
  });
});
