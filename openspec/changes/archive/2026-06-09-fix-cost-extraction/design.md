## Context

当前 `extract-cost.ts` 只检查 JSONL entry 顶层的 `costUSD` 字段。经过对 575 个真实 JSONL 文件的分析，该字段不存在。实际 token 用量在 `entry.message.usage` 中：

```json
{
  "type": "assistant",
  "message": {
    "model": "glm-5.1",
    "usage": {
      "input_tokens": 89896,
      "cache_read_input_tokens": 14080,
      "output_tokens": 375
    }
  }
}
```

次级数据源 `~/.claude/metrics/costs.jsonl` 的 1342 条记录也全是 0（非 Anthropic 模型）。

## Goals / Non-Goals

**Goals:**
- 从 `message.usage` 提取 token 计数
- 基于模型定价表估算费用
- 在报告中展示 token 用量和估算费用

**Non-Goals:**
- 不追求精确到分的费用（定价随时变化，估算即可）
- 不修改 `costs.jsonl` 的生成逻辑（那是 Claude Code 自身的行为）
- 不做模型价格自动更新

## Decisions

### 1. 双路径成本提取

当 `costUSD` 存在时直接使用（Anthropic 模型），否则从 `message.usage` 计算。

**替代方案**：只展示 token 数不做估算。被否决——用户最关心的是费用。

### 2. 定价表放在 `src/parser/pricing.ts`

硬编码一张静态定价表，按模型系列分组。未知模型使用默认低价。

```typescript
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15 },
  "claude-opus-4-8":   { inputPer1M: 15, outputPer1M: 75 },
  "claude-haiku-4-5":  { inputPer1M: 0.80, outputPer1M: 4 },
  "glm-5.1":           { inputPer1M: 0, outputPer1M: 0 },
};
```

**理由**：无需外部依赖，无网络请求，离线可用。

### 3. Token 计数加到 `SessionSummary.cost` 对象

扩展现有 `cost` 字段：

```typescript
cost: {
  totalUSD: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  isEstimated: boolean;
}
```

### 4. 报告中同时展示 token 和费用

格式：`$1.23 (50K in / 2K out)`

## Risks / Trade-offs

- **定价不准确** → 标注 `isEstimated: true`，用户可自行调整定价表
- **新模型不在定价表中** → fallback 到 0 定价，但仍展示 token 数
- **`cache_read_input_tokens` 字段名可能变化** → 防御性读取（`?? 0`）
