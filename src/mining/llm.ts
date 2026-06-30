/**
 * @file LLM 调用层(复用 summarize/providers,决策 5:成本分层)。
 *
 * provider 只吃单 prompt 字符串、返回 string|null(见 summarize/providers.ts);
 * 这里封装 fetch + 429 退避 + cleanLlmOutput,供 mining 的提取 prompt 调用。
 */

import { getProvider } from "../summarize/providers.js";
import type { SummarizeOptions } from "../summarize/index.js";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/** 剥离 thinking/CoT 泄漏(Qwen3/DeepSeek-R1 等),解耦自实现。 */
function stripCoT(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reflection>[\s\S]*?<\/reflection>/gi, "")
    .trim();
}

/**
 * 直接提取 provider 响应的原始文本(不经 summarize 的 cleanLlmOutput,
 * 后者针对 summary 会破坏 JSON 输出)。
 */
function extractRawText(
  body: unknown,
  provider: SummarizeOptions["provider"],
): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (provider === "anthropic") {
    const content = b.content;
    if (!Array.isArray(content) || content.length === 0) return null;
    const first = content[0] as Record<string, unknown> | undefined;
    if (first && first.type === "text" && typeof first.text === "string") {
      return first.text;
    }
    return null;
  }
  // ollama(OpenAI-compatible):优先 content,回退 reasoning(thinking 模型)
  const choices = b.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as Record<string, unknown> | undefined)?.message as
    | Record<string, unknown>
    | undefined;
  if (!message) return null;
  if (typeof message.content === "string") return message.content;
  if (typeof message.reasoning === "string") return message.reasoning;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 调 LLM 返回清洗后的文本;失败/限速耗尽返回 null(不抛,调用方决定回退)。
 */
export async function callLlm(
  prompt: string,
  llm: SummarizeOptions,
): Promise<string | null> {
  const provider = getProvider(llm.provider);
  const { url, init } = provider.buildRequest(prompt, llm.config);
  // mining 需要更大 max_tokens(lesson JSON 较长),并对 ollama thinking 模型
  // (qwen3/deepseek-r1)禁用思考链 —— 否则思考会占满 provider 默认的 512 tokens
  // 导致 content 为空。think:false 由 ollama chat template 透传,不支持则无害忽略。
  if (init.body && typeof init.body === "string") {
    try {
      const bodyObj = JSON.parse(init.body) as Record<string, unknown>;
      bodyObj.max_tokens = 4096;
      if (llm.provider === "ollama") {
        bodyObj.chat_template_kwargs = { think: false };
      }
      init.body = JSON.stringify(bodyObj);
    } catch {
      // body 覆盖失败则用原 init
    }
  }
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      if (!res.ok) return null;
      const body = await res.json();
      // 绕过 provider.parseResponse 的 cleanLlmOutput(它针对 summary 会破坏 JSON):
      // mining 需要原始文本,自行 stripCoT + parseJsonResponse。
      const raw = extractRawText(body, llm.provider);
      if (!raw) return null;
      return stripCoT(raw);
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * 安全解析 LLM 输出的 JSON:提取首个 `{` 到末尾 `}`(LLM 可能带 prose / ```json 围栏)。
 * 失败返回 null —— 调用方据此丢弃该提取(认知谦逊:不编造,决策 4)。
 */
export function parseJsonResponse<T>(raw: string | null): T | null {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
