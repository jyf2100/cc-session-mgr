## Why

所有报告中的 cost 值都是 $0.00。根本原因：`extract-cost.ts` 只检查顶层 `costUSD` 字段，但实际 JSONL 数据中该字段不存在——真实 token 用量在 `entry.message.usage` 内。同时 `costs.jsonl` 中的所有条目也全是 0（非 Anthropic 模型不走标准 metrics 管道）。用户无法从报告中看到任何成本信息，报告失去实用价值。

## What Changes

- 修改 `extract-cost.ts`：当 `costUSD` 不存在时，从 `entry.message.usage` 读取 `input_tokens` 和 `output_tokens`
- 新增模型定价表（`pricing.ts`），支持按模型名计算估算费用
- 修改 `SessionSummary` 类型：增加 token 计数字段（`inputTokens`、`outputTokens`），让报告能展示 token 用量
- 修改报告模板：在成本旁展示 token 统计（即使无法精确计价也能看到活动量）

## Capabilities

### New Capabilities
- `cost-from-tokens`: 从 JSONL entry 的 `message.usage` 中提取 token 用量，结合模型定价表估算费用

### Modified Capabilities

（无既有 capability 需要修改）

## Impact

- **代码**：`src/parser/extract-cost.ts`（主要修改）、`src/types/index.ts`（类型扩展）、`src/report/` 各模板（展示 token 统计）
- **新增文件**：`src/parser/pricing.ts`（模型定价表）
- **测试**：需更新 `extract-cost` 相关测试用例，新增 `pricing.ts` 测试
- **无 API/依赖变更**：纯内部逻辑修改
