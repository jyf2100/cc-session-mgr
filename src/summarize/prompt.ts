/**
 * Prompt construction for LLM work summarization.
 *
 * Pure function — takes a SessionWorkSummary and returns a prompt string.
 * No side effects, no network calls — fully testable.
 */

import type { SessionWorkSummary } from "../types/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a work activity summarizer. Given structured data about a coding session, produce a concise 1-2 sentence summary describing WHAT was accomplished.

Rules:
- Write in the same language as the user messages (Chinese if Chinese, English if English).
- Focus on concrete outcomes, not process.
- Do not mention tools or commands unless they are the primary outcome.
- Output ONLY the summary text. No meta-commentary, no thinking process, no "Let me...", "Okay...", or "The user's main intent was...".
- Start directly with the accomplishment, e.g. "完成了..." or "Fixed..." or "Added...".`;

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build a summary prompt from a session's structured work content signals.
 *
 * @param session — The session with workContent and fileEdits data
 * @returns A prompt string to send to the LLM
 */
export function buildSummaryPrompt(session: SessionWorkSummary): string {
  const wc = session.workContent;
  const sections: string[] = [];

  if (session.projectPath) {
    sections.push(`## Project\n${session.projectPath}`);
  }

  if (wc.compactedSummary) {
    sections.push(`## Session Summary\n${wc.compactedSummary}`);
  }

  if (wc.primaryIntent && wc.primaryIntent !== "Untitled session") {
    sections.push(`## Primary Intent\n${wc.primaryIntent}`);
  }

  if (wc.userIntents.length > 0) {
    const items = wc.userIntents.map((i) => `- ${i}`).join("\n");
    sections.push(`## User Intents\n${items}`);
  }

  const toolEntries = Object.entries(wc.toolCallSummary);
  if (toolEntries.length > 0) {
    const items = toolEntries
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `- ${name}: ${count}`)
      .join("\n");
    sections.push(`## Tool Calls\n${items}`);
  }

  if (wc.moduleSummary.length > 0) {
    sections.push(`## Modules Touched\n${wc.moduleSummary.join(", ")}`);
  }

  if (session.fileEdits.length > 0) {
    const sorted = [...session.fileEdits].sort((a, b) => b.editCount - a.editCount);
    const items = sorted
      .map((f) => `- ${f.filePath} (${f.editCount} edit${f.editCount > 1 ? "s" : ""})`)
      .join("\n");
    sections.push(`## Files Edited\n${items}`);
  }

  if (wc.bashCommands.length > 0) {
    const items = wc.bashCommands.map((c) => `- ${c}`).join("\n");
    sections.push(`## Key Commands\n${items}`);
  }

  if (wc.assistantSnippets.length > 0) {
    const items = wc.assistantSnippets.map((s) => `- ${s}`).join("\n");
    sections.push(`## Assistant Output Samples\n${items}`);
  }

  return `${SYSTEM_PROMPT}\n\n${sections.join("\n\n")}\n\n## Task\nSummarize what this session accomplished in 1-2 sentences:`;
}
