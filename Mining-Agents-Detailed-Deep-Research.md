# 会话挖掘 Agent 逐个详细研究:7 个开源实现深析

> 研究日期:2026-06-30
> 研究问题:逐个详细研究 Claude Code 会话挖掘 agent 工具的实现
> 目的:为 `session-mining-agent`(openspec change)的 `/opsx:apply` 提供实现参考
> 互补关系:与 `Claude-Code-Session-Mining-Deep-Research.md` 互补——那份是方法论概述,本份是逐个工具的实现深析

---

## Executive Summary

对 7 个开源会话挖掘工具的逐个深析显示:它们在**"两阶段(确定性 digest + LLM 提取/综合)"**骨架上高度一致,但在**提取目标、聚合重量、产物形态、人审程度**上分化明显。

- **obra 系**(`claude-memory-extractor` + `engineering-notebook`)证明 lesson 提取可验证(85% ground truth),且作者同一人,覆盖"提取"与"摘要"两端
- **`crune`** 提供最完整的端到端语义图谱管线(TF-IDF→SVD→聚类→社区→skill 合成)
- **`skill-workshop`** 给出最清晰的三类信号打分(`frequency × type_weight`)
- **`sessions-insights`** 给出最可操作的 triage 阈值规则
- **`cl-pprint`** 是两阶段架构(并行提取 + 单点综合)的教科书实现

**对 `session-mining-agent` 的结论**:P0 应吸收 `claude-memory-extractor` 的多维提取 + 认知谦逊、`sessions-insights` 的 triage 阈值、`skill-workshop` 的三类信号打分、`cl-pprint` 的并行提取+综合分层;P1 再考虑 `crune` 的语义图谱与 `log-analyzer` 的 arc/分类体系。

---

## Key Findings

- **`claude-memory-extractor`(obra,115★)**:多维 lesson 提取(Five Whys + 认知谦逊),16 条 ground truth **85% 匹配**;方法论 lesson > 技术 fix;依赖 **Claude CLI**(非 SDK)[1]
- **`engineering-notebook`(obra,194★,最高)**:Bun CLI,ingest→SQLite→**Haiku** 日摘要→web UI;**止步于摘要,不到经验沉淀** [2]
- **`crune`(22★)**:最完整端到端管线(TF-IDF+Tool-IDF+SVD+聚类+Louvain 社区+Brandes 中心性 → skill 合成);session 摘要**无 LLM**(centrality-based)[3]
- **`skill-workshop`(68★)**:三类信号(重复解释 / 工具链 / 错误-纠正)+ `frequency × type_weight` 打分;**Haiku 提取 + 人审**,产物分类 knowledge/workflow/gotcha [4]
- **`sessions-insights`(2026-06 新,0★)**:精确 triage 规则(≥3 人类轮次 / ≥50 自主 / ≥3 子agent);**纯 Python 标准库零依赖** [5]
- **`cl-pprint`(1★)**:两阶段教科书——**并行 Sonnet 提取 → 单 Opus 综合**;可写回 CLAUDE.md [6]
- **`claude-code-log-analyzer`(21★)**:arc 语义边界检测(Gemini Flash Lite)+ autonomy/intent 分类体系 + gate 有效性分析;源自 543 小时/165 releases 真实研究 [7]

---

## Detailed Analysis

> 统一结构:定位 → 架构/管线 → 关键实现 → LLM 用法 → 产物 → **对 session-mining-agent 的可借鉴点**

### 1. `claude-memory-extractor`(obra)— lesson 提取的标杆

**定位**:从会话历史提取"可迁移 lesson"的多维系统。115★,MIT,JS/TS。

**架构**:
```
~/.claude/projects/*.jsonl
   → SessionParser(读 JSONL)
   → SessionChunker(长会话切块)
   → message filtering(只留人类-assistant 有意义交换)
   → Agent-based 提取(调 Claude CLI + 专门 prompt)
   → ~/.claude/memories/extracted/*.md
```

**关键实现 — 多维提取框架**:
- **Five Whys**(5 层根因追溯)
- **Hidden Motivation**(心理驱动 / 隐含动机)
- **Systems Thinking**(具体预防策略)
- **Epistemic Humility**(认知谦逊:评估置信度,承认不确定)

**关键研究发现(最有价值)**:
- 测了 **15 种 prompt 技术**(Five Whys、Self-Criticism 等)
- 发现 agent 在模糊案例上**危险地过度自信** → 引入 Epistemic Humility 护栏
- 16 条人工 ground truth 验证 → **85% 匹配**
- **方法论 lesson 比技术 fix 更有价值**

**LLM 用法**:**Claude CLI**(subprocess,非 API SDK)。这是它的依赖瓶颈(README 明列为已知限制)。

**产物**:Markdown + YAML frontmatter:
```yaml
id, created, confidence(1-5), certainty_reasoning, trigger, tags, source.session
```
正文含多维分析(根因 / 心理驱动 / 预防 / 认知谦逊各节)。

**▶ 可借鉴**:
- **多维提取 prompt + 认知谦逊护栏** → 我们 design 决策 4 已采纳,可直接移植 prompt 骨架
- **`confidence`(1-5)+ `certainty_reasoning` + `trigger`** frontmatter → 我们 lesson 结构的现成字段集
- **SessionChunker**(长会话分块)→ 我们 digest 阶段② 的输入预处理
- **方法论 vs 技术 类型分类** → 我们的 `LessonType`
- **85% ground truth 方法论** → 我们验收测试可效仿(小样本人工校准)

### 2. `engineering-notebook`(obra)— 日摘要 + web UI(摘要层,非挖掘)

**定位**:ingest Claude Code + Codex 会话 → LLM 日摘要 → 可浏览工程日志。194★(最高),Apache-2.0,Bun/TS。**与 #1 同作者(obra)**。

**架构**:
```
JSONL → Ingest(parse 人类可读对话,strip tool calls/thinking,存 SQLite)
      → Summarize(按日期/项目分组,Claude Haiku 写日志)
      → Serve(web UI:journal/projects/calendar/search + iCal)
```

**关键细节**:
- SQLite 存储(`~/.config/engineering-notebook/notebook.db`)
- `day_start_hour`(凌晨会话归前一天,默认 5 点)
- `remote_sources`(SSH 同步远端机器)
- 每会话附 `claude --resume <id>` 链接
- 摘要含 headlines / summaries / topic tags / **open questions**
- 技术栈:Bun + Hono + Anthropic SDK + HTMX

**▶ 可借鉴**:
- **SQLite ingest + 缓存** → 我们 digest 缓存层(决策 5)的存储选型
- **按日期/项目分组摘要** → 我们 `mine --from/--to/--project` 的分组逻辑
- **`day_start_hour`** → 凌晨会话归组的细节(我们的 by-date 已有,可借鉴此参数化)
- **open questions 字段** → 产物可带"未解决问题",供后续会话接力
- ⚠️ **定位警示**:它是"摘要器",不是"挖掘器"——产出是给人读的日志,不沉淀为可复用知识。**这正是我们 `session-mining-agent` 要超越的层级**(我们 design 已区分"摘要 ≠ 挖掘")。obra 同时维护这两个工具,说明他也没把"摘要→挖掘"接起来——这是空白,也是我们的机会。

### 3. `crune` — 最完整的端到端图谱管线

**定位**:静态 web dashboard + CLI,语义知识图谱 + skill 合成。22★,Apache-2.0,TS。

**架构(最完整的端到端管线)**:
```
~/.claude/projects/**/*.jsonl
  → parse & build turns
  → extract metadata, subagents, linked plans
  → session summarization(centrality-based representative prompt, workType 分类)  ← 无 LLM
  → TF-IDF + Tool-IDF + 结构特征 → Truncated SVD → agglomerative 聚类
  → /insights facets integration(narrow cluster merging, goal-based labeling)
  → Louvain community detection
  → skill synthesis(reusability score top-N → claude -p)
  → output JSON(index/overview/detail)
```

**关键实现**:
- **session summarization 无 LLM**:representative prompt 用 **Jaccard centrality + position weighting** 选;`workType` 分类为 investigation / implementation / debugging / planning
- **知识图谱**:TF-IDF + **Tool-IDF**(工具的逆文档频率)+ 结构特征 → SVD 降维 → agglomerative 聚类 → Louvain 社区 → Brandes 中心性(识别 bridge topics)
- **reusability score 分解**:每个 signal 的 `value × weight → contribution`(如 frequency × 0.35),总分 = Σ contribution——比 skill-workshop 的单一公式更透明
- **/insights 集成**:用 LLM 的 `underlying_goal` 做 cluster label,quality-aware scoring
- **skill synthesis**:top-N → `claude -p`,enriched with graph context

**LLM 用法**:可选(`--skip-synthesis` 纯启发式;`--model haiku/sonnet` 合成)。**管线前半段无 LLM**。

**产物**:JSON(index/overview/detail)+ SKILL.md(skill 格式)。

**▶ 可借鉴**:
- **reusability score 的 contribution 分解**(value × weight)→ 我们聚合打分的精细化(P1)
- **session summarization 无 LLM**(centrality-based)→ 省 LLM,我们 digest 阶段可效仿
- **`workType` 分类**(investigation/implementation/debugging/planning)→ 我们 triage/digest 的会话分类维度
- **Tool-IDF**(工具作为特征)→ P1 聚类特征工程参考
- ⚠️ **重量警示**:全套图谱(SVD+社区+中心性)对 P0 太重。我们 design 决策 6 已明智地把语义聚类推迟到 P1,用规则键聚类起步。crune 是 P1 的目标形态。

### 4. `skill-workshop` — 三类信号 + 人审(最贴近我们 P0)

**定位**:从会话发现可复用 skill 模式。68★,MIT。**以 Claude Code skill/agent 形态交付**。

**三类信号(定义最清晰)**:
| 信号 | 捕捉 | 例子 |
|------|------|------|
| repeated explanation | 跨 3+ 会话重复解释同一概念 | "pip 要用 `--break-system-packages`" |
| tool chain | 跨会话重复工具序列 | `Grep → Read → Edit → Bash` |
| workaround | 错误→人类纠正 | Claude 用错 flag,人类一直改 |

**架构(两阶段,Claude skill 形态)**:
```
Phase 1 — session-analyzer agent(Haiku):
   bash + jq/python3 解析 JSONL
   → 提取 user messages / tool sequences / error→correction pairs
   → 语义相似度分组,打分 frequency × type_weight
   → /tmp/skill-workshop-results.json(≤15 候选,0.0-1.0,evidence quotes)
Phase 2 — skill-workshop orchestrator:
   读结果 → 表格呈现候选 → 人选 winners
   → 生成 SKILL.md(分类:knowledge / workflow / gotcha)
```

**LLM 用法**:Phase 1 用 **Haiku**(速度/成本),Phase 2 由 orchestrator(主 Claude)生成。**人 in the loop**——人审批候选再生成。

**产物**:`/tmp/skill-workshop-results.json`(结构化候选 + evidence quotes)+ 用户选择的 SKILL.md。

**▶ 可借鉴**:
- **三类信号定义** → 我们 design 决策 3 已采纳,**可直接作为 P0 提取目标**
- **打分公式 `frequency × type_weight`** → 简单、可解释的信号排序,比 crune 的轻
- **Haiku 提取 + 人审** → 我们的成本分层(决策 5)+ 人审接口(决策 6 风险缓解)的现成范式
- **skill 分类 knowledge/workflow/gotcha** → 我们产物的类型维度
- **evidence quotes** → 强制可追溯(我们 spec 已要求 `source-sessions`,可再加 evidence quote)
- ⚠️ 它把结果写 `/tmp/`(临时),不沉淀——产物持久化是我们 `insight-aggregation` 要补的

### 5. `sessions-insights` — triage 规则教科书(最贴我们阶段①)

**定位**:按 session ID 分析,聚焦使用报告。2026-06 新,0★,MIT,纯 Python。

**架构(两阶段,确定性)**:
```
extract.py: transcript → compact digest(turn counts / tools / timing / topics)
            【模型不必读原始 diff / tool output】
triage.py:  分类 deep-dive vs aggregate-only + portfolio stats
模型读小 JSON → 写报告(100+ 会话塌缩到 handful)
```

**triage 规则(最可操作)**:
```
deep-dive:  ≥3 人类轮次  OR  ≥50 自主轮次  OR  ≥3 子agent
aggregate-only: one-shot StructuredOutput 永远是;其余不满足上述的
```
实测:42 会话 → 4 deep-dive + 38 aggregate(31 自动审查 + 7 短人类)。

**报告格式(极实用)**:At a Glance / Portfolio(表) / **What was filtered out**(透明展示被滤 + 原因) / Deep dives / Patterns / Suggestions。

**LLM 用法**:digest + triage **全确定性(Python)**;LLM 只读小 JSON 写报告。

**依赖**:**Python 3 标准库,零 pip install**。

**▶ 可借鉴**:
- **triage 阈值规则** → 我们 design 决策 2 已采纳,**直接照用**(≥3 人类 / ≥50 自主 / ≥3 子agent)
- **compact digest 让 LLM 不读原始数据** → 我们阶段① 的核心理念,这里有现成实现
- **"What was filtered out" 透明展示** → 我们 `--dry-run` 的输出格式(triage 可解释性)
- **纯标准库零依赖** → 我们 P0 可考虑(降低依赖负担,符合 KISS)
- **portfolio + deep-dive 分层** → 我们报告结构(聚合概览 + 深挖)

### 6. `cl-pprint` — 两阶段架构教科书(最贴我们阶段②)

**定位**:transcript 浏览 + lesson 提取 + 导出。1★,MIT,Python。**核心工具 `cl_dream.py`**。

**架构(`cl_dream.py` 两阶段,最清晰)**:
```
阶段 1: 并行 Sonnet 调用 → 从每个会话提取 lessons(每会话独立)
阶段 2: 单个 Opus 会话 → 综合成文档更新(CLAUDE.md)
```
- 用 **Claude CLI subprocess**(spawn 多个)
- `--retry`:跳过提取只综合(复用已存 lesson 文件)
- `--related`:包含移动/重命名项目的旧路径

**其他工具(生态)**:`browse_web.py`(web)/ `browse_transcripts.py`(TUI)/ `format_jsonl.py`(JSONL→md,`--show-tools/--show-thinking`)/ `summarize_transcripts_claude.py`(**Haiku** 摘要)/ `summarize_transcripts.py`(**Ollama** 本地)。

**LLM 用法**:**Sonnet 并行提取 + Opus 单点综合**;Ollama 本地备选。要求 Claude Max(Opus 贵 + 限速)。

**产物**:**写回 CLAUDE.md**(项目文档),不是独立 lessons 文件。

**▶ 可借鉴**:
- **并行便宜模型提取 + 单个强模型综合** → 我们 design 决策 5(成本分层)的**教科书实现**;`--retry` 复用缓存的设计可照搬
- **写回 CLAUDE.md vs 独立 lessons 文件** → 产物策略选择。我们 design 选了"vault 友好独立文件",但"写回 CLAUDE.md 让 Agent 下次直接读到"是更有闭环感的替代——**值得在 apply 时权衡**
- **Ollama 本地备选** → 隐私/成本(我们 `summarize/providers` 已有多 provider 基础,可扩展)
- **format_jsonl 的 `--show-tools/--show-thinking`** → 我们 digest 的内容控制(决定喂给 LLM 哪些内容块)

### 7. `claude-code-log-analyzer` — arc + autonomy/intent + gate(独特角度)

**定位**:分析会话历史的工作模式。21★,MIT,Python。**源自 97 天 / 543 小时 / 165 releases 的真实研究项目**。

**三大分析**:
- **Arc Analysis**:语义边界检测(**Gemini Flash Lite**)——对每条 user message 问"这是新 quest 还是延续当前?",识别连贯工作单元(arc)
- **Agent Analysis**:数自主 agent 会话 + 时长(读 `agent-*.jsonl` 子agent 日志)
- **Gate Analysis**:发现审查门工具 + 有效性(决策分类、错误类型、overlap ratio ω)
- **chat_analyzer**:**Gemini embeddings + HDBSCAN 聚类 + UMAP 可视化**

**分类体系(独特)**:
- **autonomy levels**:interactive / quick(<15min)/ build(15-60min)/ feature(1-4h)/ release(4h+)
- **intent categories**:implement / fix / refactor / test / review / deploy / docs / explore / config / other

**数据源**:`~/.claude/history.jsonl`(全局 prompt 索引,**我们没用过的源**)+ `projects/*/*.jsonl` + `agent-*.jsonl`。

**LLM 用法**:**Gemini Flash Lite**(便宜)做语义边界 + 分类 + embeddings。

**▶ 可借鉴**:
- **arc 语义边界检测**(每条 message 问"新 quest 还是延续")→ 工作单元切分,我们的 phase/digest 可借鉴(已有 `analysis/phase.ts`)
- **autonomy levels + intent categories** → 会话分类维度(比 crune 的 workType 更细)
- **Gate Analysis**(审查门有效性)→ **独特角度,我们 spec 未覆盖**;若挖"质量门教训"是差异化
- **HDBSCAN + UMAP** → P1 聚类可视化
- **`history.jsonl` 全局 prompt 索引** → 我们可用的额外数据源(当前只读 projects/*.jsonl)
- **真实研究背书(543h/165 releases)** → 方法论经实战验证,可信度高

---

## 横向对比:对 session-mining-agent 的借鉴矩阵

| 工具 | 管线位置 | LLM | 聚合 | 产物 | 人审 | 我们借鉴 |
|------|---------|-----|------|------|------|---------|
| claude-memory-extractor | 阶段② 提取 | Claude CLI | 单会话 | md+frontmatter | 无 | **多维提取 + 认知谦逊 + confidence 字段** |
| engineering-notebook | 阶段①+摘要 | Haiku | 按日/项目 | web UI 日志 | 无 | SQLite 缓存 + day_start_hour(摘要层,非挖掘) |
| crune | 全管线 | 可选 | 图谱(P1) | JSON+SKILL | 无 | **reusability 分解 + workType + 无LLM摘要**(P1) |
| skill-workshop | 阶段② 提取 | Haiku | 语义分组 | SKILL 候选 | **有** | **三类信号 + frequency×weight + 人审** |
| sessions-insights | 阶段① triage | 纯确定性 | portfolio | 报告 | 无 | **triage 阈值 + digest + 透明过滤展示** |
| cl-pprint | 阶段② 两阶段 | Sonnet+Opus | 单点综合 | CLAUDE.md | 无 | **并行提取+综合 + 写回CLAUDE.md + --retry** |
| log-analyzer | 模式分析 | Gemini Flash | HDBSCAN | 报告 | 无 | arc 边界 + autonomy/intent + gate(P1) |

---

## Areas of Consensus

- **两阶段骨架**(确定性 digest/triage + LLM 提取/综合)是事实标准 [1][3][4][5][6]
- **digest 必须压到让 LLM 不读原始数据**(sessions-insights、cl-pprint、crune 都强调)[3][5][6]
- **便宜模型提取、强模型综合**(Haiku/Flash/Sonnet 提取,Opus/主模型综合)[2][4][6][7]
- **三类信号 + confidence + 可追溯 source**(skill-workshop、claude-memory-extractor)[1][4]
- **产物是 Markdown + frontmatter / SKILL**,而非一次性报告 [1][3][4]
- **认知谦逊 / 人审护栏**防 agent 过度自信 [1][4]

## Areas of Debate

- **产物去向**:独立 lessons 文件(claude-memory-extractor)/ 写回 CLAUDE.md(cl-pprint)/ SKILL(crune、skill-workshop)/ web 日志(engineering-notebook)——**无共识**,这是产品定位选择。
- **聚合重量**:无聚合(cl-pprint)/ 语义分组(skill-workshop)/ 全图谱(crune)——发现力 vs 复杂度的权衡。
- **LLM 通道**:Claude CLI subprocess(claude-memory-extractor、cl-pprint)/ Anthropic SDK(engineering-notebook)/ Gemini(log-analyzer)/ 可选(clune)——成本、依赖、限速各异。
- **人审程度**:全自动(claude-memory-extractor)/ 人选 winners(skill-workshop)——"信任 agent" vs "人 in the loop"。
- **依赖**:纯标准库(sessions-insights)/ 重依赖(Bun+Hono+SDK 的 engineering-notebook)——部署简易性 vs 功能丰富度。

---

## Sources

[1] obra/claude-memory-extractor. GitHub(115★, MIT, JS/TS). https://github.com/obra/claude-memory-extractor *(多维 lesson 提取 + 85% ground truth 验证 + 研究文档,高可信;作者 Jesse Vincent)*

[2] prime-radiant-inc/engineering-notebook. GitHub(194★, Apache-2.0, Bun/TS). https://github.com/prime-radiant-inc/engineering-notebook *(ingest+SQLite+Haiku 摘要+web UI,高可信;同 obra)*

[3] chigichan24/crune. GitHub(22★, Apache-2.0, TS)+ DEV 算法详解. https://github.com/chigichan24/crune ; https://dev.to/chigichan24/mining-hidden-skills-from-claude-code-session-logs-with-semantic-knowledge-graphs-2em8 *(最完整端到端图谱管线 + 算法文档,高可信)*

[4] grayodesa/skill-workshop. GitHub(68★, MIT). https://github.com/grayodesa/skill-workshop *(三类信号 + frequency×type_weight 打分 + 人审,高可信)*

[5] cryptolisboa-claw/claude-code-sessions-insights. GitHub(2026-06 新, 0★, MIT, Python). https://github.com/cryptolisboa-claw/claude-code-sessions-insights *(精确 triage 规则 + 纯标准库,高可信;虽新但实现清晰)*

[6] iwalton3/cl-pprint. GitHub(1★, MIT, Python). https://github.com/iwalton3/cl-pprint *(两阶段架构教科书:并行 Sonnet 提取 + 单 Opus 综合,中高可信)*

[7] mrothroc/claude-code-log-analyzer. GitHub(21★, MIT, Python)+ 543 Hours 研究. https://github.com/mrothroc/claude-code-log-analyzer ; https://michael.roth.rocks/research/543-hours/ *(arc 语义检测 + autonomy/intent 分类 + gate 分析,经 543h/165 releases 实战验证,高可信)*

---

## Gaps and Further Research(对 `/opsx:apply` 的落地建议)

1. **P0 直接落地清单**(基于本研究的明确借鉴):
   - 阶段① triage → 照用 sessions-insights 阈值(≥3 人类 / ≥50 自主 / ≥3 子agent),`--dry-run` 仿"What was filtered out" [5]
   - 阶段② 信号 → 照用 skill-workshop 三类信号 + `frequency × type_weight` [4]
   - 阶段② lesson → 移植 claude-memory-extractor 的多维 prompt + 认知谦逊 + `confidence`(1-5)/`certainty_reasoning`/`trigger` 字段 [1]
   - 成本分层 → 仿 cl-pprint 的并行提取+综合 + `--retry` 缓存复用 [6]
   - digest 缓存 → 仿 engineering-notebook 的 SQLite 存储 [2]

2. **关键产品决策(apply 前最好定)**:
   - **产物去向**:独立 lessons 文件 vs 写回 CLAUDE.md(cl-pprint 模式)?后者闭环更紧(下个会话直接读到),但侵入用户文件。建议 P0 先独立文件,`--update-claude-md` 作可选。
   - **人审程度**:全自动产 lesson vs 人审候选(skill-workshop 模式)?建议 P0 走"产出 + confidence 标记",不强制人审,但 `--interactive` 可选审批。

3. **数据源扩展(当前未用)**:
   - `~/.claude/history.jsonl`(全局 prompt 索引)——log-analyzer 在用,我们可加 [7]
   - `agent-*.jsonl`(子agent 日志)——triage 的 "≥3 子agent" 规则需要它 [5][7]

4. **P1 演进路径**:
   - 语义聚类 → crune 的 TF-IDF+Tool-IDF+SVD+社区 [3]
   - 会话分类 → crune workType / log-analyzer autonomy+intent [3][7]
   - arc 边界 → log-analyzer 的语义检测 [7]
   - gate 教训 → log-analyzer 的 Gate Analysis(差异化能力)[7]

5. **仍缺的研究**:
   - 这些工具的**实际产出质量**(非 README 自述)缺乏第三方对比评测;claude-memory-extractor 的 85% 是唯一见到的量化验证 [1]
   - **增量挖掘**(只挖新会话)所有工具都未做,是工程化关键缺口
   - **经验时效性**(lesson 过时)无工具处理(主报告已列为 gap)
