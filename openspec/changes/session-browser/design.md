## Context

当前 CLI 通过 `report daily/weekly/project` 生成汇总 Markdown 报告。底层数据管线已经将 `~/.claude/` JSONL 解析为 `SessionSummary[]`，每个 summary 包含 sessionId、时间、消息计数、成本、模型、文件编辑等信息。但用户无法直接查询和浏览单个 session。

现有管线：`parser → aggregator → report → cli`，其中 `buildSessionSummaries()` 返回完整的 `SessionSummary[]`。

## Goals / Non-Goals

**Goals:**
- 按项目路径子串和日期范围过滤 session 列表
- 以紧凑表格形式列出匹配 session（标题、时间、消息数、成本）
- 按 sessionId 查看单个 session 的详细信息
- 复用现有 parser + aggregator 层，不引入新依赖

**Non-Goals:**
- 不做交互式 TUI（如 inquirer 选择菜单）——纯 CLI 参数驱动
- 不做 session 内容浏览（消息正文、工具调用详情）
- 不做 JSON 输出格式（后续可扩展）

## Decisions

### 1. 命令结构：`session list` + `session show`

**选择**: 在 `session` 子命令下新增 `list` 和 `show` 两个子命令。

**替代方案**: 单个 `session` 命令用 `--detail` 标志区分。不选——语义不够清晰，且 show 需要 sessionId 参数，list 不需要。

```
session-mgr session list [--project <name>] [--from <date>] [--to <date>]
session-mgr session show <sessionId>
```

### 2. 过滤逻辑放在 CLI handler 层

**选择**: 不修改 `aggregator` 层，在 CLI handler 中对 `SessionSummary[]` 做 filter/map。

**原因**: 过滤是展示需求，不是聚合逻辑。`buildSessionSummaries()` 已经返回完整数据，handler 中过滤更简单直接。

### 3. 格式化函数放在 `src/report/session-format.ts`

**选择**: 新建 `session-format.ts`，包含 `formatSessionRow()` 和 `formatSessionDetail()` 纯函数。

**原因**: 与现有 `report/` 层风格一致（纯函数，数据→字符串），便于测试。

### 4. list 默认按时间倒序，限制输出数量

**选择**: 默认显示最近 20 条，`--limit` 可调，按 startTime 倒序。

**原因**: 避免大量 session 刷屏。用户可以 `--limit 0` 显示全部。

## Risks / Trade-offs

- **sessionId 不直观**: 用户需要先 `list` 获取 ID，再 `show` 查看详情。→ 显示 ID 前 8 位 + 标题，方便识别
- **全量加载**: `buildSessionSummaries()` 每次都解析全部 JSONL。→ 短期可接受（数据量不大），后续可加缓存
- **compacted session 的标题可能为 null**: → 显示 ID 前 8 位作为 fallback
