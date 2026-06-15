/**
 * Prompt construction for LLM work summarization.
 *
 * Pure function — takes a SessionWorkSummary and returns a prompt string.
 * No side effects, no network calls — fully testable.
 */

import { toDateStr } from "../cli/tz-utils.js";
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

// ---------------------------------------------------------------------------
// Project-level weekly prompt
// ---------------------------------------------------------------------------

const PROJECT_SYSTEM_PROMPT = `You are a weekly work summarizer. Given a list of coding sessions for one project across a week, produce a concise 2-3 sentence summary describing what was accomplished for the project as a whole.

Rules:
- Write in the same language as the session data (Chinese if Chinese, English if English).
- Focus on the overall arc and key outcomes, not individual session details.
- Do not mention session counts or dates explicitly — summarize the work thematically.
- Output ONLY the summary text. No meta-commentary, no thinking process, no "Let me...", "Okay...", or "The project's main focus was...".
- Start directly with the accomplishment, e.g. "完成了..." or "Built..." or "Refactored...".`;

/**
 * Build a project-level weekly summary prompt from all sessions of that project.
 *
 * Each session contributes its date, summary/intent, modules touched, and
 * file-edit count so the LLM can synthesize a cohesive weekly narrative.
 */
export function buildProjectWeeklyPrompt(
  projectName: string,
  sessions: SessionWorkSummary[],
): string {
  const entries = sessions
    .filter((s) => s.startTime)
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!))
    .map((s) => {
      const date = toDateStr(s.startTime!) ?? "unknown"; // YYYY-MM-DD
      const intent =
        s.workContent.llmSummary
        || s.workContent.compactedSummary
        || s.workContent.primaryIntent;
      const modules =
        s.workContent.moduleSummary.length > 0
          ? s.workContent.moduleSummary.join(", ")
          : null;
      const fileCount = s.fileEdits.length;
      const parts = [`**${intent}**`];
      if (modules) parts.push(modules);
      if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
      return `- ${date}: ${parts.join(" — ")}`;
    });

  const projectShort = projectName.split("/").pop() || projectName;

  return `${PROJECT_SYSTEM_PROMPT}\n\n## Project: ${projectShort}\n\n${entries.join("\n")}\n\n## Task\nSummarize the overall work done on this project this week in 2-3 sentences:`;
}

// ---------------------------------------------------------------------------
// Project-level monthly prompt
// ---------------------------------------------------------------------------

const PROJECT_MONTHLY_SYSTEM_PROMPT = `You are a monthly work summarizer. Given a list of coding sessions for one project across a month, produce a concise 2-3 paragraph summary describing what was accomplished for the project as a whole.

Rules:
- Write in the same language as the session data (Chinese if Chinese, English if English).
- Focus on the overall arc, key outcomes, and progression of work across the month.
- Group related work thematically rather than listing chronologically.
- Do not mention session counts or individual dates — summarize at a higher level.
- Output ONLY the summary text. No meta-commentary, no thinking process, no "Let me...", "Okay...", or "The project's main focus was...".
- Start directly with the accomplishment, e.g. "完成了..." or "Built..." or "Refactored...".`;

/**
 * Build a project-level monthly summary prompt from all sessions of that project.
 */
export function buildProjectMonthlyPrompt(
  projectName: string,
  sessions: SessionWorkSummary[],
): string {
  const entries = buildSessionEntries(sessions);
  const projectShort = projectName.split("/").pop() || projectName;
  return `${PROJECT_MONTHLY_SYSTEM_PROMPT}\n\n## Project: ${projectShort}\n\n${entries}\n\n## Task\nSummarize the overall work done on this project this month in 2-3 paragraphs:`;
}

// ---------------------------------------------------------------------------
// Project-level quarterly prompt
// ---------------------------------------------------------------------------

const PROJECT_QUARTERLY_SYSTEM_PROMPT = `You are a quarterly work summarizer. Given a list of coding sessions for one project across a quarter (3 months), produce a concise 2-3 paragraph summary describing what was accomplished for the project as a whole.

Rules:
- Write in the same language as the session data (Chinese if Chinese, English if English).
- Focus on the overall arc, major milestones, and progression of work across the quarter.
- Group related work thematically rather than listing chronologically.
- Do not mention session counts or individual dates — summarize at a strategic level.
- Output ONLY the summary text. No meta-commentary, no thinking process, no "Let me...", "Okay...", or "The project's main focus was...".
- Start directly with the accomplishment, e.g. "完成了..." or "Built..." or "Refactored...".`;

/**
 * Build a project-level quarterly summary prompt from all sessions of that project.
 */
export function buildProjectQuarterlyPrompt(
  projectName: string,
  sessions: SessionWorkSummary[],
): string {
  const entries = buildSessionEntries(sessions);
  const projectShort = projectName.split("/").pop() || projectName;
  return `${PROJECT_QUARTERLY_SYSTEM_PROMPT}\n\n## Project: ${projectShort}\n\n${entries}\n\n## Task\nSummarize the overall work done on this project this quarter in 2-3 paragraphs:`;
}

// ---------------------------------------------------------------------------
// Shared entry builder
// ---------------------------------------------------------------------------

function buildSessionEntries(sessions: SessionWorkSummary[]): string {
  return sessions
    .filter((s) => s.startTime)
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!))
    .map((s) => {
      const date = toDateStr(s.startTime!) ?? "unknown";
      const intent =
        s.workContent.llmSummary
        || s.workContent.compactedSummary
        || s.workContent.primaryIntent;
      const modules =
        s.workContent.moduleSummary.length > 0
          ? s.workContent.moduleSummary.join(", ")
          : null;
      const fileCount = s.fileEdits.length;
      const parts = [`**${intent}**`];
      if (modules) parts.push(modules);
      if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
      return `- ${date}: ${parts.join(" — ")}`;
    })
    .join("\n");
}
