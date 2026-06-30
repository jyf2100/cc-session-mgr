/**
 * @file 跨会话聚合(组 4,决策 6)。
 *
 * 把 signals + lessons 按(项目 + 键)聚合成 AggregatedKnowledge[]。
 * P0:exact-key 聚合(保守,不误并,决策 6);confirmMerge 提供 LLM 二次确认接口
 * (spec insight-aggregation,P0 默认不调,留给 interactive / P1)。
 */

import type {
  AggregatedKnowledge,
  Lesson,
  MiningSignal,
} from "./types.js";
import type { SummarizeOptions } from "../summarize/index.js";
import { callLlm, parseJsonResponse } from "./llm.js";

/** 文本指纹:小写、去标点、取前 N 字符(error-workaround 用)。 */
function fingerprint(content: string, n = 80): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim()
    .slice(0, n);
}

/** signal 聚合键(按项目 + 类型 + 内容指纹)。 */
function signalKey(s: MiningSignal): string {
  const proj = s.projects[0] ?? "_";
  if (s.type === "error-workaround") {
    return `${proj}::err::${fingerprint(s.content)}`;
  }
  return `${proj}::${s.type}::${fingerprint(s.content)}`;
}

/** lesson 聚合键(按项目 + problem 指纹)。 */
function lessonKey(l: Lesson): string {
  const proj = l.projects[0] ?? "_";
  return `${proj}::lesson::${fingerprint(l.problem, 60)}`;
}

/** 聚合 signals(exact-key)→ AggregatedKnowledge[]。 */
export function aggregateSignals(
  signals: MiningSignal[],
): AggregatedKnowledge[] {
  const byKey = new Map<string, AggregatedKnowledge>();
  for (const s of signals) {
    const key = signalKey(s);
    const ex = byKey.get(key);
    if (ex) {
      ex.signals.push(s);
      ex.occurrences += 1;
      ex.sourceSessions = [...new Set([...ex.sourceSessions, ...s.sourceSessions])];
      ex.projects = [...new Set([...ex.projects, ...s.projects])];
    } else {
      byKey.set(key, {
        key,
        projectName: s.projects[0] ?? "_",
        kind: s.type,
        lessons: [],
        signals: [s],
        occurrences: 1,
        sourceSessions: [...s.sourceSessions],
        projects: [...s.projects],
      });
    }
  }
  return [...byKey.values()];
}

/** 聚合 lessons(exact-key:同 project + 同 problem 指纹合并)。 */
export function aggregateLessons(lessons: Lesson[]): AggregatedKnowledge[] {
  const byKey = new Map<string, AggregatedKnowledge>();
  for (const l of lessons) {
    const key = lessonKey(l);
    const ex = byKey.get(key);
    if (ex) {
      ex.lessons.push(l);
      ex.occurrences += 1;
      ex.sourceSessions = [...new Set([...ex.sourceSessions, ...l.sourceSessions])];
    } else {
      byKey.set(key, {
        key,
        projectName: l.projects[0] ?? "_",
        kind: "lesson",
        lessons: [l],
        signals: [],
        occurrences: 1,
        sourceSessions: [...l.sourceSessions],
        projects: [...l.projects],
      });
    }
  }
  return [...byKey.values()];
}

/** 合并 signals + lessons 的聚合结果(保守 exact-key,决策 6:键不同保持独立)。 */
export function aggregateAll(
  signals: MiningSignal[],
  lessons: Lesson[],
): AggregatedKnowledge[] {
  return [...aggregateSignals(signals), ...aggregateLessons(lessons)];
}

/**
 * LLM 二次确认是否合并两条(歧义时;spec insight-aggregation)。
 * 返回 true=同一经验可合并。P0 默认不调用(aggregateAll 用 exact-key);
 * 留给 interactive 模式 / P1 相似键增强。
 */
export async function confirmMerge(
  a: AggregatedKnowledge,
  b: AggregatedKnowledge,
  llm: SummarizeOptions,
): Promise<boolean> {
  const aText = a.signals[0]?.content ?? a.lessons[0]?.problem ?? "";
  const bText = b.signals[0]?.content ?? b.lessons[0]?.problem ?? "";
  const prompt = `判断以下两条经验是否为"同一可复用经验"(应合并)。

A: ${aText}
B: ${bText}

只回 JSON: {"same": true|false, "reason": "..."}`;
  const raw = await callLlm(prompt, llm);
  const parsed = parseJsonResponse<{ same?: boolean }>(raw);
  return parsed?.same === true;
}
