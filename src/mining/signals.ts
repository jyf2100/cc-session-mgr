/**
 * @file 三类信号提取(决策 3)。
 *
 * P0 全确定性(error-workaround / tool-chain / repeated-explanation 用规则与文本相似),
 * 避免 LLM 成本;lesson 提取才用 LLM(见 lesson.ts)。P1 可用 LLM 增强 repeated-explanation。
 *
 * 调用方应传 deep-dive digests(error-workaround 需 loadSessionEntries,逐会话拉 entries 较重)。
 */

import type { MiningDigest, MiningSignal, SignalType } from "./types.js";
import type { JsonlEntry } from "../types/index.js";

/** entries 加载器;注入便于测试 mock(封装 loadSessionEntries)。 */
export type EntriesLoader = (sessionId: string) => Promise<JsonlEntry[]>;

/** 类型权重(借鉴 skill-workshop:frequency × type_weight)。 */
const TYPE_WEIGHT: Record<SignalType, number> = {
  "error-workaround": 1.0,
  "tool-chain": 0.7,
  "repeated-explanation": 0.7,
};

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** 取 entry 文本(text 块拼接)。 */
function entryText(entry: JsonlEntry): string {
  const c = entry.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => {
        if (
          typeof b === "object" &&
          b !== null &&
          (b as Record<string, unknown>).type === "text"
        ) {
          return String((b as Record<string, unknown>).text ?? "");
        }
        return "";
      })
      .join(" ");
  }
  return "";
}

/** tool_result 块是否标记为错误。 */
function isToolError(entry: JsonlEntry): boolean {
  const c = entry.message?.content;
  if (!Array.isArray(c)) return false;
  return c.some((b) => {
    if (typeof b !== "object" || b === null) return false;
    const t = b as Record<string, unknown>;
    return t.type === "tool_result" && t.is_error === true;
  });
}

/** error→workaround:tool 错误后紧跟人类纠正(单会话内)。 */
export function detectErrorWorkaround(
  digest: MiningDigest,
  entries: JsonlEntry[],
): MiningSignal[] {
  const out: MiningSignal[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.type !== "assistant" || !isToolError(e)) continue;
    const next = entries.slice(i + 1, i + 4).find((x) => x.type === "user");
    if (!next) continue;
    const correction = entryText(next).trim().slice(0, 150);
    if (correction.length < 5) continue;
    out.push({
      type: "error-workaround",
      content: correction,
      evidence: `assistant@${i} tool_error → user correction`,
      sourceSessions: [digest.sessionId],
      projects: [digest.projectName],
      score: TYPE_WEIGHT["error-workaround"],
    });
  }
  return out;
}

/** 工具序列归一(小写、去连续重复),作聚类键。 */
function normalizeToolSeq(seq: string[]): string {
  const out: string[] = [];
  for (const t of seq.map((s) => s.toLowerCase())) {
    if (out[out.length - 1] !== t) out.push(t);
  }
  return out.join("→");
}

/** tool-chain:跨会话相同工具序列(≥2 会话)。 */
export function detectToolChains(digests: MiningDigest[]): MiningSignal[] {
  const bySeq = new Map<string, MiningDigest[]>();
  for (const d of digests) {
    if (d.toolSequence.length < 2) continue;
    const key = normalizeToolSeq(d.toolSequence);
    if (!key) continue;
    const arr = bySeq.get(key) ?? [];
    arr.push(d);
    bySeq.set(key, arr);
  }
  const out: MiningSignal[] = [];
  for (const [seq, ds] of bySeq) {
    if (ds.length < 2) continue;
    out.push({
      type: "tool-chain",
      content: seq,
      evidence: `出现在 ${ds.length} 个会话`,
      sourceSessions: ds.map((d) => d.sessionId),
      projects: unique(ds.map((d) => d.projectName)),
      score: TYPE_WEIGHT["tool-chain"] * Math.min(ds.length, 5),
    });
  }
  return out;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9一-鿿]+/i)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** repeated-explanation:跨会话代表意图高相似聚组(≥3 会话,P0 文本相似)。 */
export function detectRepeatedExplanations(digests: MiningDigest[]): MiningSignal[] {
  const items = digests
    .map((d) => ({
      d,
      text: d.topics[0] ?? "",
      tokens: tokenize(d.topics[0] ?? ""),
    }))
    .filter((it) => it.tokens.size > 0);
  const used = new Set<number>();
  const out: MiningSignal[] = [];
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const group: typeof items = [];
    for (let j = i; j < items.length; j++) {
      if (used.has(j)) continue;
      if (jaccard(items[i].tokens, items[j].tokens) >= 0.6) {
        group.push(items[j]);
        used.add(j);
      }
    }
    if (group.length >= 3) {
      out.push({
        type: "repeated-explanation",
        content: items[i].text.slice(0, 120),
        evidence: `跨 ${group.length} 个会话重复`,
        sourceSessions: group.map((g) => g.d.sessionId),
        projects: unique(group.map((g) => g.d.projectName)),
        score: TYPE_WEIGHT["repeated-explanation"] * Math.min(group.length, 5),
      });
    }
  }
  return out;
}

/**
 * 提取全部三类信号。tool-chain / repeated-explanation 仅用 digest(确定性);
 * error-workaround 经 loader 逐会话拉 entries(仅对 deep-dive,避免全量)。
 */
export async function detectSignals(
  digests: MiningDigest[],
  loader: EntriesLoader,
): Promise<MiningSignal[]> {
  const signals: MiningSignal[] = [];
  signals.push(...detectToolChains(digests));
  signals.push(...detectRepeatedExplanations(digests));
  for (const d of digests) {
    try {
      const entries = await loader(d.sessionId);
      signals.push(...detectErrorWorkaround(d, entries));
    } catch {
      // loader 失败则跳过该会话的 error-workaround
    }
  }
  return signals;
}
