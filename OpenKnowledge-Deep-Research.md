# OpenKnowledge 深度研究：把项目记忆变成知识库的一部分

> 研究来源：工具猎人终端《OpenKnowledge 爆火 HN：别再让 Agent 翻旧笔记，知识库该变成可回滚的工作区》[1]
> 研究日期：2026-06-29
> 置信度：原文基于 OpenKnowledge README/官方文档的解读；具体实现细节（MCP 17 工具/Agent Activity/回滚）需结合官方 repo 交叉验证。

---

## Executive Summary

OpenKnowledge 是开源 AI-first 知识库（HN 爆火），核心不是"又一个 Notion 替代品"，而是把**项目知识库变成 Agent 可读、可写、可追踪、可回滚的工作区**。三层架构（Editor / Knowledge Engine / Content=纯 Markdown+Git）边界清晰：人用富文本编辑器写，Agent 经 MCP 工具读写，所有变化留在 Git 版本历史里。

对你（vnosis vault 应用）的直接启示：**项目记忆（memory / CLAUDE.md / docs / lessons）可以整合进 vault，成为 Agent 经统一工具层操作、且有版本回滚保障的知识库**——而不是散落在 grep / README / 复制粘贴里。

---

## Key Findings

- **三层架构**：Editor（人类入口）/ Knowledge Engine（MCP 工具层，Agent 操作）/ Content（纯 Markdown + Git，源数据）。边界清楚，人不盯 Agent 写语法，Agent 不猜结构 [1]
- **源数据不锁数据库**：底层纯 Markdown + Git，迁移成本低、Code Review 自然。知识库不是黑箱，是仓库的一部分 [1]
- **Agent Activity（最大亮点）**：展示 Agent 会话改了哪些文件、每个文件增删多少、diff，可撤销 Agent 最新编辑或对某文件的全部编辑，timeline 回滚历史版本。AI 写完能审、能撤销——团队敢用的前提 [1]
- **MCP 17 工具，读写分级**：exec/search/links/history（只读，低风险）+ write/edit/delete/move（写，高/中高风险）。落地建议先只读 → 验证 → 创建新文档 → 最后开放 edit + diff 检查 [1]
- **入口是 MCP，不是新 AI**：你继续用 Claude/Codex/Cursor，OpenKnowledge 给 Agent 一个靠谱的知识库工具层。Agent 最怕的不是没资料，而是入口太松散（一会儿 grep、一会儿读 README、一会儿复制粘贴）[1]

---

## Detailed Analysis

### 1. OpenKnowledge 解决的真问题

当 Claude、Codex、Cursor 这些 Agent 开始长期参与项目，知识库不能再只是人看的笔记。常见做法的问题：

| 老办法 | 短期能用 | 长期会炸在哪 |
|--------|----------|-------------|
| 普通 Markdown 文件 | 简单、可 Git | 链接/frontmatter/版本历史靠人维护 |
| Obsidian 知识库 | 双链和检索舒服 | Agent 写入不一定保持结构一致 |
| Notion 页面 | 协作好 | 本地项目/Git/Agent 工具链连接不顺 |
| 单纯 RAG | 能检索 | 改写/回滚/审计不自然 |

OpenKnowledge 的切入点：**底层仍是纯 Markdown + Git，上面加一个 AI 友好的知识引擎**。不把笔记藏进数据库，而是把项目知识库变成 Agent 能稳定操作的文件系统 [1]。

### 2. 三层架构（最关键的设计）

| 层级 | 作用 | 理解 |
|------|------|------|
| **Editor** | WYSIWYG / 源码模式、双链、frontmatter、资产嵌入、版本历史 | 人类入口 |
| **Knowledge Engine** | MCP 工具封装搜索、链接、历史、读写等能力 | Agent 操作层 |
| **Content** | 项目里的纯 Markdown 文件，Git 版本控制 | 真正的源数据 |

边界清楚：人不需要盯 Agent 写 Markdown 语法；Agent 不需要瞎猜知识库结构。系统顺手维护 frontmatter、backlinks、编辑历史和资产关系。**最看重的是没有把知识锁进新数据库**——项目知识继续以 Markdown 待在仓库里 [1]。

### 3. Agent Activity：AI 改了什么，不能只靠感觉

| 常见问题 | Agent Activity 的价值 |
|----------|----------------------|
| AI 改了很多文件，人工没法快速扫完 | 按文件聚合编辑记录 |
| 不知道某次编辑是谁改的 | 区分人类和 Agent 编辑 |
| 发现一个文件被改坏了 | 可撤销该文件内 Agent 编辑 |
| 会话结束后还要追溯 | 通过 timeline 回滚历史版本 |

Agent 工程的核心不是让模型更自由，而是让它自由得有边界。能看见 diff、能撤销、能回滚，才是团队敢用的前提 [1]。

### 4. MCP 工具层（17 个工具，读写分级）

| 工具 | 用途 | 风险等级 |
|------|------|---------|
| `exec` | 只读 shell 风格（cat/ls/grep/find） | 低 |
| `search` | 工作区搜索（标题/正文/recency 排序） | 低 |
| `links` | backlinks/forward links/dead links/orphans | 低 |
| `history` | 文档版本时间线 | 低 |
| `write`/`edit`/`delete` | 写入/编辑/删除文档、文件夹、模板、资产 | 高 |
| `move` | 移动文档/文件夹/资产 | 中高 |

落地顺序：先建小项目知识库（只规范+架构）→ Agent 只读验证检索 → Agent 创建新文档（不改旧）→ 最后开放 edit + 关键修改走 diff [1]。

### 5. 对 vnosis 的启示：把项目记忆变成知识库的一部分

vnosis 是 vault 应用（Obsidian-like），已有文件树/编辑器/索引/搜索/双链。用户的"项目记忆"当前散落在：
- `~/.claude/projects/.../memory/`（Claude Code memory，lessons/feedback/project）
- `CLAUDE.md`（项目指令）
- `docs/`（文档，symlink 到外部 Obsidian）
- `openspec/`（spec-driven change artifacts）

**整合方案（借鉴 OpenKnowledge 理念 + vnosis 现有能力）**：

```
┌─────────────────────────────────────────────────────┐
│  vnosis vault（知识库 = 仓库的一部分）              │
├─────────────────────────────────────────────────────┤
│  Project Overview    ← 项目目标/技术栈/目录/命令    │
│  Architecture Decisions ← 关键决策 + 不能改的原因   │
│  Coding Rules        ← 风格/测试/禁用写法           │
│  Known Pitfalls      ← 历史踩坑/异常/排查入口       │
│  Release Checklist   ← 发版必检                     │
│  Lessons Log         ← 从 memory 同步的经验沉淀     │
├─────────────────────────────────────────────────────┤
│  Agent 操作层（Pi agent 工具 / 未来 MCP）           │
│  read/write/edit/bash/grep + search_vault           │
├─────────────────────────────────────────────────────┤
│  版本/回滚（vault + Git / .back 备份）              │
└─────────────────────────────────────────────────────┘
```

vnosis 已有大部分基础设施（vault 文件系统 + 索引 + 搜索 + Pi agent 工具层 + .back 备份）。缺的是：
1. **项目记忆的结构化整合**：把 memory/CLAUDE.md 的内容沉淀进 vault（而非散落）
2. **Agent 编辑审计/回滚**：OpenKnowledge 的 Agent Activity（diff/撤销/timeline）——vnosis 的 .back 是文件级备份，缺会话级 Agent 编辑追踪
3. **知识库作为 Agent 固定前置**：任务提示改成"改代码前先检索 Project Overview/Coding Rules/Known Pitfalls"

### 6. 最适合的场景（不是个人日记，是 Agent 项目记忆）

| 场景 | 为什么适合 | 写进知识库的内容 |
|------|-----------|-----------------|
| Coding Agent 长期项目 | Agent 反复读规范和决策 | 架构约束、目录说明、提交规范 |
| Spec-driven development | 需求/设计/验收可追踪 | spec、ADR、测试清单 |
| AI 代码审查 | 审查规则稳定沉淀 | 常见缺陷、禁用模式、修复模板 |
| 团队知识库 | 多人+多 Agent 同步 | 领域词表、接口约定、变更记录 |
| 一人公司/独立开发 | 项目多，脑子不够用 | 产品路线、营销素材、上线记录 |

---

## Areas of Consensus

- 知识库不能只是人看的笔记，必须是 Agent 可操作的工作区
- 纯 Markdown + Git 是源数据（不锁数据库），迁移低、Review 自然
- Agent 写完必须能审/撤销/回滚——否则团队不敢用
- 入口统一（MCP/工具层），不散乱（grep/README/复制粘贴）
- 落地要先只读后写，逐步开放权限

## Areas of Debate

- **知识库结构维护**：没人维护会乱，Agent 只会把混乱放大。工具不能替你决定什么该沉淀/删除/进规范
- **写权限边界**：先读后写，但何时开放 write/edit 各团队不同
- **与 Obsidian/Notion 定位**：不是替代（编辑器），是 Agent 工作区（知识引擎）
- **不是万能大脑**：知识库如果一开始就乱，Agent 放大混乱

---

## Sources

[1] 工具猎人终端.《OpenKnowledge 爆火 HN：别再让 Agent 翻旧笔记，知识库该变成可回滚的工作区》. 微信公众号.
https://mp.weixin.qq.com/s/LSL36NDq4Nmekb3nau1psQ
*(一手来源，作者基于 OpenKnowledge README + 官方文档的解读。可信度：技术解读文章，论点需结合 OpenKnowledge 官方 GitHub repo 交叉验证具体实现。)*

---

## Gaps and Further Research

1. **OpenKnowledge 官方 repo 验证**：文章基于 README/文档，具体实现（MCP 17 工具的精确签名、Agent Activity 回滚机制、Editor 渲染）需看官方 repo（疑为 `inkeep/open-knowledge`，待确认）
2. **vnosis 集成方案细化**：项目记忆 vault 化的具体目录结构 + Pi agent 工具层如何对齐 MCP 模式
3. **Agent 编辑审计**：vnosis 当前 .back 是文件级备份，OpenKnowledge 的会话级 Agent Activity（diff/撤销/timeline）是缺口，值得评估是否做
4. **与 skills-management 协同**：vnosis 已有 `~/.vnosis/skills/`（Skills→openVault），项目记忆知识库与 skills 库的关系（同 vault 不同子树？）
5. **跨工具同步**：OpenKnowledge 强调多 Agent（Claude/Codex/Cursor）统一入口，vnosis 的 Pi agent + 未来多 Agent 接入的知识库统一
