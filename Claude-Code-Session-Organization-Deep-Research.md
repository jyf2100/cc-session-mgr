# Claude Code Session 组织结构深度分析报告

## 执行摘要

Claude Code 的 session（会话）系统是一个基于 **追加式 JSONL（JSON Lines）文件** 的持久化架构，每个对话以 UUID 标识，按项目路径隔离存储于 `~/.claude/projects/` 目录下。系统采用 **父-UUID 链表** 结构组织消息，支持子代理（subagent）独立上下文、上下文压缩（compaction）、会话分支（fork）、跨文件续接（continuation）等高级特性。整个架构围绕"进程级单例写入 + 追加式日志"的核心设计模式构建，确保了崩溃安全和高效恢复能力 [1][2][3]。

---

## 关键发现

- **存储格式**：每个 session 对应一个 JSONL 文件，每行是一个自包含的 JSON 对象，通过 `parentUuid` → `uuid` 构成链表结构 [1][3]
- **项目隔离**：session 按工作目录路径编码（`sanitizePath`）隔离存储，不同项目的会话互不干扰 [1][2]
- **多层 Transcript 层级**：主会话、子代理、工作流代理分别拥有独立的 JSONL 文件和元数据文件 [3][4]
- **上下文压缩（Compaction）**：当 token 接近上下文窗口限制时，自动生成摘要并标记 `compact_boundary`，保持对话连续性 [5][6]
- **跨文件续接（Continuation）**：新 session 文件可通过共享 `slug` 和 `parentUuid` 桥接机制与父 session 无缝连接 [5]
- **会话分支（Fork）**：通过 `/branch` 或 `--fork-session` 创建对话分支，原始 session 保持不变 [1][7]

---

## 详细分析

### 1. 目录布局与存储结构

#### 1.1 顶层目录 `~/.claude/`

Claude Code 的所有持久化数据存储在 `~/.claude/` 目录下（可通过 `CLAUDE_CONFIG_DIR` 环境变量自定义）：

```
~/.claude/
├── projects/              # 核心：所有 session transcript 文件
├── sessions/              # 活跃进程注册表（PID → session 映射）
├── session-data/          # session 摘要文件（Markdown 格式）
├── session-env/           # 每个会话的环境快照（通常为空）
├── file-history/          # 文件编辑历史（按 session UUID 组织）
├── tasks/                 # 任务列表状态（按 session UUID 组织）
├── shell-snapshots/       # Shell 环境快照
├── history.jsonl          # 全局命令历史索引
├── metrics/               # 成本追踪
│   └── costs.jsonl
├── paste-cache/           # 粘贴内容缓存
├── plans/                 # 规划文件
├── ide/                   # IDE 集成锁文件
└── settings.json          # 全局配置
```

#### 1.2 项目级目录

Session 按项目路径隔离存储。工作目录路径通过 `sanitizePath()` 函数编码为目录名：将所有非字母数字字符替换为连字符 [1][3]。

```
~/.claude/projects/
├── -Users-roc/                                    # ~/ (home dir)
├── -Volumes-work-workspace-worksummary-cc-session-mgr/  # 本项目
├── -Volumes-work-workspace-worksummary-my-obstain/     # my-obstain 项目
├── -Volumes-work-workspace-worksummary-my-obstain--claude-worktrees-redesign-pi-integration/
│                                                  # worktree 隔离目录
└── ...
```

**路径编码规则** [3]：
- 将路径中的 `/` 和所有非字母数字字符替换为 `-`
- 超过 200 字符的路径会追加哈希后缀（Bun 使用 `Bun.hash`，Node 回退到 `djb2Hash`）
- 不同 worktree 的 session 存储在各自的编码目录中

#### 1.3 Session 文件级结构

每个 session 由一个主 JSONL 文件和一个可选的子目录组成：

```
~/.claude/projects/<encoded-project-path>/
├── {session-uuid}.jsonl                           # 主 transcript 文件
├── {session-uuid}/                                # session 子目录
│   ├── subagents/                                 # 子代理 transcript
│   │   ├── agent-{agent-id}.jsonl                 # 子代理对话记录
│   │   ├── agent-{agent-id}.meta.json             # 代理元数据
│   │   └── workflows/{run-id}/
│   │       └── agent-{agent-id}.jsonl             # 工作流代理记录
│   ├── remote-agents/
│   │   └── remote-agent-{task-id}.meta.json       # 远程代理元数据
│   └── tool-results/                              # 工具结果缓存
│       └── call_{tool-call-id}.json               # 大型工具输出
├── {session-uuid-2}.jsonl                         # 另一个 session
└── memory/                                        # 项目级持久记忆（可选）
```

### 2. JSONL 记录格式与类型系统

#### 2.1 核心记录类型

每行 JSONL 是一个独立的 JSON 对象，通过 `type` 字段区分类型 [1][3][5]：

| 类型 | 是否发送给 API | 用途 |
|------|:---:|------|
| `user` | 是 | 用户消息和工具结果 |
| `assistant` | 是 | 模型响应和工具调用 |
| `system` | 否 | 钩子摘要、停止原因、压缩边界 |
| `summary` | 否 | 压缩摘要内容 |
| `custom-title` / `ai-title` | 否 | session 命名 |
| `last-prompt` | 否 | 最近用户提示（用于 `--resume` 选择器） |
| `tag` | 否 | 用户定义的 session 标签 |
| `mode` | 否 | `coordinator` 或 `normal` 模式 |
| `permission-mode` | 否 | 权限级别记录 |
| `worktree-state` | 否 | Git worktree 进入/退出跟踪 |
| `pr-link` | 否 | GitHub PR 关联 |
| `file-history-snapshot` | 否 | 文件变更追踪 |
| `content-replacement` | 否 | 工具输出压缩记录 |
| `compact_boundary` | 否 | 上下文压缩边界标记 |
| `queue-operation` | 否 | 消息队列操作 |
| `progress` | 否 | 流式进度指示器 |

**关键洞察**：只有 `user` 和 `assistant` 类型的条目消耗上下文窗口 token。其他类型仅占用磁盘空间，不占用上下文 [4][5]。

#### 2.2 父-UUID 链表结构

消息通过 `parentUuid` 和 `uuid` 形成链表 [3][5]：

```
msg-A (parentUuid: null)           <- 链表起点
 └── msg-B (parentUuid: A)
      └── msg-C (parentUuid: B)
           └── msg-D (parentUuid: C)  <- 链表末端（leafUuid）
```

这个链表结构支持：
- **消息回溯**：从 `leafUuid` 沿 `parentUuid` 回溯到根节点
- **侧链处理**：子代理消息作为独立的侧链分支
- **压缩后重建**：压缩后通过 `SegmentRelinks` 重新连接保留的消息段

#### 2.3 记录示例

```jsonl
{"type":"last-prompt","leafUuid":"2dfbc2e1-...","sessionId":"ed073caf-..."}
{"type":"mode","mode":"normal","sessionId":"ed073caf-..."}
{"type":"permission-mode","permissionMode":"default","sessionId":"ed073caf-..."}
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"分析session结构"}]},...,"parentUuid":"..."}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"让我来分析..."}]},...,"costUSD":0.0012}
```

### 3. 活跃进程注册表

`~/.claude/sessions/` 目录存储活跃 session 的进程级元数据，以 PID 命名 [8]：

```json
{
  "pid": 46104,
  "sessionId": "ed073caf-b6f1-4f5b-b2fb-38c3a492f694",
  "cwd": "/Volumes/work/workspace/worksummary/cc-session-mgr",
  "startedAt": 1780964554311,
  "procStart": "Tue Jun  9 00:22:33 2026",
  "version": "2.1.169",
  "peerProtocol": 1,
  "kind": "interactive",
  "entrypoint": "cli",
  "status": "busy",
  "updatedAt": 1780964937113,
  "name": "add-api-type-selector"
}
```

**字段说明**：
- `kind`: `interactive`（交互式）或其他类型（如 `sdk`）
- `entrypoint`: `cli`、`sdk`、`vscode` 等入口标识
- `status`: `busy`（忙碌）或 `idle`（空闲）
- `name`: 可选的人类可读 session 名称

### 4. 上下文压缩（Compaction）机制

#### 4.1 自动压缩

当 token 接近上下文窗口限制（实践中约 167K token）时，Claude Code 触发自动压缩 [5][6]：

```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "sessionId": "d8af951f-...",
  "timestamp": "2026-02-21T01:54:29.013Z",
  "uuid": "boundary-uuid-...",
  "logicalParentUuid": "last-msg-before-compaction-...",
  "parentUuid": null,
  "content": "Conversation compacted",
  "compactMetadata": {
    "trigger": "auto",
    "preTokens": 167219
  }
}
```

压缩后紧跟一个合成用户消息，包含对话摘要：

```json
{
  "type": "user",
  "isCompactSummary": true,
  "isVisibleInTranscriptOnly": true,
  "parentUuid": "boundary-uuid-...",
  "message": {
    "role": "user",
    "content": "This session is being continued from a previous conversation..."
  }
}
```

#### 4.2 压缩后重建流程

Resume（恢复）时的重建流程 [3]：

```
loadTranscriptFile(path)
    |
    v
readTranscriptForLoad(filePath, fileSize)
    |  <- 分块读取，去除属性快照
    v
parseJSONL -> Map<UUID, TranscriptMessage>
    |
    v
SegmentRelinks  <- 压缩后重新连接保留的消息段
    |
    v
Removals        <- 移除被压缩的消息，重新连接链表
    |
    v
Message(leafUuids)  <- 沿 leafUuid -> root 遍历，反转顺序
    |
    v
recoverOrphan   <- 重新拼接 tool_use 兄弟节点
    |
    +-- filterUnresolvedToolUses()
    +-- filterOrphanedThinkingOnlyMessages()
    +-- filterWhitespaceOnlyAssistantMessages()
    +-- detectTurnInterruption()
```

### 5. 跨文件续接（Continuation）

当 session 在上下文压缩后创建新文件时，出现跨文件续接 [5]：

**检测机制**（无显式 `parentSessionId` 字段）：
1. **Session ID 中途变更**：文件名是新的 UUID，但前几条记录的 `sessionId` 是父 session 的 ID
2. **共享 slug**：两个文件共享相同的人类可读名称（如 `zesty-singing-newell`）
3. **首条记录为 `compact_boundary`**：续接文件以压缩边界记录开始
4. **`parentUuid` 桥接**：新 session 的首条记录通过 `parentUuid` 指向旧 session 的末尾记录

**重建算法** [5]：
```
1. 解析项目目录下所有 JSONL 文件
2. 对每个文件：
   a. 从文件名提取 session ID
   b. 读取记录，追踪出现的所有唯一 sessionId
   c. 如果首个 sessionId 与文件名 ID 不同：
      - 第一个 ID 是父 session
      - 仅包含 sessionId 匹配文件名 ID 的消息
   d. 跳过 isCompactSummary=true 的记录
3. 构建父-子映射
4. 从根 session 开始，沿链追加每个子 session 的消息
```

### 6. 会话分支（Fork）与会话操作

#### 6.1 分支操作

| 命令 | 效果 |
|------|------|
| `/branch` | 在当前 session 内创建分支 |
| `claude --continue --fork-session` | 从最近 session 分支 |
| `claude --resume <id> --fork-session` | 从指定 session 分支 |

分支创建：
- 复制当前对话历史到新 session（新 UUID）
- 原始 session 保持不变
- 分支在 session picker 中分组显示在根 session 下 [1]
- "allow for this session" 的权限不会继承到新分支

#### 6.2 恢复操作

| 命令 | 行为 |
|------|------|
| `claude --continue` | 恢复当前目录最近的 session |
| `claude --resume` | 打开 session 选择器 |
| `claude --resume <name>` | 按名称恢复 |
| `claude --from-pr <url>` | 恢复与 PR 关联的 session |
| `/resume` | 在活跃 session 内切换 |

#### 6.3 Session ID 前缀编码

Session ID 遵循 `<8 alphanumeric characters>` 格式，前缀编码 session 类型 [6]：

| 前缀 | 类型 |
|------|------|
| `b` | Bash 任务 |
| `a` | Agent 任务 |
| `r` | 远程代理任务 |
| `t` | 进程内 teammate 任务 |
| （无） | 主交互式 session |

### 7. 子代理（Subagent）Transcript 架构

子代理拥有完全独立的上下文窗口和 transcript 文件 [2][3]：

```
subagents/
+-- agent-{agent-id}.jsonl           # 子代理完整对话
+-- agent-{agent-id}.meta.json       # 元数据：{agentType, description, toolUseId}
+-- workflows/{run-id}/
    +-- agent-{agent-id}.jsonl       # 工作流中的代理记录
```

**meta.json 示例**：
```json
{
  "agentType": "Explore",
  "description": "Search the current workspace...",
  "toolUseId": "toolu_xxx"
}
```

**路由规则**：
- 主线程消息 -> `{session-id}.jsonl`
- 带有 `agentId` 的侧链消息 -> `agent-{agentId}.jsonl`
- 内容替换条目遵循相同路由

### 8. 写入策略与崩溃安全

#### 8.1 Fire-and-Forget 写入模式

`sessionStorage.ts` 中的 `recordTranscript()` 使用后台队列保证写入顺序但不阻塞代理循环 [6]：

| 条目类型 | 写入方式 | 原因 |
|---------|---------|------|
| `user` | `await`（阻塞） | 崩溃恢复的关键数据 |
| `assistant` | Fire-and-forget | 保证顺序，不阻塞代理循环 |
| `progress` | 内联写入 | 下次查询时去重 |
| `system/compact_boundary` | 压缩后写入 | 标记压缩发生位置 |

#### 8.2 写入队列保证

- 保序性：后台队列按顺序排空写入
- 不阻塞：代理循环不等待非关键写入完成
- 崩溃安全：`user` 消息同步写入确保已接收的用户输入不丢失

### 9. 清理与限制策略

```
MAX_SESSIONS_PER_PROJECT = 100
MAX_SESSION_FILE_SIZE_BYTES = 50 * 1024 * 1024  // 50MB
```

- 超过 100 个 session 时删除最旧的文件
- 超过 50MB 时裁剪旧消息
- 默认 30 天后清理（可通过 `cleanupPeriodDays` 配置）[1]
- 清理时间戳记录在 `~/.claude/.last-cleanup`

### 10. 外部存储适配器（SessionStore）

SDK 提供 `SessionStore` 适配器接口，支持将会话镜像到外部存储 [2]：

| 适配器 | 后端 | 存储模型 |
|--------|------|---------|
| `S3SessionStore` | AWS S3 | 每个 `append()` 一个 JSONL 分片文件 |
| `RedisSessionStore` | Redis | `RPUSH`/`LRANGE` 列表 + 有序集合索引 |
| `PostgresSessionStore` | PostgreSQL | `jsonb` 表，`BIGSERIAL` 排序 |

**关键接口方法**：

| 方法 | 必需 | 触发时机 |
|------|:---:|---------|
| `append` | 是 | 每批 transcript 写入后 |
| `load` | 是 | `resume` 时读取 |
| `listSessions` | 否 | 列举和 `continue: true` |
| `delete` | 否 | 删除 session |
| `listSubkeys` | 否 | 发现子代理 transcript |

**注意**：存储是镜像，不是替代。Claude Code 子进程总是先写入本地磁盘 [2]。

### 11. 辅助目录与文件

| 路径 | 用途 |
|------|------|
| `~/.claude/file-history/<session-uuid>/` | 文件编辑版本历史，按 SHA-256 哈希命名，最多 188 版本/session |
| `~/.claude/tasks/<session-uuid>/` | 任务列表状态，每个任务一个 JSON 文件（`1.json`, `2.json` 等） |
| `~/.claude/session-env/<session-uuid>/` | 每个会话的环境变量快照 |
| `~/.claude/shell-snapshots/` | Shell 环境完整快照（函数、别名、环境变量、PATH） |
| `~/.claude/history.jsonl` | 全局命令历史索引（跨所有项目） |
| `~/.claude/metrics/costs.jsonl` | 每次请求的成本追踪 |
| `~/.claude/paste-cache/` | 粘贴内容缓存 |

---

## 共识领域

所有来源一致认同以下要点：

1. **JSONL 追加式写入**：所有来源确认 Claude Code 使用 JSONL 格式追加写入，不做文件重写
2. **项目路径隔离**：session 按工作目录路径编码隔离存储
3. **UUID 标识**：每个 session 由 UUID 唯一标识
4. **崩溃安全设计**：用户消息同步写入确保数据安全
5. **30 天默认清理**：本地 transcript 文件默认保留 30 天

## 争议/不确定领域

1. **路径编码细节**：部分来源称使用 `sessions/` 子目录 [6]，实际观察发现 session JSONL 直接存储在项目目录下（无 `sessions/` 中间目录）
2. **Session ID 格式**：部分来源描述为 8 字符 [6]，实际观察到完整的 UUID 格式（如 `ed073caf-b6f1-4f5b-b2fb-38c3a492f694`）
3. **压缩触发阈值**：来源报告约 167K token 触发压缩 [5]，但具体阈值可能因模型和版本不同而变化
4. **跨文件续接的检测**：没有显式的 `parentSessionId` 字段，依赖结构性推断，可能在边缘情况下不可靠

---

## 架构总结图

```
                    +------------------------------+
                    |         ~/.claude/           |
                    +--------------+---------------+
                                   |
              +--------------------+--------------------+
              |                    |                    |
    +---------v------+   +--------v--------+   +-------v---------+
    |   projects/    |   |   sessions/     |   | 其他辅助目录    |
    |  (transcripts) |   | (进程注册表)    |   | (file-history, |
    +---------+------+   +-----------------+   |  tasks, metrics)|
              |                                 +----------------+
    +---------v-----------------------------+
    |  <encoded-project-path>/              |
    |  +-- {uuid}.jsonl        <- 主会话    |
    |  +-- {uuid}.jsonl        <- 会话 2    |
    |  +-- {uuid}/                            |
    |  |   +-- subagents/                     |
    |  |   |   +-- agent-*.jsonl              |
    |  |   |   +-- agent-*.meta.json          |
    |  |   +-- tool-results/                  |
    |  |       +-- call_*.json                |
    |  +-- memory/  (可选)                    |
    +----------------------------------------+

    JSONL 内部结构 (链表):
    +---------+    +---------+    +---------+    +---------+
    | msg-A   |--->| msg-B   |--->| msg-C   |--->| msg-D   |
    |parent:null  |parent:A |    |parent:B |    |parent:C |
    +---------+    +---------+    +---------+    +---------+
                                                       ^
                                                   leafUuid
```

---

## 来源

[1] Claude Code 官方文档 - "Manage sessions"。URL: https://code.claude.com/docs/en/sessions（权威性：最高，官方文档）

[2] Claude Code 官方文档 - "Persist sessions to external storage"。URL: https://code.claude.com/docs/en/agent-sdk/session-storage（权威性：最高，官方文档）

[3] openedclaude/claude-reviews-claude - "architecture/09-session-persistence.md"。URL: https://github.com/openedclaude/claude-reviews-claude/blob/main/architecture/09-session-persistence.md（权威性：高，源码级分析，约 7,600 行代码覆盖）

[4] ppiankov/contextspectre - "docs/session-architecture.md"。URL: https://github.com/ppiankov/contextspectre/blob/main/docs/session-architecture.md（权威性：高，详细结构分析）

[5] Jesse Vincent (blog.fsck.com) - "How Claude Code Session Continuation Works"。发布日期：2026-02-22。URL: https://blog.fsck.com/agent-blog/2026/02/22/claude-code-session-continuation/（权威性：高，详细的 JSONL 格式和跨文件续接分析）

[6] cutool.online - "6.4 Session Persistence and History"。URL: https://cutool.online/docs/claude-tutorial/en/ch06-engineering/04-session-persistence.html（权威性：中，教程级别分析）

[7] Claude Code 官方文档 - "Work with sessions" (Agent SDK)。URL: https://code.claude.com/docs/en/agent-sdk/sessions（权威性：最高，官方 SDK 文档）

[8] 本地文件系统实际探索（`~/.claude/` 目录结构、JSONL 文件内容、session 元数据文件）（权威性：最高，一手观察数据）

[9] vibe-replay.com - "What Does Claude Code Store on Your Machine?"。发布日期：2026-03-24。URL: https://vibe-replay.com/blog/claude-code-local-storage/（权威性：中高，实际数据探索分析）

[10] anshul-garg27/claude-picker - 开源 session 管理工具。URL: https://github.com/anshul-garg27/claude-picker（权威性：中，社区工具的源码分析）

---

## 研究空白与未来方向

1. **压缩算法细节**：压缩时生成摘要的具体策略（保留哪些消息、摘要粒度）未在公开文档中详细说明
2. **并发写入冲突处理**：多个终端在同一目录启动 Claude Code 时的锁机制和冲突解决策略需进一步研究
3. **性能特征**：大型 session 文件（50MB+）的读取和解析性能尚未有公开基准测试
4. **加密与安全**：JSONL 文件以明文存储，包含完整的 thinking blocks 和工具输出，安全影响需评估
5. **Worktree 与 Fork 的精确交互**：两者在实际使用中的组合行为（文件系统隔离 vs 上下文隔离）需要更详细的文档
6. **Teleport 功能**：跨机器 session 传输的序列化格式和 Git bundle 机制的文档仍不完整
