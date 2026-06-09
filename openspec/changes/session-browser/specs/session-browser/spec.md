## ADDED Requirements

### Requirement: Session list with project and date filters

系统 SHALL 提供 `session list` 命令，列出匹配过滤条件的 session。支持 `--project <name>`（项目路径子串匹配）、`--from <date>` 和 `--to <date>`（日期范围过滤，含边界）参数。输出 SHALL 以 Markdown 表格形式展示，包含列：ID（前 8 位）、标题、日期、消息数、成本（含 token）。

#### Scenario: List all sessions for a specific project
- **WHEN** 用户运行 `session list --project cc-session-mgr`
- **THEN** 系统 SHALL 列出项目路径包含 "cc-session-mgr" 的所有 session，按时间倒序排列

#### Scenario: List sessions in a date range
- **WHEN** 用户运行 `session list --from 2026-06-01 --to 2026-06-07`
- **THEN** 系统 SHALL 列出 startTime 在该日期范围内的 session（含边界日期）

#### Scenario: List with default limit
- **WHEN** 用户运行 `session list` 不带 `--limit`
- **THEN** 系统 SHALL 最多显示 20 条记录，按 startTime 倒序

#### Scenario: List with custom limit
- **WHEN** 用户运行 `session list --limit 5`
- **THEN** 系统 SHALL 最多显示 5 条记录

#### Scenario: List with no matching sessions
- **WHEN** 过滤条件没有匹配任何 session
- **THEN** 系统 SHALL 输出 "No sessions found matching the criteria."

### Requirement: Session detail view

系统 SHALL 提供 `session show <sessionId>` 命令，显示单个 session 的详细信息。输出 SHALL 包含：session ID、项目路径、起止时间、消息计数（user/assistant/system）、成本（含 token 统计）、使用的模型列表、编辑的文件列表（按编辑次数降序）。session ID SHALL 支持前缀匹配（输入前 8 位即可）。

#### Scenario: Show session with full ID
- **WHEN** 用户运行 `session show abc12345-def6-7890-ghij-klmnopqrstuv`
- **THEN** 系统 SHALL 显示该 session 的完整详情

#### Scenario: Show session with short ID prefix
- **WHEN** 用户运行 `session show abc12345`（仅前 8 位）
- **THEN** 系统 SHALL 查找以 "abc12345" 开头的 session 并显示详情

#### Scenario: Ambiguous short ID
- **WHEN** 用户运行 `session show abc12345` 且有多个 session 以此前缀开头
- **THEN** 系统 SHALL 报错 "Multiple sessions match prefix 'abc12345'. Please use a longer prefix."

#### Scenario: No matching session
- **WHEN** 用户运行 `session show nonexistent`
- **THEN** 系统 SHALL 报错 "Session not found: nonexistent"

### Requirement: Session list output format

`session list` 的输出 SHALL 以 Markdown 表格形式展示。每行包含：短 ID、标题（自定义标题或 "Untitled"）、日期（YYYY-MM-DD）、消息数（user + assistant）、成本（`$X.XX (N in / M out)` 格式）。表格前 SHALL 显示匹配总数。

#### Scenario: Table with session rows
- **WHEN** 匹配到 3 个 session
- **THEN** 输出 SHALL 包含标题行 "Showing 3 sessions (limit: 20)"，后跟 Markdown 表格，每行一个 session

#### Scenario: Session without custom title
- **WHEN** 一个 session 没有 customTitle
- **THEN** 标题列 SHALL 显示 "Untitled"
