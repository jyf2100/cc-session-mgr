## Context

项目已有完整的 JSONL 解析管线，`buildSessionSummaries()` 返回 `SessionSummary[]`。CLI 层通过 Commander 注册命令。当前无 Web 相关代码。

用户需要一个浏览器界面来交互式浏览 session 数据，而不是在终端看 Markdown 表格。

## Goals / Non-Goals

**Goals:**
- 本地 HTTP 服务器，`session-mgr web` 一键启动
- 单页应用：项目列表 → 选择项目 → session 列表（可按日期筛选）→ session 详情
- REST API 返回 JSON，前端原生 JS 消费
- 零前端构建工具（内联 HTML/CSS/JS）
- 成本和 token 的可视化（简单柱状图即可）

**Non-Goals:**
- 不做用户认证（纯本地工具，仅绑定 localhost）
- 不做实时更新（每次启动时加载一次数据）
- 不做 WebSocket 或热重载
- 不引入 React/Vue 等前端框架

## Decisions

### 1. 使用 Node.js 内置 `http` 模块

**选择**: 用 `node:http` 手写路由，不引入 Express/Hono。

**原因**: 项目只有 4-5 个端点，不需要路由框架。避免新增依赖。

**替代方案**: Hono（轻量）。不选——为了一个本地工具不值得加依赖。

### 2. 数据启动时加载，缓存在内存

**选择**: 服务器启动时调用 `buildSessionSummaries()` + `mergeCostData()`，结果存在内存中。API handler 直接查询内存数据。

**原因**: 数据量小（通常 < 1000 sessions），无需数据库。避免每次请求都重新解析文件。

**风险**: 数据更新后需重启服务器。→ 可接受，启动只需几秒。

### 3. 前端为单个 HTML 字符串，由 `src/web/ui.ts` 导出

**选择**: `ui.ts` 导出一个 `getHtml()` 函数，返回完整的 HTML 字符串（含内联 CSS + JS）。

**原因**: 零构建步骤，TypeScript 直接拼接字符串。适合工具类项目。

**替代方案**: 独立 HTML 文件 + `fs.readFile`。不选——保持单文件部署简单性。

### 4. API 端点设计

```
GET /api/projects          → [{name, path, sessionCount, dateRange}]
GET /api/sessions?project=&from=&to=  → [{id, title, date, msgs, cost}]
GET /api/sessions/:id      → {full SessionSummary + fileEdits}
GET /                      → HTML page
```

**原因**: 三个端点覆盖所有视图需求。过滤参数通过 query string 传递。

### 5. 前端交互：原生 fetch + DOM

**选择**: 用 `fetch()` 调 API，`document.createElement()` 渲染 DOM。

**原因**: 无框架开销，页面简单（三个视图），代码量小。

## Risks / Trade-offs

- **无前端构建**: CSS/JS 无压缩、无 HMR。→ 可接受，这是开发工具不是生产应用
- **内存缓存**: 大量 session 时内存占用增加。→ 短期可接受
- **单文件 HTML**: 后续维护可能变长。→ 可在超过 500 行时拆分为独立文件
- **无 WebSocket**: 数据不会自动刷新。→ 用户重启服务器即可
