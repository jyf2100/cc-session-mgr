/**
 * Extract work-content signals from JSONL conversation entries.
 *
 * Produces a structured summary of what a session accomplished —
 * user intent, tool calls, Bash commands, modules touched —
 * without any LLM or network dependency.
 */

import type { JsonlEntry, WorkContent } from "../types/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INTENT_LENGTH = 200;
const MAX_USER_INTENTS = 30;
const MAX_SNIPPETS = 5;
const MAX_SNIPPET_LENGTH = 150;
const MAX_BASH_COMMANDS = 20;
const MAX_SUMMARY_LENGTH = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract text from a message content field (string or content block array). */
function extractText(content: unknown): string {
  if (typeof content === "string") return stripXmlTags(content);
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        texts.push(stripXmlTags((block as Record<string, unknown>).text as string));
      }
    }
    return texts.join("\n");
  }
  return "";
}

/**
 * Extract only the user's actual input text from a message,
 * skipping injected skill descriptions and system content blocks.
 *
 * Strategy: take the first short text block (under 300 chars) that looks
 * like user input. Skip blocks that look like skill descriptions
 * (markdown headers, "Base directory for this skill:", etc.).
 */
function extractUserText(content: unknown): string {
  if (typeof content === "string") {
    // First try to extract <command-args> — the user's actual input
    const args = extractCommandArgs(content);
    if (args) return args;
    // Fallback: take the first meaningful line after stripping tags
    const lines = stripXmlTags(content).split("\n");
    return lines[0].trim();
  }

  if (!Array.isArray(content)) return "";

  // Collect text blocks, skip tool_result blocks (those are injected content)
  const textBlocks: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as Record<string, unknown>).type === "text" &&
      typeof (block as Record<string, unknown>).text === "string"
    ) {
      const text = stripXmlTags((block as Record<string, unknown>).text as string);
      if (text.trim()) textBlocks.push(text.trim());
    }
  }

  if (textBlocks.length === 0) return "";

  // Return the first text block that looks like real user input
  for (const block of textBlocks) {
    // Skip skill description blocks
    if (isSkillDescription(block)) continue;
    // First non-skill block is the user input
    // If it's long, just take the first line
    if (block.length <= 300) return block;
    return block.split("\n")[0].trim();
  }

  // All blocks were skill descriptions — extract the slash command from the first one
  const first = textBlocks[0];
  const firstLine = first.split("\n")[0].trim();
  if (firstLine.startsWith("/")) return firstLine;
  return firstLine;
}

/**
 * Detect text that is an injected skill/system description, not real user input.
 * Skill descriptions start with patterns like:
 * - "Base directory for this skill:"
 * - "# Deep Research"
 * - "Propose a new change"
 * - "Implement tasks from"
 * - "Archive a completed change"
 * - "Please analyze this codebase"
 * - Lines starting with markdown headers (#) from skill expansions
 */
function isSkillDescription(text: string): boolean {
  const firstLine = text.split("\n")[0].trim();

  // Known skill description patterns (first line of injected skill content)
  const skillPatterns = [
    /^Base directory for this skill:/,
    /^Propose a new change/,
    /^Implement tasks from/,
    /^Archive a completed change/,
    /^Sync delta specs from/,
    /^Please analyze this codebase/,
    /^Running means launching/,
    /^I'll create a change with artifacts/,
    /^Creating a change directory/,
  ];

  for (const pattern of skillPatterns) {
    if (pattern.test(firstLine)) return true;
  }

  // System-injected caveats and interruptions
  if (firstLine.startsWith("Caveat: The messages below were generated")) return true;
  if (/^\[Request interrupted by user/.test(firstLine)) return true;

  // Multi-line text starting with a markdown header is likely a skill description
  if (text.includes("\n") && firstLine.startsWith("# ")) return true;

  return false;
}

/** Strip XML-style tags from text (e.g. <command-message>, <local-command-caveat>). */
function stripXmlTags(text: string): string {
  return text.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/g, "").trim();
}

/**
 * Extract the user's actual input from a command-style message.
 *
 * Claude Code wraps slash commands in XML tags:
 *   <command-message>opsx:propose</command-message>
 *   <command-name>/opsx:propose</command-name>
 *   <command-args>我想可以选择项目-日期 浏览session信息</command-args>
 *
 * After stripXmlTags this becomes:
 *   "opsx:propose\n/opsx:propose\n我想可以选择项目-日期 浏览session信息"
 *
 * We want the command-args text (the user's actual intent), not the command name.
 */
function extractCommandArgs(text: string): string | null {
  // Try to find <command-args> content before stripping
  const argsMatch = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
  if (argsMatch && argsMatch[1].trim()) {
    return argsMatch[1].trim();
  }
  return null;
}

/**
 * Clean a user intent string:
 * - Collapse whitespace/newlines to single space
 * - Return null for slash-only commands (tool invocations, not work content)
 */
function cleanUserIntent(text: string): string | null {
  let cleaned = stripXmlTags(text);

  // If text starts with a slash command, check if there are meaningful args
  const slashMatch = cleaned.match(/^\/([a-zA-Z0-9:_-]+)\s*(.*)/s);
  if (slashMatch) {
    const args = slashMatch[2].trim();
    // Pure slash command with no natural language args → skip
    if (!args) return null;
    // Args exist but are just another slash command → skip
    if (/^\/[a-zA-Z0-9:_-]+$/.test(args)) return null;
    // Args look like a real description → keep them
    if (args.length >= 4) return args.replace(/\s+/g, " ").trim();
    // Short args after slash → skip (likely just a label)
    return null;
  }

  // Collapse all whitespace to single space
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned;
}

/**
 * Detect session continuation summaries injected by Claude Code.
 * These start with "This session is being continued from a previous conversation"
 * and contain a structured summary — not real user input.
 */
function isSessionContinuation(text: string): boolean {
  return text.startsWith("This session is being continued from a previous conversation");
}

/** Check if text looks like a command/skill name rather than natural language. */
function looksLikeCommand(text: string): boolean {
  const t = text.trim();
  if (t.startsWith("/")) return true;
  if (/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(t)) return true;
  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(t) && t.length <= 30) return true;
  return false;
}

/** Truncate a string to maxLen characters, appending "…" if truncated. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

/** Group file paths by module (src/ subdirectory or top-level dir). */
function groupByModule(filePaths: string[]): string[] {
  const moduleCounts = new Map<string, number>();

  for (const fp of filePaths) {
    // Normalize and extract relative portion after common project roots
    const normalized = fp.replace(/\\/g, "/");
    // Get the filename portion relative to src/ or the last meaningful directory
    let relative = normalized;

    // Handle absolute paths: find src/ or the project-relative part
    const srcIdx = normalized.indexOf("/src/");
    if (srcIdx >= 0) {
      relative = normalized.slice(srcIdx + 1); // "src/parser/parse.ts"
    } else if (normalized.startsWith("src/")) {
      relative = normalized; // already relative: "src/parser/parse.ts"
    } else {
      // For non-src files, use just the filename or last path component
      const lastSlash = normalized.lastIndexOf("/");
      relative = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
    }

    let mod: string;
    if (relative.startsWith("src/")) {
      // "src/parser/parse-jsonl.ts" → "parser"
      const parts = relative.split("/");
      mod = parts.length > 2 ? parts[1] : "src";
    } else if (relative.startsWith("test/") || relative.startsWith("tests/")) {
      const parts = relative.split("/");
      mod = parts.length > 2 ? parts[1] : "tests";
    } else if (relative.includes("/")) {
      // "openspec/changes/..." → "openspec"
      mod = relative.split("/")[0];
    } else {
      // Bare filename: "package.json", "tsconfig.json"
      mod = "config";
    }

    moduleCounts.set(mod, (moduleCounts.get(mod) ?? 0) + 1);
  }

  const entries = [...moduleCounts.entries()];
  entries.sort((a, b) => b[1] - a[1]);
  return entries.map(([mod, count]) => `${mod} (${count})`);
}

// ---------------------------------------------------------------------------
// Default WorkContent
// ---------------------------------------------------------------------------

function emptyWorkContent(): WorkContent {
  return {
    primaryIntent: "Untitled session",
    userIntents: [],
    toolCallSummary: {},
    bashCommands: [],
    moduleSummary: [],
    assistantSnippets: [],
    compactedSummary: null,
    llmSummary: null,
  };
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Extract work-content signals from a session's JSONL entries.
 *
 * @param entries — Parsed JSONL entries for a single session
 * @param fileEditPaths — Pre-extracted file edit paths (from extractFileEditSummary)
 * @param customTitle — Session title if available
 * @returns A WorkContent object with all extracted signals
 */
export function extractWorkContent(
  entries: JsonlEntry[],
  fileEditPaths: string[],
  customTitle: string | null,
): WorkContent {
  // Module summary from file edit paths — computed regardless of entries
  const moduleSummary = groupByModule(fileEditPaths);

  if (entries.length === 0) {
    const empty = emptyWorkContent();
    empty.moduleSummary = moduleSummary;
    return empty;
  }

  const result = emptyWorkContent();

  // Track whether we found user intent
  let foundIntent = false;
  let snippetCount = 0;
  let prevBashCmd = "";

  for (const entry of entries) {
    // --- User intent: collect all user messages ---
    if (entry.type === "user" && entry.message?.content) {
      const rawText = extractUserText(entry.message.content).trim();

      // Skip session continuation summaries injected by the system
      if (isSessionContinuation(rawText)) {
        // Still use as primaryIntent if nothing else found
        if (!foundIntent && rawText) {
          const summaryLine = rawText.split("\n")[0].trim();
          result.primaryIntent = truncate(
            summaryLine || "Continued session",
            MAX_INTENT_LENGTH,
          );
          foundIntent = true;
        }
        continue;
      }

      // Skip injected skill descriptions (come as separate user entries)
      if (isSkillDescription(rawText)) continue;

      // Clean the intent: filter slash commands, collapse whitespace
      const text = cleanUserIntent(rawText);
      if (!text) continue;

      if (result.userIntents.length < MAX_USER_INTENTS) {
        const truncated = truncate(text, MAX_INTENT_LENGTH);
        // Skip duplicates / near-duplicates
        if (
          result.userIntents.length === 0 ||
          result.userIntents[result.userIntents.length - 1] !== truncated
        ) {
          result.userIntents.push(truncated);
        }
      }

      // primaryIntent: prefer natural language over slash commands
      if (!foundIntent && text) {
        result.primaryIntent = truncate(text, MAX_INTENT_LENGTH);
        foundIntent = true;
      }
      // If primaryIntent is a slash command, keep looking for natural language
      if (foundIntent && looksLikeCommand(result.primaryIntent) && text.length > 10) {
        result.primaryIntent = truncate(text, MAX_INTENT_LENGTH);
      }
    }

    // --- Compacted session summary ---
    if (entry.type === "summary" && entry.message?.content) {
      const text = extractText(entry.message.content).trim();
      if (text) {
        result.compactedSummary = truncate(text, MAX_SUMMARY_LENGTH);
      }
    }

    // --- Assistant entries: tool_use + text blocks ---
    if (entry.type === "assistant" && entry.message?.content) {
      const content = entry.message.content;

      if (typeof content === "string") {
        // Plain text assistant response
        if (snippetCount < MAX_SNIPPETS && content.trim()) {
          result.assistantSnippets.push(truncate(content.trim(), MAX_SNIPPET_LENGTH));
          snippetCount++;
        }
        continue;
      }

      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;

          // Tool use blocks
          if (b.type === "tool_use" && typeof b.name === "string") {
            const toolName = b.name as string;
            result.toolCallSummary[toolName] =
              (result.toolCallSummary[toolName] ?? 0) + 1;

            // Extract Bash commands
            if (
              toolName === "Bash" &&
              result.bashCommands.length < MAX_BASH_COMMANDS &&
              b.input &&
              typeof b.input === "object"
            ) {
              const input = b.input as Record<string, unknown>;
              const cmd = typeof input.command === "string" ? input.command.trim() : "";
              if (cmd && cmd !== prevBashCmd) {
                result.bashCommands.push(cmd);
                prevBashCmd = cmd;
              }
            }
          }

          // Text blocks
          if (
            b.type === "text" &&
            typeof b.text === "string" &&
            snippetCount < MAX_SNIPPETS
          ) {
            const text = (b.text as string).trim();
            if (text) {
              result.assistantSnippets.push(truncate(text, MAX_SNIPPET_LENGTH));
              snippetCount++;
            }
          }
        }
      }
    }
  }

  // Post-process primaryIntent: prefer customTitle or compactedSummary over weak signals
  // customTitle is usually the best description of what the session was about
  if (customTitle && customTitle !== result.primaryIntent) {
    result.primaryIntent = customTitle;
  } else if (result.compactedSummary && looksLikeCommand(result.primaryIntent)) {
    // If primaryIntent is still a command, use first line of compacted summary
    const firstLine = result.compactedSummary.split("\n")[0].split(".")[0].trim();
    if (firstLine.length > 5) {
      result.primaryIntent = truncate(firstLine, MAX_INTENT_LENGTH);
    }
  }

  // Use the pre-computed module summary
  result.moduleSummary = moduleSummary;

  return result;
}
