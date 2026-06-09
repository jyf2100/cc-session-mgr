# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

`cc-session-mgr` 是一个只读 CLI 工具，分析 Claude Code 本地 session 数据（`~/.claude/`），生成日报、周报和项目分析报告（Markdown 格式）。**永远不会修改** `~/.claude/` 下的任何文件。

## 常用命令

```bash
npm run build          # 编译 TypeScript（tsc）
npm run dev            # 监听模式编译（tsc --watch）
npm run test           # 运行所有测试（vitest run）
npm run test:watch     # 监听模式测试
npm run lint           # 类型检查（tsc --noEmit）

# 运行单个测试文件
npx vitest run src/parser/parser.test.ts

# 按测试名匹配运行
npx vitest run -t "aggregateByDate"

# 运行 CLI
node dist/cli/index.js report daily
node dist/cli/index.js report weekly 2026-W23
node dist/cli/index.js report project <项目名>
```

## 架构：四阶段管线

```
~/.claude/projects/*.jsonl
        ↓
Phase 1 — parser/     解析 JSONL，提取元数据、消息统计、成本、文件编辑
        ↓
Phase 2 — aggregator/  构建 SessionSummary，按日期/周/项目分组，合并外部成本
        ↓
Phase 3 — report/     纯函数：类型化数据 → Markdown 字符串
        ↓
Phase 4 — cli/        Commander CLI 入口，调用以上三层
```

**数据流向严格单向**，各阶段之间通过 `src/types/index.ts` 中定义的类型连接：
- `JsonlEntry` → `SessionSummary` → `DateGroup`/`WeekGroup`/`ProjectGroup` → `DailyReportData`/`WeeklyReportData`/`ProjectReportData`

## 关键设计决策

- **流式 JSONL 解析**：使用 Node.js `readline` 逐行解析，不将整个文件加载到内存
- **三层路径解码**：session metadata 中的路径 → JSONL 内的 `cwd` 字段 → naive fallback（将编码目录名中的 `-` 替换回 `/`）
- **双源成本数据**：合并 JSONL 内联 `costUSD` 和 `~/.claude/metrics/costs.jsonl`，取较大值
- **report/ 是纯函数层**：除了 `output.ts`（文件写入），其余模块只做数据→字符串转换
- **每个模块目录有 `index.ts` barrel export**

## 模块系统

ESM 全栈（`"type": "module"`），使用 Node16 模块解析。所有 import 路径必须带 `.js` 扩展名。

## 测试约定

- 测试框架：Vitest，测试文件放在 `src/**/*.test.ts`
- 集成测试（`src/integration.test.ts`）读取真实 `~/.claude/` 数据，无数据时自动跳过（`describe.skip`）
- 文件系统测试使用 `os.tmpdir()` + `beforeEach`/`afterEach` 清理
- 测试辅助工厂函数（如 `makeSummary()`）提供合理的默认值

## OpenSpec 工作流

项目使用 openspec 管理变更（配置在 `openspec/config.yaml`）。设计文档、规格和任务列表在 `openspec/changes/` 下。
