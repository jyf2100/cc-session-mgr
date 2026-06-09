## ADDED Requirements

### Requirement: Local HTTP server with startup data loading

系统 SHALL 提供 `session-mgr web [--port <port>]` 命令启动本地 HTTP 服务器。默认端口 SHALL 为 3000。服务器 SHALL 仅绑定 `localhost`（127.0.0.1）。启动时 SHALL 调用 `buildSessionSummaries()` + `mergeCostData()` 加载数据到内存。启动完成后 SHALL 在 stdout 打印访问 URL。

#### Scenario: Start with default port
- **WHEN** 用户运行 `session-mgr web`
- **THEN** 系统 SHALL 在 `http://localhost:3000` 启动服务器，并打印 "Server running at http://localhost:3000"

#### Scenario: Start with custom port
- **WHEN** 用户运行 `session-mgr web --port 8080`
- **THEN** 系统 SHALL 在 `http://localhost:8080` 启动服务器

#### Scenario: Port already in use
- **WHEN** 指定端口已被占用
- **THEN** 系统 SHALL 打印错误信息并退出（exit code 1）

### Requirement: REST API endpoints

系统 SHALL 提供以下 API 端点：

- `GET /` — 返回 Web UI 的 HTML 页面
- `GET /api/projects` — 返回项目列表 JSON
- `GET /api/sessions?project=&from=&to=` — 返回过滤后的 session 列表 JSON（参数均可选）
- `GET /api/sessions/:id` — 返回单个 session 详情 JSON（支持 ID 前缀匹配）

所有 API 响应 SHALL 设置 `Content-Type: application/json`（HTML 页面除外）。不匹配的路由 SHALL 返回 404。

#### Scenario: GET /api/projects returns project list
- **WHEN** 请求 `GET /api/projects`
- **THEN** 系统 SHALL 返回 JSON 数组，每项包含 `name`、`path`、`sessionCount`、`dateRange`（start/end）

#### Scenario: GET /api/sessions with filters
- **WHEN** 请求 `GET /api/sessions?project=cc-session-mgr&from=2026-06-01&to=2026-06-09`
- **THEN** 系统 SHALL 返回匹配的 session 数组，每项包含 `id`、`title`、`date`、`messages`、`cost`

#### Scenario: GET /api/sessions/:id with prefix match
- **WHEN** 请求 `GET /api/sessions/abc12345`
- **THEN** 系统 SHALL 查找以 "abc12345" 开头的 session，返回完整详情 JSON

#### Scenario: Ambiguous prefix returns 400
- **WHEN** 请求的 ID 前缀匹配多个 session
- **THEN** 系统 SHALL 返回 HTTP 400，body 包含错误信息和匹配列表

#### Scenario: Unknown route returns 404
- **WHEN** 请求 `GET /unknown`
- **THEN** 系统 SHALL 返回 HTTP 404
