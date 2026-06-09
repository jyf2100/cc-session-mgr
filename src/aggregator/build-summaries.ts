import { basename } from "node:path";
import { parseJsonlStream } from "../parser/parse-jsonl.js";
import { extractSessionMetadata } from "../parser/extract-metadata.js";
import { extractMessageStats } from "../parser/extract-message-stats.js";
import { extractCostData } from "../parser/extract-cost.js";
import { scanProjects } from "../parser/scan-projects.js";
import { decodeProjectPaths } from "../parser/decode-paths.js";
import { extractFileEditSummary } from "./file-edits.js";
import type { SessionSummary } from "../types/index.js";

/**
 * Orchestrate the full parse phase: scan projects, parse JSONL files,
 * decode paths, and produce a SessionSummary for each session file.
 */
export async function buildSessionSummaries(
  claudeDir: string,
): Promise<SessionSummary[]> {
  // Phase 1: Discover and parse
  const projectDirs = await scanProjects(claudeDir);
  const pathMap = await decodeProjectPaths(projectDirs, claudeDir);

  const summaries: SessionSummary[] = [];

  for (const project of projectDirs) {
    const projectPath = pathMap.get(project.encodedName) ?? project.encodedName;

    for (const jsonlFile of project.jsonlFiles) {
      try {
        const entries = await parseJsonlStream(jsonlFile);
        if (entries.length === 0) continue;

        const fallbackId = basename(jsonlFile, ".jsonl");
        const meta = extractSessionMetadata(entries, fallbackId, project.encodedName);
        const { counts, models } = extractMessageStats(entries);
        const cost = extractCostData(entries);
        const fileEdits = extractFileEditSummary(entries);

        summaries.push({
          sessionId: meta.sessionId,
          projectPath,
          encodedDir: project.encodedName,
          startTime: meta.startTime,
          endTime: meta.endTime,
          messageCounts: counts,
          cost,
          models,
          fileEdits,
          isCompacted: meta.isCompacted,
          hasCustomTitle: meta.hasCustomTitle,
          customTitle: meta.customTitle,
        });
      } catch {
        // Skip unreadable or corrupt session files
        console.warn(`[cc-session-mgr] Skipping corrupt session: ${jsonlFile}`);
      }
    }
  }

  return summaries;
}
