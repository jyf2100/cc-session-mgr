## Why

CLI 的 `session list` / `session show` 命令是纯文本输出，无法提供交互式的点击、筛选和导航体验。用户需要一个可视化的 Web 界面来按项目→日期→session 层级浏览数据，查看图表化的成本和 token 统计，快速定位感兴趣的工作会话。

## What Changes

- 新增 `session-mgr web [--port <port>]` 命令，启动本地 HTTP 服务器
- 提供单页 Web UI：左侧项目列表 + 日期筛选，右侧 session 列表/详情
- API 端点返回 JSON 数据（项目列表、按项目+日期过滤的 session、session 详情）
- 内联 HTML/CSS/JS（不引入前端构建工具），使用原生 fetch + DOM 操作
- 复用现有 `buildSessionSummaries()` + `mergeCostData()` 数据管线

## Capabilities

### New Capabilities
- `web-server`: 本地 HTTP 服务器，提供 REST API 端点和内联 Web UI
- `web-ui-views`: 单页应用的三个视图——项目列表、session 列表、session 详情

### Modified Capabilities

## Impact

- **新增文件**: `src/web/server.ts`（HTTP 服务器 + API 路由）、`src/web/ui.ts`（内联 HTML/CSS/JS 字符串）、`src/web/api-handlers.ts`（API 逻辑）
- **修改文件**: `src/cli/index.ts`（注册 `web` 命令）、`src/parser/index.ts` 或 `src/aggregator/index.ts`（可能需要导出查询函数）
- **依赖**: 无新外部依赖，使用 Node.js 内置 `http` 模块
- **类型**: 新增 `WebServerOptions` 类型
