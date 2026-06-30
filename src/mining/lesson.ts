/**
 * @file lesson 结构化提取 + 认知谦逊(决策 4)。
 *
 * 流程:loadSessionEntries → 紧凑 transcript → LLM JSON → parse → 护栏。
 * 认知谦逊:parse 失败或无清晰经验 → 不产出(不编造);低置信 → 标 uncertain。
 */

import type { JsonlEntry } from "../types/index.js";
import type { Lesson, MiningDigest, LessonType } from "./types.js";
import type { SummarizeOptions } from "../summarize/index.js";
import { callLlm, parseJsonResponse } from "./llm.js";
import { buildLessonPrompt, compactTranscript } from "./prompt.js";
import type { EntriesLoader } from "./signals.js";

interface RawLesson {
  id?: string;
  problem?: string;
  rootCause?: string;
  solution?: string;
  takeaway?: string;
  confidence?: number;
  type?: string;
  trigger?: string;
  uncertain?: boolean;
  certaintyReasoning?: string;
}

/** entries → 紧凑 [{role,text}](保留 text 与 tool_use 名,剥 tool_result 巨量输出)。 */
function toTranscript(entries: JsonlEntry[]): { role: string; text: string }[] {
  const out: { role: string; text: string }[] = [];
  for (const e of entries) {
    const role = e.message?.role ?? e.type;
    const c = e.message?.content;
    let text = "";
    if (typeof c === "string") text = c;
    else if (Array.isArray(c)) {
      text = c.map((b) => {
        if (typeof b === "object" && b !== null) {
          const t = (b as Record<string, unknown>).type;
          if (t === "text") return String((b as Record<string, unknown>).text ?? "");
          if (t === "tool_use") return `[tool:${(b as Record<string, unknown>).name}]`;
        }
        return "";
      }).join(" ");
    }
    if (text.trim()) out.push({ role, text });
  }
  return out;
}

function clampConfidence(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(5, Math.round(v)));
}

function isLessonType(s: unknown): s is LessonType {
  return s === "methodology" || s === "technical";
}

/**
 * 单会话提取 lesson(含认知谦逊护栏)。
 * - callLlm/parse 失败 → null(不编造)
 * - prompt 明示无经验(uncertain 且 problem 空)→ null
 * - 有经验但 confidence ≤ 2 → 产出但标 uncertain(决策 4)
 */
export async function extractLesson(
  digest: MiningDigest,
  entries: JsonlEntry[],
  llm: SummarizeOptions,
  dateStr: string,
): Promise<Lesson | null> {
  const transcript = compactTranscript(toTranscript(entries));
  if (!transcript.trim()) return null;

  const raw = await callLlm(
    buildLessonPrompt({
      projectName: digest.projectName,
      sessionId: digest.sessionId,
      date: dateStr,
      transcript,
    }),
    llm,
  );
  const parsed = parseJsonResponse<RawLesson>(raw);
  if (!parsed) return null;

  const uncertainFlag = parsed.uncertain === true;
  const hasProblem = Boolean(parsed.problem && parsed.problem.trim());
  // 无清晰经验 → 不产出
  if (uncertainFlag && !hasProblem) return null;

  const confidence = clampConfidence(parsed.confidence);
  const finalUncertain = uncertainFlag || confidence <= 2;
  const id = (parsed.id ?? `${digest.sessionId.slice(0, 8)}-${dateStr}`).slice(0, 60);

  return {
    id,
    problem: parsed.problem ?? "(未明确)",
    rootCause: parsed.rootCause ?? "",
    solution: parsed.solution ?? "",
    takeaway: parsed.takeaway ?? "",
    confidence,
    certaintyReasoning:
      parsed.certaintyReasoning ??
      (finalUncertain ? "低置信,标记 uncertain" : ""),
    type: isLessonType(parsed.type) ? parsed.type : "technical",
    trigger: parsed.trigger ?? "",
    sourceSessions: [digest.sessionId],
    projects: [digest.projectName],
    date: dateStr,
    uncertain: finalUncertain,
  };
}

/** 批量提取(对 deep-dive 会话,顺序调用尊重 429 限速)。 */
export async function extractLessons(
  deepDive: MiningDigest[],
  loader: EntriesLoader,
  llm: SummarizeOptions,
  dateStr: string,
): Promise<Lesson[]> {
  const out: Lesson[] = [];
  for (const d of deepDive) {
    try {
      const entries = await loader(d.sessionId);
      const lesson = await extractLesson(d, entries, llm, dateStr);
      if (lesson) out.push(lesson);
    } catch {
      // 单会话失败不影响其他
    }
  }
  return out;
}
