/**
 * @file 挖掘 prompt 构建(仿 summarize/prompt.ts 模式,决策 5)。
 *
 * provider 只吃单 prompt 字符串,system prompt 拼接在前(见 providers.ts 约束)。
 * lesson 提取要求严格 JSON 输出 + 认知谦逊(决策 4)。
 */

const SYSTEM_PROMPT = `你是会话经验挖掘助手。从 Claude Code 会话片段提取可复用的工程经验(踩坑、决策、方法论)。

严格要求:
- 只提取清晰、可迁移的经验;模糊或无清晰经验时,降低 confidence 并在 certaintyReasoning 说明,或置 uncertain=true。
- 输出严格 JSON,字段:id(短slug)、problem、rootCause、solution、takeaway、confidence(1-5整数)、type("methodology"或"technical")、trigger(何时复用)、uncertain(boolean)、certaintyReasoning。
- 不要输出 JSON 以外的任何内容(不要 markdown 围栏、不要解释)。`;

export interface LessonPromptInput {
  projectName: string;
  sessionId: string;
  date: string;
  /** 紧凑后的会话片段文本 */
  transcript: string;
}

/** 构建 lesson 提取 prompt。 */
export function buildLessonPrompt(input: LessonPromptInput): string {
  return `${SYSTEM_PROMPT}

项目: ${input.projectName}
会话: ${input.sessionId}
日期: ${input.date}

会话片段(用户与 assistant 交互、工具调用、错误与纠正):
---
${input.transcript}
---

提取一条最有价值的可复用经验(单个 JSON 对象)。若该片段无清晰经验,返回 {"uncertain": true, "confidence": 1, "certaintyReasoning": "无清晰可迁移经验"}。`;
}

/** 把 entries 压成紧凑 transcript(控制 LLM 输入长度)。 */
export function compactTranscript(
  entries: { role: string; text: string }[],
  maxChars = 6000,
): string {
  const lines: string[] = [];
  let total = 0;
  for (const e of entries) {
    const t = e.text.slice(0, 400);
    const line = `[${e.role}] ${t}`;
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length;
  }
  return lines.join("\n");
}
