import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { join } from "node:path";
import type { SessionSummary } from "../types/index.js";
import { handleProjects, handleSessions, handleSessionDetail, handleSessionAnalysis } from "./api-handlers.js";
import { getHtml } from "./ui.js";
import { setTimezone } from "../cli/tz-utils.js";
import { loadSessionEntries } from "../cli/entry-loader.js";

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// URL parsing helpers
// ---------------------------------------------------------------------------

function parseQuery(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return params;
  const search = url.slice(qIdx + 1);
  for (const pair of search.split("&")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      params[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(
        pair.slice(eqIdx + 1),
      );
    }
  }
  return params;
}

/**
 * Match `/api/sessions/:id` — returns the id prefix or undefined.
 */
function matchSessionDetailApi(pathname: string): string | undefined {
  const prefix = "/api/sessions/";
  if (!pathname.startsWith(prefix)) return undefined;
  const id = pathname.slice(prefix.length);
  return id.length > 0 ? id : undefined;
}

// ---------------------------------------------------------------------------
// Messages extraction — re-reads JSONL for conversation content
// ---------------------------------------------------------------------------

interface MessageEntry {
  role: string;
  content: string;
  timestamp: string | null;
  model: string | null;
}

async function extractMessages(
  claudeDir: string,
  session: SessionSummary,
): Promise<MessageEntry[]> {
  const { parseJsonlStream } = await import("../parser/parse-jsonl.js");
  const filePath = join(claudeDir, "projects", session.encodedDir, `${session.sessionId}.jsonl`);

  let entries;
  try {
    entries = await parseJsonlStream(filePath);
  } catch {
    return [];
  }

  const messages: MessageEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "user" || entry.type === "assistant") {
      const content = entry.message?.content;
      let text = "";
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        // Content blocks — extract text blocks
        const texts: string[] = [];
        for (const block of content) {
          if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
            texts.push(block.text);
          }
        }
        text = texts.join("\n");
      }

      if (text) {
        messages.push({
          role: entry.type,
          content: text,
          timestamp: entry.timestamp ?? null,
          model: entry.message?.model ?? null,
        });
      }
    }
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

function createHandler(summaries: SessionSummary[], claudeDir: string, timezone?: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? "/";
    const qIdx = url.indexOf("?");
    const pathname = qIdx === -1 ? url : url.slice(0, qIdx);


    // Security headers — applied to all responses
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      // GET / — serve HTML page
      if (pathname === "/" || pathname === "") {
        const html = getHtml(timezone);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(html),
        });
        res.end(html);
        return;
      }

      // GET /favicon.ico — empty response to avoid 404 noise
      if (pathname === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }

      // GET /api/projects
      if (pathname === "/api/projects") {
        const query = parseQuery(url);
        json(res, 200, handleProjects(summaries, query.sort));
        return;
      }

      // GET /api/sessions/:id/analysis
      const analysisMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/analysis$/);
      if (analysisMatch) {
        const idPrefix = analysisMatch[1];
        const result = handleSessionDetail(summaries, idPrefix);
        if (result.status !== 200) {
          json(res, result.status, result.data);
          return;
        }
        const session = summaries.find((s) => s.sessionId.startsWith(idPrefix))!;
        const { entries } = await loadSessionEntries(session.sessionId, claudeDir);
        const analysis = handleSessionAnalysis(entries);
        json(res, 200, analysis);
        return;
      }

      // GET /api/sessions/:id/messages
      const messagesMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (messagesMatch) {
        const idPrefix = messagesMatch[1];
        const result = handleSessionDetail(summaries, idPrefix);
        if (result.status !== 200) {
          json(res, result.status, result.data);
          return;
        }
        // Find the actual session summary for file path
        const session = summaries.find((s) => s.sessionId.startsWith(idPrefix))!;
        const messages = await extractMessages(claudeDir, session);
        json(res, 200, messages);
        return;
      }

      // GET /api/sessions/:id
      const detailId = matchSessionDetailApi(pathname);
      if (detailId) {
        const result = handleSessionDetail(summaries, detailId);
        json(res, result.status, result.data);
        return;
      }

      // GET /api/sessions (with optional filters)
      if (pathname === "/api/sessions") {
        const query = parseQuery(url);
        const data = handleSessions(summaries, {
          project: query.project,
          from: query.from,
          to: query.to,
        });
        json(res, 200, data);
        return;
      }

      // 404 — unknown route
      json(res, 404, { error: "Not found" });
    } catch (err) {
      console.error("Request error:", err);
      json(res, 500, { error: "Internal server error" });
    }
  };
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

export function startServer(
  summaries: SessionSummary[],
  port: number,
  claudeDir: string,
  timezone?: string,
): Server {
  if (timezone) {
    setTimezone(timezone);
  }
  const server = createServer(createHandler(summaries, claudeDir, timezone));

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Server running at http://localhost:${port}`);
  });

  return server;
}
