## Why

当前 CLI 只能生成汇总报告（daily/weekly/project），无法查看单个 session 的详细信息。用户需要按项目和日期快速定位并浏览具体的 session 内容——包括消息统计、使用的模型、编辑的文件、成本等。这对于回顾工作、调试问题和了解时间开销很有价值。

## What Changes

- 新增 `session list` 命令：按项目名过滤、按日期范围过滤，列出匹配的 session 摘要
- 新增 `session show <sessionId>` 命令：显示单个 session 的详细信息（标题、时间、消息数、成本、模型、编辑文件列表）
- 在 session list 输出中显示可读的 session 标识（自定义标题或 ID 前缀）
- 支持按项目路径子串匹配（与现有 `report project` 行为一致）

## Capabilities

### New Capabilities
- `session-browser`: 提供 session 列表和详情查看功能，支持按项目和日期过滤

### Modified Capabilities

## Impact

- **新增文件**: `src/cli/session-handlers.ts`（list/show 命令处理逻辑）
- **修改文件**: `src/cli/index.ts`（注册新命令）、`src/aggregator/build-summaries.ts`（可能需要暴露过滤能力）
- **依赖**: 无新外部依赖，复用现有 parser + aggregator 层
- **类型**: 复用现有 `SessionSummary` 类型，新增 `formatSessionRow` 和 `formatSessionDetail` 格式化函数到 `src/report/` 层
