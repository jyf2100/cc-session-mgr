## Why

Claude Code 在 `~/.claude/` 下存储了大量有价值的 session 数据（JSONL 对话记录、成本指标、文件编辑历史、任务状态），但这些数据目前处于"原始文件"状态——没有结构化查询、没有聚合分析、没有可读的输出格式。开发者无法回答"本周我在哪些项目上花了多少时间/金钱？"、"这个项目的 session 活动趋势如何？"这样的基本问题。需要一套工具来解析、聚合这些 session 数据，生成日报、周报和项目维度的分析报告。

## What Changes

- 新增 JSONL 解析引擎，读取 `~/.claude/projects/` 下的所有 session transcript 文件
- 新增 session 元数据提取器，解析 `~/.claude/sessions/` 下的活跃进程注册表
- 新增成本聚合器，从 `costs.jsonl` 和 session transcript 中提取 token 用量与费用
- 新增时间维度聚合（按天、按周、按项目），生成结构化报告数据
- 新增报告生成器，输出 Markdown 格式的日报、周报、项目分析报告
- 新增 CLI 入口，支持 `session-mgr report daily`、`session-mgr report weekly`、`session-mgr report project <name>` 命令
- 新增子代理 transcript 关联分析，将子代理活动归属到主 session

## Capabilities

### New Capabilities
- `jsonl-parser`: 解析 Claude Code JSONL transcript 文件，提取结构化消息、元数据和链表关系
- `session-aggregator`: 按时间维度（日/周）和项目维度聚合 session 数据，生成统计摘要
- `report-generator`: 基于聚合数据生成 Markdown 格式的日报、周报和项目分析报告
- `cli-interface`: 提供命令行入口，支持 daily/weekly/project 子命令及参数

### Modified Capabilities

（无现有 capability 需要修改——这是全新项目）

## Impact

- **新增文件**：`src/` 目录下的 TypeScript 源文件（解析器、聚合器、报告生成器、CLI 入口）
- **依赖项**：需要 `commander`（CLI 框架）、`glob`（文件发现）、原生 `fs` 读取
- **输入数据源**：`~/.claude/projects/**/*.jsonl`、`~/.claude/sessions/*.json`、`~/.claude/metrics/costs.jsonl`
- **输出**：Markdown 报告文件到 stdout 或指定输出路径
- **无破坏性变更**：只读取 Claude Code 的现有数据文件，不做任何写入或修改
