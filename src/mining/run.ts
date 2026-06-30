/**
 * @file 挖掘主流程(组 5/6 共用入口)。
 *
 * 数据流:
 *   buildWorkSummaries → mergeCostData → 项目过滤(决策 12)→ buildDigests(带缓存)
 *   → triage → (dryRun 或无 LLM? 展示/返回 : detectSignals + extractLessons + aggregateAll)
 *   → writeOutput(按项目分目录 + INDEX)
 *
 * 严格只读 ~/.claude;产物只写 --output(决策 9/12)。
 */

import { join } from "node:path";
import { buildWorkSummaries, mergeCostData } from "../aggregator/index.js";
import { loadSessionEntries } from "../cli/entry-loader.js";
import type { SessionWorkSummary } from "../types/index.js";
import { buildDigest } from "./digest.js";
import { triageAll, formatTriageSummary } from "./triage.js";
import { lookupDigest, readDigestCache, writeDigestCache } from "./cache.js";
import { detectSignals } from "./signals.js";
import { extractLessons } from "./lesson.js";
import { aggregateAll } from "./aggregate.js";
import { writeOutput } from "./output.js";
import type { MineConfig, MineResult } from "./types.js";

/** 按项目过滤(决策 12)。 */
function filterProject(
  summaries: SessionWorkSummary[],
  config: MineConfig,
): SessionWorkSummary[] {
  if (config.allProjects) return summaries;
  if (config.projectFilter) {
    const f = config.projectFilter.toLowerCase();
    return summaries.filter((s) => s.projectPath.toLowerCase().includes(f));
  }
  // 默认:当前 cwd 对应项目
  const cwd = process.cwd().toLowerCase();
  return summaries.filter((s) => s.projectPath.toLowerCase().includes(cwd));
}

/** entries 加载器(封装 loadSessionEntries,签名匹配 EntriesLoader)。 */
function makeLoader(claudeDir: string) {
  return async (sessionId: string) => {
    const { entries } = await loadSessionEntries(sessionId, claudeDir);
    return entries;
  };
}

/**
 * 运行挖掘。dateStr 用于 lesson 日期标记(走调用方时区,见 cli/tz-utils)。
 * 返回 MineResult;若 dryRun 或无 LLM,signals/lessons/knowledge 为空(仅 triage)。
 */
export async function runMine(
  config: MineConfig,
  dateStr: string,
): Promise<MineResult> {
  // 1. 数据获取 + 成本合并
  let summaries = await buildWorkSummaries(config.claudeDir);
  summaries = (await mergeCostData(
    summaries,
    config.claudeDir,
  )) as SessionWorkSummary[]; // mergeCostData 用 {...s},保留 workContent

  // 2. 项目过滤
  summaries = filterProject(summaries, config);

  // 3. digest(带缓存)
  const cachePath = join(config.outputDir, ".mining-cache.json");
  const cache = readDigestCache(cachePath);
  const digests = summaries.map(
    (s) => lookupDigest(cache, s.sessionId) ?? buildDigest(s),
  );
  if (digests.length > 0) writeDigestCache(cachePath, digests);

  // 4. triage
  const triage = triageAll(digests, config);

  // dry-run 或无 LLM:只返回 triage(不挖)
  if (config.dryRun || config.llm === null) {
    return { config, triage, signals: [], lessons: [], knowledge: [] };
  }

  // 5. 信号 + lesson(仅对 deep-dive)
  const loader = makeLoader(config.claudeDir);
  const deepDive = triage.deepDive.map((t) => t.digest);
  const signals = await detectSignals(deepDive, loader);
  const lessons = await extractLessons(deepDive, loader, config.llm, dateStr);

  // 6. 聚合
  const knowledge = aggregateAll(signals, lessons);

  return { config, triage, signals, lessons, knowledge };
}

/** 便利:跑挖掘并直接写产物(供 CLI action 用)。 */
export async function runMineAndWrite(
  config: MineConfig,
  dateStr: string,
): Promise<MineResult & { written: number; projects: string[]; triageView: string }> {
  const result = await runMine(config, dateStr);
  const written =
    result.knowledge.length > 0
      ? writeOutput(result.knowledge, config.outputDir)
      : { written: 0, projects: [] };
  return {
    ...result,
    written: written.written,
    projects: written.projects,
    triageView: formatTriageForCli(result),
  };
}

function formatTriageForCli(result: MineResult): string {
  return formatTriageSummary(result.triage);
}

// 关键参考实现(落地清单见 Mining-Agents-Detailed-Deep-Research.md):
// triage 阈值 ← sessions-insights;三类信号 ← skill-workshop;
// lesson 多维提取 + 认知谦逊 ← claude-memory-extractor;两阶段 ← cl-pprint。
