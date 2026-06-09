## ADDED Requirements

### Requirement: Project list view

Web UI SHALL 显示所有项目的列表视图。每个项目 SHALL 显示项目名称、session 数量、活跃日期范围。点击项目 SHALL 导航到该项目的 session 列表视图。

#### Scenario: Display multiple projects
- **WHEN** 加载项目列表页面
- **THEN** 页面 SHALL 显示所有项目卡片，每个包含名称、session 计数、日期范围

#### Scenario: Click project to filter sessions
- **WHEN** 用户点击某个项目
- **THEN** 页面 SHALL 显示该项目下的 session 列表，并更新 URL hash 为 `#project=<name>`

### Requirement: Session list view with date filter

Web UI SHALL 显示 session 列表视图，支持按日期范围筛选。每个 session 行 SHALL 显示：短 ID、标题（或 "Untitled"）、日期、消息数、成本。列表 SHALL 按时间倒序排列。SHALL 支持日期选择器输入 `from` 和 `to` 日期。

#### Scenario: Sessions for a selected project
- **WHEN** 选择了项目 "cc-session-mgr"
- **THEN** 列表 SHALL 只显示该项目下的 session

#### Scenario: Filter by date range
- **WHEN** 用户设置日期范围为 2026-06-01 到 2026-06-07
- **THEN** 列表 SHALL 只显示该日期范围内的 session

#### Scenario: Click session to view details
- **WHEN** 用户点击某个 session 行
- **THEN** 页面 SHALL 导航到该 session 的详情视图，URL hash 更新为 `#session=<id>`

### Requirement: Session detail view

Web UI SHALL 显示单个 session 的详细信息。SHALL 包含以下部分：session ID、项目路径、起止时间、消息计数（分类显示 user/assistant/system）、成本（含 token 统计 `N in / M out`）、使用的模型列表、编辑的文件列表（按编辑次数降序，显示前 20 个文件）。

#### Scenario: Display session with all fields
- **WHEN** 查看 session 详情
- **THEN** 页面 SHALL 显示所有字段：ID、项目、时间、消息数、成本（含 token）、模型、文件编辑列表

#### Scenario: Session with no file edits
- **WHEN** session 没有文件编辑记录
- **THEN** 文件编辑部分 SHALL 显示 "No file edits in this session."

### Requirement: Responsive layout

Web UI SHALL 使用三栏布局：左侧项目列表（固定宽度），中间 session 列表（可滚动），右侧/下方 session 详情。在窄屏（< 768px）下 SHALL 堆叠为单列。

#### Scenario: Desktop layout
- **WHEN** 浏览器宽度 >= 768px
- **THEN** 页面 SHALL 显示为左-中-右三栏布局

#### Scenario: Mobile layout
- **WHEN** 浏览器宽度 < 768px
- **THEN** 页面 SHALL 堆叠为单列，项目列表在顶部可折叠
