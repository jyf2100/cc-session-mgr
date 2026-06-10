# cc-session-mgr

一个只读 CLI 工具，分析 Claude Code 本地 session 数据（`~/.claude/`），生成**日报**、**周报**和**项目分析报告**（Markdown 格式）。永远不会修改 `~/.claude/` 下的任何文件。

## 功能亮点

- **工作日报** — 按项目分组展示当日所有 session 的工作内容、文件编辑、成本统计
- **工作周报** — 以项目为中心汇总一周工作，按日期展示每个 session 的摘要
- **日报/周报** — 基础统计报告（session 数量、消息数、token、成本）
- **项目报告** — 完整项目历史：成本、高频文件、模型分布、近期 session
- **TUI 交互界面** — 终端内浏览日报/周报，支持 `←/→` 导航、`e` 一键导出
- **Web UI** — 浏览器中查看 session 数据
- **LLM 总结** — 支持 Anthropic / Ollama，为每个 session 自动生成工作摘要
- **双源成本数据** — 合并 JSONL 内联 `costUSD` 和 `~/.claude/metrics/costs.jsonl`，取较大值
- **时区支持** — 通过 `--tz` 指定时区，正确处理跨日 session

## 安装

```bash
# npm 全局安装（推荐）
npm install -g cc-session-mgr

# 或从源码构建
git clone https://github.com/jyf2100/cc-session-mgr.git
cd cc-session-mgr
npm install
npm run build
npm link
```

**环境要求**: Node.js >= 20.0.0

## 快速开始

```bash
# 今日工作日报
session-mgr report work-daily

# 本周工作周报
session-mgr report work-weekly

# 启动 TUI 交互界面
session-mgr tui

# 启动 Web UI
session-mgr web
```

## 使用指南

### 工作日报 / 周报

工作报告会提取每个 session 的工作内容（主要意图、编辑文件、涉及模块），并可选通过 LLM 生成自然语言摘要。

```bash
# 今日工作日报
session-mgr report work-daily

# 指定日期
session-mgr report work-daily 2026-06-09

# 本周工作周报
session-mgr report work-weekly

# 指定周（ISO 周格式）
session-mgr report work-weekly 2026-W23

# 写入文件
session-mgr --output report.md report work-daily

# 带 LLM 总结（需要 ANTHROPIC_API_KEY 或本地 Ollama）
session-mgr report work-daily --llm anthropic
session-mgr report work-weekly --llm ollama --llm-model qwen3:8b
```

### 基础日报 / 周报

基础报告展示统计信息，不包含工作内容分析。

```bash
session-mgr report daily
session-mgr report daily 2026-06-09
session-mgr report weekly
session-mgr report weekly 2026-W23
```

### 项目报告

```bash
# 按项目名称/路径子串匹配
session-mgr report project cc-session-mgr
```

### TUI 交互界面

```bash
# 启动 TUI
session-mgr tui

# 指定报告导出目录
session-mgr tui --report-dir ~/Documents/reports

# 带 LLM 总结
session-mgr tui --llm anthropic

# 指定时区
session-mgr tui --tz Asia/Shanghai
```

TUI 内操作：
- `←/→` — 切换日期（日报）或周（周报）
- `e` — 导出当前视图为 Markdown 文件
- `1-6` — 切换不同视图（Dashboard、日报、周报、Session 列表等）
- `q` — 退出

### Web UI

```bash
session-mgr web
# 默认在 http://localhost:14165 启动
```

### Session 浏览

```bash
# 列出所有 session
session-mgr session list

# 查看单个 session 详情
session-mgr session show <session-id>
```

## 全局选项

| 选项 | 说明 |
|------|------|
| `--claude-dir <path>` | `~/.claude` 目录路径（默认自动检测） |
| `--output <path>` | 报告写入文件而非 stdout |
| `--tz <timezone>` | IANA 时区（如 `Asia/Shanghai`、`UTC`） |
| `--llm <provider>` | LLM 提供者：`anthropic` \| `ollama`（默认自动检测） |
| `--llm-model <name>` | LLM 模型名称（ollama 必需） |
| `--llm-base-url <url>` | LLM API 地址（覆盖默认值） |
| `--no-llm` | 禁用 LLM 总结 |
| `--version` | 显示版本 |
| `--help` | 显示帮助 |

## LLM 总结

工作报告支持通过 LLM 为每个 session 自动生成工作摘要，提升报告可读性。

### Anthropic（推荐）

```bash
# 设置 API Key
export ANTHROPIC_API_KEY=sk-ant-...

# 使用（默认 claude-haiku-4-5）
session-mgr report work-daily --llm anthropic
```

### Ollama（本地）

```bash
# 启动 Ollama 服务
ollama serve

# 使用
session-mgr report work-daily --llm ollama --llm-model qwen3:8b
```

### 自动检测

不指定 `--llm` 时，自动检测 `ANTHROPIC_API_KEY` 或本地 Ollama 服务。per-session 摘要结果会缓存到磁盘，不会重复调用 API。

## 架构

四阶段管线，数据流严格单向：

```
~/.claude/projects/*.jsonl
        ↓
Phase 1 — parser/       解析 JSONL，提取元数据、消息统计、成本、文件编辑
        ↓
Phase 2 — aggregator/    构建 SessionSummary，按日期/周/项目分组
        ↓
Phase 3 — report/        纯函数：类型化数据 → Markdown 字符串
        ↓
Phase 4 — cli/           Commander CLI 入口 + TUI + Web UI
```

```
src/
├── types/              # TypeScript 类型定义
├── parser/             # Phase 1: 流式 JSONL 解析、路径解码
├── aggregator/         # Phase 2: 聚合、分组、合并成本
├── report/             # Phase 3: Markdown 生成 + 共享管线
│   ├── pipeline.ts     # CLI 和 TUI 共用的报告管线
│   ├── work-daily.ts   # 工作日报 Markdown 生成
│   └── work-weekly.ts  # 工作周报 Markdown 生成
├── summarize/          # LLM 总结（Anthropic / Ollama + 磁盘缓存）
├── tui/                # TUI 交互界面（Ink v6 + React）
├── web/                # Web UI
└── cli/                # CLI 入口（Commander）
```

## 开发

```bash
npm install          # 安装依赖
npm run build        # 编译 TypeScript
npm run dev          # 监听模式编译
npm run test         # 运行测试
npm run test:watch   # 监听模式测试
npm run lint         # 类型检查
npm run format       # 格式化代码
```

## License

MIT
