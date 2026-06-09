import { basename } from "node:path";
import { parseJsonlStream } from "../parser/parse-jsonl.js";
import { extractSessionMetadata } from "../parser/extract-metadata.js";
import { extractMessageStats } from "../parser/extract-message-stats.js";
import { extractCostData } from "../parser/extract-cost.js";
import { scanProjects } from "../parser/scan-projects.js";
import { decodeProjectPaths } from "../parser/decode-paths.js";
import { extractFileEditSummary } from "./file-edits.js";
import { extractWorkContent } from "../parser/extract-work-content.js";
import type { SessionWorkSummary } from "../types/index.js";

/**
 * Build session summaries enriched with work-content signals.
 *
 * Mirrors buildSessionSummaries but additionally extracts work content
 * (intent, tool calls, bash commands, modules) from the conversation data.
 */
export async function buildWorkSummaries(
  claudeDir: string,
): Promise<SessionWorkSummary[]> {
  const projectDirs = await scanProjects(claudeDir);
  const pathMap = await decodeProjectPaths(projectDirs, claudeDir);

  const summaries: SessionWorkSummary[] = [];

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

        // Extract work-content signals
        const editPaths = fileEdits.map((e) => e.filePath);
        const workContent = extractWorkContent(entries, editPaths, meta.customTitle);

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
          workContent,
        });
      } catch {
        console.warn(`[cc-session-mgr] Skipping corrupt session: ${jsonlFile}`);
      }
    }
  }

  return summaries;
}
