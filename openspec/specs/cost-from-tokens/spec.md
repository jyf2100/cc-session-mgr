# Cost from Tokens

## Purpose

Extract token usage data from Claude Code JSONL session files and use it to estimate costs when direct `costUSD` values are unavailable. Display token statistics alongside cost information in all report types.

## Requirements

### Requirement: Extract token usage from message.usage

当 JSONL entry 的顶层 `costUSD` 字段不存在时，系统 SHALL 从 `entry.message.usage` 中读取 `input_tokens` 和 `output_tokens`。系统 SHALL 防御性读取 `cache_read_input_tokens`（缺失时默认 0）。

#### Scenario: Entry with message.usage present
- **WHEN** 一个 assistant 类型的 JSONL entry 包含 `message.usage.input_tokens=1000` 和 `message.usage.output_tokens=500`
- **THEN** 系统 SHALL 提取 `inputTokens=1000` 和 `outputTokens=500`

#### Scenario: Entry with costUSD present (Anthropic model)
- **WHEN** 一个 assistant 类型的 JSONL entry 包含顶层 `costUSD=0.05`
- **THEN** 系统 SHALL 直接使用 `costUSD`，同时仍尝试从 `message.usage` 提取 token 计数作为补充信息

#### Scenario: Entry with neither costUSD nor message.usage
- **WHEN** 一个 assistant 类型的 JSONL entry 既没有 `costUSD` 也没有 `message.usage`
- **THEN** 系统 SHALL 返回所有值为 0，不报错

### Requirement: Estimate cost from tokens using pricing table

系统 SHALL 维护一张模型定价表（`src/parser/pricing.ts`），按模型名匹配每百万 token 的单价（`inputPer1M`、`outputPer1M`）。系统 SHALL 根据提取的 token 数量计算估算费用：`cost = (inputTokens / 1M * inputPer1M) + (outputTokens / 1M * outputPer1M)`。

#### Scenario: Known model in pricing table
- **WHEN** 模型为 `claude-sonnet-4-6`（定价 inputPer1M=3, outputPer1M=15），token 为 input=500K, output=10K
- **THEN** 估算费用 SHALL 为 `(500000/1000000*3) + (10000/1000000*15) = 1.5 + 0.15 = 1.65`

#### Scenario: Unknown model not in pricing table
- **WHEN** 模型名不在定价表中
- **THEN** 系统 SHALL 使用默认定价（0/0），费用为 $0.00，但 `isEstimated` 仍为 true，token 计数仍被记录

#### Scenario: Model matched by prefix
- **WHEN** 实际模型名为 `claude-sonnet-4-6-20250514`（带日期后缀）
- **THEN** 系统 SHALL 按最长前缀匹配定价表中的条目 `claude-sonnet-4-6`

### Requirement: Extend SessionSummary cost with token fields

`SessionSummary.cost` 对象 SHALL 包含以下字段：`totalUSD`（已有）、`inputTokens`（新增）、`outputTokens`（新增）、`cacheReadTokens`（新增）、`isEstimated`（新增，true 表示从 token 算出而非原始 costUSD）。

#### Scenario: Cost from token estimation
- **WHEN** 费用从 token 计数估算得出
- **THEN** `isEstimated` SHALL 为 true，`totalUSD` SHALL 为估算值

#### Scenario: Cost from original costUSD
- **WHEN** 费用来自顶层 `costUSD` 字段
- **THEN** `isEstimated` SHALL 为 false，`totalUSD` SHALL 为原始值

### Requirement: Display token counts in reports

报告 SHALL 在展示费用的同时展示 token 统计。格式为：`$X.XX (N in / M out)`。当费用为 $0.00 时，token 统计仍 SHALL 显示。

#### Scenario: Daily report with token stats
- **WHEN** 生成日报，某项目 session 有 inputTokens=50000, outputTokens=2000, totalUSD=1.65
- **THEN** 报告 SHALL 显示类似 `Cost: $1.65 (50.0K in / 2.0K out)`

#### Scenario: Zero cost with non-zero tokens
- **WHEN** 费用为 $0.00 但有 token 活动（如 glm-5.1）
- **THEN** 报告 SHALL 显示 `Cost: $0.00 (50.0K in / 2.0K out)` 而非隐藏成本行
