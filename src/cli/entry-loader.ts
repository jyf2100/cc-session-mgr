/**
 * Shared session entry loader — parses raw JsonlEntry[] for a specific session.
 * Used by CLI analysis commands and the Web UI analysis API endpoint.
 */

import { buildSessionSummaries } from "../aggregator/build-summaries.js";
import { mergeCostData } from "../aggregator/merge-cost.js";
import { parseJsonlStream } from "../parser/parse-jsonl.js";
import { scanProjects } from "../parser/scan-projects.js";
import { extractSessionMetadata } from "../parser/extract-metadata.js";
import type { JsonlEntry, SessionSummary } from "../types/index.js";

/**
 * Load raw JsonlEntry[] for a specific session by looking up the session
 * summary first (prefix matching), then re-parsing the matching JSONL file.
 */
export async function loadSessionEntries(
  sessionId: string,
  claudeDir: string,
): Promise<{ entries: JsonlEntry[]; summary: SessionSummary }> {
  const summaries = await mergeCostData(
    await buildSessionSummaries(claudeDir),
    claudeDir,
  );
  const matches = summaries.filter((s) => s.sessionId.startsWith(sessionId));
  if (matches.length === 0) throw new Error(`Session not found: ${sessionId}`);
  if (matches.length > 1) {
    throw new Error(
      `Multiple sessions match prefix '${sessionId}'. Use a longer prefix.`,
    );
  }
  const summary = matches[0];

  // Scan project dir to find the JSONL file
  const projectDirs = await scanProjects(claudeDir);
  const project = projectDirs.find((p) => p.encodedName === summary.encodedDir);
  if (!project) throw new Error(`Project dir not found: ${summary.encodedDir}`);

  for (const jsonlFile of project.jsonlFiles) {
    try {
      const entries = await parseJsonlStream(jsonlFile);
      if (entries.length === 0) continue;
      const meta = extractSessionMetadata(
        entries,
        "",
        summary.encodedDir,
      );
      if (meta.sessionId === summary.sessionId) {
        return { entries, summary };
      }
    } catch {
      // Skip unreadable files
    }
  }

  throw new Error(`JSONL file not found for session: ${summary.sessionId}`);
}
