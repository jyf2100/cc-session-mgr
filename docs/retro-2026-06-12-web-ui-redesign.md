# 回顾：web-ui-redesign 实施复盘

**日期**: 2026-06-12
**变更**: web-ui-redesign (31 tasks, spec-driven schema)
**状态**: 已归档至 `openspec/changes/archive/2026-06-12-web-ui-redesign/`

---

## 时间线

1. `/opsx:apply web-ui-redesign` — 实现 31 个 task
2. 专家团队 code review (3 agents: TypeScript / Security / Architecture)
3. 专家团队修复 review findings (C1, H1-H4, 安全头)
4. 用户浏览器验证 → 发现 SyntaxError → 修复 `\\'` 转义
5. 用户验证 → 发现选择联动不工作 → 修复 hash routing race condition
6. 用户反馈 → 加查询按钮、drawer 改 overlay、消息倒序、sticky header
7. `/opsx:archive` — 归档

---

## 痛点分析

### 1. 任务完成 ≠ 功能可用

31 个 task 全部打勾，但核心交互（选择联动）根本不工作。

任务粒度聚焦在视觉元素（CSS 变量、颜色、布局），但**路由状态管理**这种关键逻辑没有对应 task。

**根因**: tasks 从 design/specs 自上而下分解，交互 bug 出现在跨模块衔接处，而这些衔接处没有显式的 task 覆盖。

### 2. Code Review 找不到功能性 bug

3 个专家 review 抓到 C1/H1-H4 共 6 个问题（类型不匹配、XSS、安全头等），但选择联动的 race condition 没发现 — code review 是静态分析，不运行代码。

### 3. 单文件 SPA 无法自动化测试

`ui.ts` 766 行 HTML+CSS+JS 混在一个模板字符串里。零测试覆盖率，无法用常规单元测试覆盖交互逻辑。

### 4. 用户才是最好的 QA

每次都是用户在浏览器里发现问题 → 修复 → 再验证。至少 3 轮往返（SyntaxError → 选择联动 → drawer 布局）。Agent 无法自主启动浏览器验证。

### 5. 小改动触发大量来回

- "加个查询按钮" → 重构整个路由逻辑
- "drawer 75%" → 挤压列表 → 改 overlay → 改 display 控制
- 每个小调整都是 Edit → Build → 用户验证 循环

---

## 优化方案

### ✅ P0: `/opsx:check-integration` — 独立环节，已实施

**Skill 文件**: `.claude/skills/openspec-check-integration/SKILL.md`

新增独立环节，插在 `/opsx:review` 和 `/opsx:apply` 之间：

```
propose → review → ✨ check-integration ✨ → apply → verify → archive
```

**核心逻辑**：

1. 读取 proposal/design/specs/tasks，提取模块地图
2. 识别跨模块边界（6 种通用类型：state sync / data pipeline / event contract / API handoff / I/O boundary / format conversion）
3. 检查每个边界是否有 task 覆盖
4. 分类为 COVERED / IMPLICIT / GAP
5. 对 GAP 边界建议补 task（含 `Verify:` 行）

**通用性**：适用于 Web SPA / SSR / REST API / CLI / Library / Data pipeline / Plugin system 等所有项目类型。

| 维度 | 评估 |
|------|------|
| 投入 | 低 — 独立 skill，不改现有流程 |
| 收益 | 高 — 零成本发现跨模块遗漏 |
| 状态 | ✅ 已实施 |

### ✅ P1: design 完备性检查（review 第 g 项 design-to-spec completeness），已实施

在 `/opsx:review` 的扫描项中新增第 g 项 **design-to-spec completeness**：

> 遍历 design.md 的每个 D 编号 decision，确认它在 specs 里对应到一条 requirement。
> 任何 decision 找不到 spec requirement 即 FLAG（orphan decision）。

**实施说明**: 原始设想是"涉及 ≥2 模块交互时强制 State Flow Diagram"。落地时选了更通用的 design-to-spec completeness——State Flow 只是其中一个具体维度，完备性检查覆盖面更广（堵住所有 orphan decision，而不只是缺数据流图的）。这是变体实现，意图一致（源头堵漏）。

| 维度 | 评估 |
|------|------|
| 投入 | 低 — review 多一个检查项 |
| 收益 | 高 — 从源头堵住 design 与 spec 脱节 |
| 状态 | ✅ 已实施（review 第 g 项，2026-06-15） |

### ✅ P2: Task 加 Verify 行 + verify 消费闭环，已实施

在 task 文件里加可选的 `Verify:` 行，并让 `/opsx:verify` 真正读它：

```markdown
- [x] T12: Hash routing with onRoute()
  Verify: 页面加载后切换项目，session 列表刷新；点击行 drawer 打开
```

**`Verify:` 行格式规范**（已固化在 check-integration skill，手写 task 同样适用）:
- **位置**：task `- [x]` 行下一行，缩进 2 空格
- **内容**：具体可观察的状态/行为（"切换项目后列表刷新"），禁 "它能工作" / "测试通过"
- **范围**：仅跨模块或需手动验证的 task 加，常规单测覆盖的 task 不需要

**两段闭环**（P2 的真正价值，原设想只有前半段）:
1. **生成侧** ✅：`/opsx:check-integration` 补 GAP task 时自动带 `Verify:` 行（随 P0 完成）
2. **消费侧** ✅：`/opsx:verify` 反向扫描时读 tasks.md 的 `Verify:` 行，列为 Manual Verification Checklist；CODE_ONLY（有实现无自动测试）scenario 若有对应 Verify 行 → 降级为"可人工验证"，无 Verify 行 → 仍是缺口。`.verified` marker 记录 `manualVerifyChecks` 计数。

**注意**: Agent 无法执行手动验证——Verify 行始终是给人看的 checklist，不是防线。它的作用是把"无法自动验证的场景"显式化，让人工有据可依。

**审查收尾**（2026-06-15 专家 4 视角审查后修 2 缺陷）：① `manualVerifyChecks` 原是孤儿字段（verify 写、archive/status 不读）→ archive 步骤 4/7 与 status 步骤 3 现均读取并暴露；② verify 步骤 6 缺放行出口（CODE_ONLY+Verify 落中间态）→ 现补放行分支「All scenarios verified, or covered by manual checks. Ready for /opsx:archive.」（不阻塞），M 计数落在步骤 5 summary 与步骤 7 `.verified.manualVerifyChecks`。两段闭环至此两端真正接通。

| 维度 | 评估 |
|------|------|
| 投入 | 低 — verify skill 加一段读 tasks.md + 一个报告小节 |
| 收益 | 中 — 接通 Verify 行的"生成→消费"闭环，CODE_ONLY 不再是黑盒 |
| 状态 | ✅ 已实施（2026-06-15） |

### ✅ P3: 流程衔接加固（archive 端 + 状态可见），已实施

**起因**: check-integration 落地后复盘剩余缺失——三个 marker 之间无互锁、状态不可见、经验沉淀断裂。归档可默默放过从未 verify 的 change。

**三连改动**（同一批 skill/command 双层）：

| 项 | 改动 | 文件 |
|----|------|------|
| **A. archive marker 盘点** | `/opsx:archive` 新增步骤 4：归档前读 `.reviewed`/`.integration-checked`/`.verified`，缺失（尤其 `.verified`）则确认。**不阻塞，只强制知情** | `openspec-archive-change` skill + `opsx/archive` command |
| **C. retro 钩子** | `/opsx:archive` 步骤 7：若 ≥2 轮验证 / 跨模块 bug / 跳过 verify，提示写 `docs/retro-*.md`（非阻塞） | 同上 |
| **D. `/opsx:status`** | 新环节：读 artifact + 三 marker + tasks 计数 → 推断工作流位置 + 异常检测（如"verify 了但没 review"）+ 下一步建议 | 新建 `openspec-status` skill + `opsx/status` command |

**新流程形态**:

```
propose → review → check-integration → apply → verify → archive
                                                         ├─ 步骤4: 盘点 marker
                                                         └─ 步骤7: retro 钩子
          ↑ /opsx:status 任意时刻可查"走到哪步、跳了哪步、下一步跑什么"
```

**接通的断裂链**: marker 互锁（archive 不再放过未验证 change）→ 状态可见（三 gate 暴露 + 异常跳跃检测）→ 经验沉淀（archive 触发 retro 回写）。

| 维度 | 评估 |
|------|------|
| 投入 | 低 — archive 加两步、status 新建只读 skill |
| 收益 | 中~高 — 接通"互锁 → 可见 → 沉淀"断裂链 |
| 状态 | ✅ 已实施（2026-06-15） |

### ✅ 审后打磨（双层一致性 + 字段闭环补全），已实施

P0–P3 落地后，对 opsx skill/command 双层镜像做了一次一致性体检，清掉 4 项预先存在的 MEDIUM（双层数据流 / anomaly 检测 / 报告结构 / 措辞对齐）：

| # | 缺陷 | 修复 | 涉及文件 |
|---|------|------|----------|
| **M1** | verify SKILL 步骤 4/5 与 command 的完整性扫描报告结构分歧（SKILL 是简洁合并单表，command 是分类表 + 三子表 + 按需求分组场景） | SKILL 步骤 4 替换为 command 详细版（分类表 SPECIFIED/UNSPECIFIED · COVERED/ORPHAN + 三子表：设计决策覆盖率 / 代码到规格覆盖率 / 横切关注）；步骤 5 报告补 `#### Requirement:` 场景分组 + `### Completeness Scan` 引用 | `openspec-verify-change` SKILL（步骤 4/5） |
| **M2** | `.verified` marker 缺 `gapsAccepted` 字段——步骤 6 有「继续存档·接受差距」选项但步骤 7 标记不持久化该决策；archive 消费侧也不读 | verify 步骤 6 选项注记（`sets gapsAccepted: true`）+ 步骤 7 marker 加 `gapsAccepted: <boolean>`；archive 步骤 4 读取 + 步骤 7 披露「Gaps accepted by user」 | verify skill+command 步骤 6/7；archive skill+command 步骤 4/7 |
| **M3** | `/opsx:status` 步骤 5 异常检测缺「`.verified` 存在但 `.integration-checked` 缺失」的情况（漏了 verify 跳过 integration 的乱序态） | 在两个 `.verified` 异常之间补第 4 条 anomaly（逻辑分组） | `openspec-status` skill + `opsx/status` command |
| **M4** | check-integration SKILL 第 126 行 `Verify:` 行措辞比 command 第 124 行详细（command 缺「not just it works」的强调，教育价值打折） | command 统一为 SKILL 详细版本 | `opsx/check-integration` command（步骤 3） |

**验收 grep 矩阵**（skill 与 command 双层计数一致）：`gapsAccepted` 在 verify 双层各 2、archive 双层各 3（含 integration-checked 原有 1）；status anomaly 5 条 ×2（含对抗确认后补的第 5 条）；check-integration `not just "it works"` ×2；verify 三子表 `Design Decisions Coverage` ×2；`#### Requirement:` 分组 ×2；`gapsAccepted` 注释已补 `false` 语义 ×2；旧合并单表标志残留 0。

| 维度 | 评估 |
|------|------|
| 投入 | 低 — 纯文字对齐 + 字段补全，无逻辑改动 |
| 收益 | 中 — 双层镜像不再有语义分歧；用户「接受差距」决策全链路可追溯（写入 → 读取 → 披露） |
| 状态 | ✅ 已实施（2026-06-15） |

**对抗确认与后续债**（2 位专家独立对抗审查后）：

- **修复正确性**：4 项 MEDIUM 全部 PASS。专家用全 body `diff` 验证 verify SKILL/command 步骤 4+5 逐字一致（退出码 0）；M2 写入→读取→披露链路字段名逐字相同无断点、步骤 7 条件覆盖「接受差距」路径无死分支；retro 验收矩阵数字经得起复核。
- **关联补全**（对抗审查暴露的 2 项同类小洞，已顺势修）：① `gapsAccepted` 注释只声明 `true` 语义 → 补 `false = no gaps existed or all resolved`；② status anomaly 状态机漏「`.integration-checked` present ∧ tasks incomplete」→ 补第 5 条，5 条 anomaly 现覆盖所有「gate present 但前置未满足」的乱序组合。
- **已知技术债**（超本轮范围，留后续对齐 pass）：archive / status / check-integration 的 SKILL 与 command 在**修复点之外**存在系统性预存双层正文分歧——archive command 比 SKILL 多 4 个 Output 模板（On Success / No Delta / With Warnings / On Error，约 46 行）；status 的 intro/Input 段措辞不同；check-integration 整套 markdown 标题层级风格分裂（SKILL 粗体段标 vs command `##` 标题）。属历史遗留，非本次引入。**[2026-06-15 已偿还]** —— 不是"再做一次对齐 pass 让两份逐字一致"，而是彻底消除其中一份（单一事实来源 = skill，command 降级为转发 `$ARGUMENTS` 的薄壳）。见下节 B+ 收敛。

### ✅ B+ 收敛：opsx command 层降级为 ecc 式 legacy shim（偿还上述双层镜像技术债），已实施

**时间**：2026-06-15　**状态**：✅ 已实施并独立验证

承接上面那条"已知技术债"。在调研了用户自己的 ecc 插件如何处理 command/skill 关系后，结论比当时记的更彻底：**当前版本的 command 和 skill 是同一个系统，根本不该有两份正文**。正确修复不是"对齐两份副本"，而是消除其中一份——skill 成为唯一事实来源，command 降级为只转发 `$ARGUMENTS` 的 26 行薄壳。

**ecc 先例**：ecc 把命令分成三类——(a) `commands/` 里 80+ 个有独立逻辑、不镜像 skill 的维护中命令；(b) 250+ 个 skill 作为规范来源；(c) `legacy-command-shims/` 里 12 个默认不加载、只给肌肉记忆迁移用的薄壳委托。**ecc 里不存在逐字镜像**。本次照搬第 (c) 类形态。

**做了什么**（9 对，1:1 映射：apply / archive / check-integration / explore / propose / review / status / sync-specs / verify）：

1. 9 个 `commands/opsx/*.md` 全部重写为 26 行 ecc 式 legacy shim：frontmatter `description: Legacy slash-entry shim for the X skill. Prefer the skill directly.` + 正文三段 `Canonical Surface` / `Arguments ($ARGUMENTS)` / `Delegation (Apply the X skill)`。
2. **回溯保护**：先搬 command 独有的设计意图进 skill，再删 command 正文。审计判定只有 archive、explore 有独有内容：
   - **archive skill +75 行**：step 4「Check process markers」（读 `.reviewed`/`.integration-checked`/`.verified`，带 `gapsAccepted`/`manualVerifyChecks` 语义注释）+ step 7 summary 扩展（通过/跳过门、gapsAccepted、manualVerifyChecks）+ retro hook（非阻塞）+ 3 个输出模板（On Success / On Success With Warnings / On Error Archive Exists）+ guardrail「Process markers inform but never block」。
   - **explore skill +12 行**：少量独有内容回灌。
   - 其余 7 对 command 为纯镜像，无独有内容，直接降级。
3. **执行方式**：多智能体 workflow（3 阶段 pipeline 无屏障：审计 → 回溯+Shim → 对抗验证），9 对并行独立流动，共 27 agent（9 审计 / 9 回溯 / 9 验证），约 4.6 分钟。

**独立验证**（未采信工作流自报的 9/9，逐项核磁盘）：
- ✅ 委托目标：9/9 个 command 的 `Apply the openspec-X skill` 与对应 skill frontmatter `name` 完全匹配。
- ✅ 薄壳形态：9/9 个 command 均 26 行（`wc -l` 全部为 26）。
- ✅ 零意图丢失：`git diff` 核对 archive command 删除的内容（marker 检查 / retro hook / 输出模板）与 archive skill 新增内容一一对应。
- ✅ skill 完整性：7 个纯镜像 skill 未改动（无需回灌）。

**变更量**（`git diff`，已跟踪的 5 command + 2 回灌 skill）：`149 insertions(+), 675 deletions(-)`，**净 −526 行**。skill 层 +87 行（archive +75 / explore +12）。

**遗留说明**：原 command 记的"4 个 Output 模板（含 No Delta）"，审计判定"No Delta"实为 On Success 模板里 `Specs` 字段的一个分支值（`No delta specs`），非独立模板，已被 On Success 模板覆盖；故回灌 3 个独立模板即完整覆盖设计意图。

---

## 工程改进（非 opsx 层面）

以下两项解决的是**代码架构**问题，不属于 OpenSpec 工作流优化：

### 工程 1: 拆分 ui.ts 为可测试模块

```
当前：  src/web/ui.ts (766 行，HTML+CSS+JS 混合)

目标：
  src/web/
    ui.ts          → 只导出 getHtml()，引用下面的模块
    ui-state.ts    → 纯 JS：onRoute(), onQuery(), readHash(), setHash()
    ui-render.ts   → 纯函数：renderSessionRow(), renderMessage()
    ui-api.ts      → fetch 封装
    ui.css.ts      → CSS 字符串
```

`ui-state.ts` 是纯 JS，可以用 vitest + jsdom 测试路由逻辑。

### 工程 2: Playwright smoke test（未来 milestone）

apply 完成后自动跑关键路径。但前提是工程 1 先完成（拆分出可测试模块）。
当前阶段用户手动验证 3 轮的成本可接受，暂不投入。

---

## 推荐实施顺序

| 优先级 | 方案 | 投入 | 收益 | 状态 |
|--------|------|------|------|------|
| **P0** | `/opsx:check-integration` | 低 | 高 | ✅ 已实施 |
| **P1** | review 加 design 完备性检查 | 低 | 高 | ✅ 已实施（第 g 项） |
| **P2** | task 加 Verify 行 + verify 消费闭环 | 低 | 中 | ✅ 已实施 |
| **P3** | archive marker 盘点 + retro 钩子 + `/opsx:status` | 低 | 中~高 | ✅ 已实施 |
| 工程 | 拆分 ui.ts | 中 | 高 | 独立 task |
| 未来 | Playwright smoke | 高 | 高 | 工程 1 之后 |

---

## 今日实际修复清单

| # | 问题 | 类型 | 发现方式 |
|---|------|------|----------|
| 1 | SyntaxError: `\\'` 转义 | 编译/运行时 | 用户浏览器 |
| 2 | Analysis 字段名不匹配 (C1) | 序列化 | Code review |
| 3 | Timezone injection (H1) | 安全 | Code review |
| 4 | esc() 缺单引号 (H3) | 安全 | Code review |
| 5 | infoField() 未转义 (H2) | 安全 | Code review |
| 6 | Phase payload 冗余 (H4) | 性能 | Code review |
| 7 | 缺安全响应头 | 安全 | Code review |
| 8 | 选择联动 race condition | 功能 | 用户浏览器 |
| 9 | Drawer 挤压列表 | 布局 | 用户反馈 |
| 10 | 消息排序 | UX | 用户请求 |
| 11 | Drawer 关闭按钮不可见 | UX | 用户反馈 |
| 12 | Favicon 404 | 噪音 | 控制台 |

---

## Gate 审计（归档后回溯，2026-06-15）：当初归档时质量 gate 实际走成什么样

事后回溯查 `archive/2026-06-12-web-ui-redesign/` 下的过程标记，还原这个 change 归档时的真实质量 gate 状态——它恰好是后来补 `check-integration` / `verify` / `status` 三件套要防的那种案例。

**一句话结论**：三道 gate **只过了 1 道**（review，且带 `testCoverage: FLAG`）；`.integration-checked` 和 `.verified` **都缺失**；tasks 30/31。是个"浅 review → 跳两道质量 gate → 直接归档"的路径。

### Gate 明细

| Gate | Marker | 状态 | 关键信号 |
|------|--------|------|----------|
| Review | `.reviewed` | ✅ 留有记录（14:15） | `testCoverage: **FLAG**`；其余 5 项（specClarity / openQuestions / dependencies / scopeAlignment / nonGoals）PASS |
| Integration | `.integration-checked` | ❌ **缺失** | 跨模块边界缺口未查 |
| Verify | `.verified` | ❌ **缺失** | 3 个 spec（layout/style/drawer）的 scenario 从没拿实现核过 |
| Apply | （无 marker，task 完成度代理） | ⚠️ 30/31 | 唯一未勾：`7.5 手动启动 node dist/cli/index.js web 验证浏览器中的布局效果` |

### Anomaly（套用 status skill 乱序检测逻辑）

- ⚠️ `.verified` 缺失 + tasks 未全完成 → 未完成就归档
- ⚠️ `.integration-checked` 缺失 → review 后直接 apply，跳过集成边界扫描
- ⚠️ `testCoverage: FLAG` 被无视 → review 已预警测试覆盖不足，仍一路放行到 archive

### 时间线（文件 mtime，全程约 2 小时）

```
14:03  propose 开始（.openspec.yaml）
14:05  proposal.md
14:06  design.md + specs/（3 个 spec）
14:15  .reviewed（propose 后仅 9 分钟，带 FLAG）
14:30  tasks.md（apply 阶段，最后修改）
       ── .integration-checked ❌ 跳过 ──
       ── .verified ❌ 跳过 ──
15:59  archive
```

### 因果链：gate 缺失 → 上面那 12 条修复

把"跳 gate"和上面"今日实际修复清单"的 12 条 bug 直接连起来：

1. review 时 `testCoverage: FLAG` —— 系统已预警测试覆盖不足。
2. task 7.5「手动浏览器验证布局」未勾 —— 唯一的手动验证步骤被跳过/未记录。
3. `.verified` gate 跳过 —— 3 个 spec 的 scenario 从没系统核过实现证据。

三者叠加 → bug 直接漏到用户浏览器：上面 12 条里 #1（SyntaxError `\'` 转义，用户浏览器）、#3–5（`esc()`/`infoField()`/timezone 安全漏洞，Code review）、#8（选择联动 race condition，用户浏览器）、#9/#11（drawer 布局/关闭按钮，用户反馈）**全是 review/verify 该抓但没抓到的问题**，靠用户手动验证 3 轮 + 事后 code review 才修完。

**这正是 status skill "Why this exists" 说的盲区实例**——"a 'done' change was never verified, the exact blindness that let incomplete changes reach archive"。web-ui-redesign 就是这套 gate 体系设计出来要防止的案例，而它自己恰恰发生在 gate 体系建成之前。

### 已沉淀进当前 opsx 工作流

后来补的 `check-integration` / `verify` / `status` 三件套，动机就是这个案例：`testCoverage: FLAG` 不该被无视、`.verified` 不该跳、gate 状态不该不可见。当前 archive skill 第 4 步会盘点这三道 marker——缺了只警告不阻断，但逼你当面确认跳过。本 change 当时连这个"当面确认"都没有（机制是事后才建的）。
