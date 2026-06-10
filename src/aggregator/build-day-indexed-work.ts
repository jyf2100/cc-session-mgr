import { basename } from "node:path";
import { parseJsonlStream } from "../parser/parse-jsonl.js";
import { extractSessionMetadata } from "../parser/extract-metadata.js";
import { extractMessageStats } from "../parser/extract-message-stats.js";
import { extractCostData } from "../parser/extract-cost.js";
import { scanProjects } from "../parser/scan-projects.js";
import { decodeProjectPaths } from "../parser/decode-paths.js";
import { extractFileEditSummary } from "./file-edits.js";
import { splitSessionByDay } from "./day-splitter.js";
import { extractWorkContent } from "../parser/extract-work-content.js";
import type { SessionWorkSummary, DayIndexedWorkSession } from "../types/index.js";

/**
 * Build work-session summaries enriched with per-day breakdowns.
 *
 * For each session JSONL file, parse entries and produce both the full
 * SessionWorkSummary (with work content) and a DaySlice[] breakdown.
 * The splitting happens in the same loop — no re-parse needed.
 */
export async function buildDayIndexedWorkSummaries(
  claudeDir: string,
): Promise<DayIndexedWorkSession[]> {
  const projectDirs = await scanProjects(claudeDir);
  const pathMap = await decodeProjectPaths(projectDirs, claudeDir);

  const results: DayIndexedWorkSession[] = [];

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

        const summary: SessionWorkSummary = {
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
        };

        const daySlices = splitSessionByDay(entries, summary);

        results.push({ summary, daySlices });
      } catch {
        console.warn(`[cc-session-mgr] Skipping corrupt session: ${jsonlFile}`);
      }
    }
  }

  return results;
}
