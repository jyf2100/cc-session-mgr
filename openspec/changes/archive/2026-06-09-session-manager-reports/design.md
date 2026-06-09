## Context

Claude Code 将所有会话数据存储在 `~/.claude/` 目录下的多层文件结构中：
- **JSONL transcript**：`~/.claude/projects/<encoded-path>/<session-uuid>.jsonl`，每行一个 JSON 对象
- **进程注册表**：`~/.claude/sessions/<pid>.json`，活跃 session 元数据
- **成本指标**：`~/.claude/metrics/costs.jsonl`，每次请求的成本
- **任务状态**：`~/.claude/tasks/<session-uuid>/*.json`
- **文件历史**：`~/.claude/file-history/<session-uuid>/`

当前没有工具能聚合这些数据。用户需要手动 `cat` 和 `jq` JSONL 文件才能了解自己的使用模式。

## Goals / Non-Goals

**Goals:**
- 解析 `~/.claude/` 下的所有 session 数据源，提供统一的结构化视图
- 按时间维度（日/周）聚合生成可读的 Markdown 报告
- 按项目维度生成项目活动分析报告
- 报告包含：会话数量、活跃时间、成本统计、模型使用分布、文件编辑摘要
- CLI 工具可直接集成到终端工作流（stdout 输出或写入文件）
- 零写入：只读取数据，永不修改 Claude Code 的任何文件

**Non-Goals:**
- 不提供 Web UI 或 TUI 界面（纯 CLI + Markdown 输出）
- 不做 session 管理（删除、重命名、合并）——只做报告分析
- 不支持远程存储适配器（S3/Redis）——只分析本地文件
- 不做实时监控——只分析历史数据
- 不处理加密或安全的 session 存储

## Decisions

### D1: TypeScript + Node.js 运行时

**选择**: TypeScript 作为实现语言，Node.js 运行时

**理由**: Claude Code 生态以 TypeScript 为主；`commander` 提供成熟的 CLI 框架；原生 `fs` 和 `readline` 足以处理 JSONL 流式解析。

**替代方案**: Python（更丰富的数据处理库，但与 Claude Code 生态割裂）、Rust（性能更好但开发成本高）。

### D2: 流式 JSONL 解析（而非全量加载）

**选择**: 使用 Node.js `readline` 逐行解析 JSONL，不全量加载到内存

**理由**: 单个 session JSONL 可达 50MB，项目目录下可有 100+ 个 session。全量加载可能导致内存溢出。流式解析可处理任意大小的文件。

**替代方案**: `JSON.parse(fs.readFileSync(...))` 全量加载（简单但内存风险高）。

### D3: 两阶段处理架构

**选择**: "解析 → 聚合"两阶段架构

```
阶段 1: 扫描 + 解析
  +-- 发现所有 JSONL 文件
  +-- 流式解析每行，提取关键字段
  +-- 生成轻量级 SessionSummary 对象

阶段 2: 聚合 + 报告
  +-- 按时间/项目维度分组
  +-- 计算统计指标
  +-- 渲染 Markdown 报告
```

**理由**: 分离关注点使每个阶段可独立测试；轻量级 summary 对象降低内存压力；报告格式可扩展。

### D4: 项目路径解码策略

**选择**: 三层解码策略（与 claude-picker 一致）

1. 从 `~/.claude/sessions/*.json` 的 `cwd` 字段获取真实路径
2. 从 JSONL 文件内的 `cwd` 字段扫描
3. 回退到 naive 解码（将 `-` 替换回 `/`）

**理由**: 编码是有损的（所有非字母数字字符都变成 `-`），需要可靠的逆向映射。

### D5: 成本数据双源合并

**选择**: 同时从 `costs.jsonl` 和 session JSONL 内的 `costUSD` 字段提取成本

**理由**: `costs.jsonl` 提供精确的每次请求成本；session JSONL 内的 `costUSD` 提供每个 assistant 消息的累计成本。两者互补。

## Risks / Trade-offs

**[大目录扫描性能]** -> 使用 `glob` 并行发现 + 流式解析，避免全量加载。对于超大目录（1000+ session），添加 `--recent N` 参数限制扫描范围。

**[路径编码歧义]** -> 路径解码可能产生误匹配（如 `my-project` 和 `my_project` 编码相同）。通过三层解码策略（session 元数据 -> JSONL cwd -> naive 回退）降低风险。

**[JSONL 格式变更]** -> Claude Code 版本更新可能改变 JSONL 记录格式。解析器使用宽松的 `type` 字段匹配 + 未知字段忽略策略，保证向前兼容。

**[并发访问]** -> 报告生成期间 Claude Code 可能正在写入 JSONL 文件。使用 `fs.createReadStream` 读取，不持有文件锁，允许并发读写。
