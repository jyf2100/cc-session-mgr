/**
 * @file Mining module types.
 *
 * session-mining-agent: 从 Claude Code 会话历史挖掘有价值信息。
 * 两阶段(确定性 digest/triage + LLM 提取)+ 跨会话聚合 + 项目化产物。
 *
 * 设计依据:openspec/changes/session-mining-agent/design.md
 */

import type { SessionWorkSummary } from "../types/index.js";
import type { SummarizeOptions } from "../summarize/index.js";

// ---------------------------------------------------------------------------
// 枚举(string literal union —— 项目惯例,不用 enum)
// ---------------------------------------------------------------------------

/** triage 分流层级。 */
export type TriageTier = "deep-dive" | "aggregate-only";

/** 三类核心挖掘信号(借鉴 skill-workshop)。 */
export type SignalType =
  | "repeated-explanation"
  | "tool-chain"
  | "error-workaround";

/** lesson 类型:方法论 vs 技术修复(借鉴 claude-memory-extractor)。 */
export type LessonType = "methodology" | "technical";

/** 聚合条目的来源种类。 */
export type KnowledgeKind = SignalType | "lesson";

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

export interface MineConfig {
  claudeDir: string;
  outputDir: string;
  /** 子串匹配的项目名;undefined = 当前 cwd 项目(决策 12);allProjects=true 时忽略。 */
  projectFilter?: string;
  /** 显式全量(决策 12):打印项目数 + 成本预估。 */
  allProjects: boolean;
  /** YYYY-MM-DD 时间窗口。 */
  dateRange?: { start: string; end: string };
  /** triage 阈值:人类轮次下限(默认 3,决策 2)。 */
  minTurns: number;
  /** 不调 LLM,只展示 triage 分流(决策 2)。 */
  dryRun: boolean;
  /** 逐条审批(决策 10)。 */
  interactive: boolean;
  /** LLM 选项;null = 不调 LLM(仅确定性 digest/triage)。 */
  llm: SummarizeOptions | null;
}

// ---------------------------------------------------------------------------
// 阶段① digest
// ---------------------------------------------------------------------------

/** 单会话的 compact digest(确定性,无 LLM)。 */
export interface MiningDigest {
  sessionId: string;
  /** worktree 归一后的项目名(决策 12)。 */
  projectName: string;
  projectPath: string;
  summary: SessionWorkSummary;
  humanTurns: number;
  autonomousTurns: number;
  /** 工具调用顺序(紧凑、去连续重复)。 */
  toolSequence: string[];
  durationMs: number;
  topics: string[];
  entryCount: number;
}

// ---------------------------------------------------------------------------
// triage
// ---------------------------------------------------------------------------

export interface TriagedSession {
  digest: MiningDigest;
  tier: TriageTier;
  /** 分流原因(可读,用于 dry-run 展示)。 */
  reason: string;
}

export interface TriageResult {
  all: TriagedSession[];
  deepDive: TriagedSession[];
  aggregateOnly: TriagedSession[];
}

// ---------------------------------------------------------------------------
// 阶段② 信号
// ---------------------------------------------------------------------------

export interface MiningSignal {
  type: SignalType;
  content: string;
  evidence: string;
  sourceSessions: string[];
  projects: string[];
  /** frequency × type_weight(借鉴 skill-workshop)。 */
  score: number;
}

// ---------------------------------------------------------------------------
// 阶段② lesson
// ---------------------------------------------------------------------------

export interface Lesson {
  id: string;
  problem: string;
  rootCause: string;
  solution: string;
  takeaway: string;
  /** 1-5。 */
  confidence: number;
  certaintyReasoning: string;
  type: LessonType;
  /** 何时复用此经验。 */
  trigger: string;
  sourceSessions: string[];
  /** 决策 11:项目归属(从 sourceSessions.projectPath 推断、去重)。 */
  projects: string[];
  /** YYYY-MM-DD。 */
  date: string;
  /** 认知谦逊标记(决策 4):模糊案例 confidence ≤ 2。 */
  uncertain: boolean;
}

// ---------------------------------------------------------------------------
// 聚合
// ---------------------------------------------------------------------------

export interface AggregatedKnowledge {
  key: string;
  /** 归一后项目名(决策 12)。 */
  projectName: string;
  kind: KnowledgeKind;
  lessons: Lesson[];
  signals: MiningSignal[];
  occurrences: number;
  sourceSessions: string[];
  projects: string[];
}

// ---------------------------------------------------------------------------
// 挖掘结果
// ---------------------------------------------------------------------------

export interface MineResult {
  config: MineConfig;
  triage: TriageResult;
  signals: MiningSignal[];
  lessons: Lesson[];
  knowledge: AggregatedKnowledge[];
}
