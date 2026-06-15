---
name: openspec-check-integration
description: Scan OpenSpec change artifacts for cross-module boundary gaps before implementation. Detects missing task coverage at integration points (state sync, API contracts, event flow, data pipeline seams). Use after /opsx:review and before /opsx:apply, or standalone on any change.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  inspired-by: retro-2026-06-12-web-ui-redesign
---

Scan OpenSpec artifacts for **integration boundary gaps** — cross-module seams that have no task coverage.

Runs AFTER `/opsx:review` (artifacts approved) and BEFORE `/opsx:apply` (implementation starts). Can also run standalone at any point. The goal is to catch the class of bugs that live at module boundaries: state sync, data flow, event contracts, API handoffs.

**Why this exists**: Tasks decompose cleanly along module lines, but the seams *between* modules are where most integration bugs hide. Code review is static analysis and can't catch these. This scan is a structured checklist that forces the reviewer to think about boundaries before any code is written.

**Input**: Optionally specify a change name (e.g., `/opsx:check-integration add-auth`). If omitted, infer from context or prompt.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` and use **AskUserQuestion** to let the user select

2. **Load all artifacts**

   Run `openspec status --change "<name>" --json` to get artifact paths.

   Read ALL artifacts:
   - `proposal.md` — for scope and capabilities
   - `design.md` — for architectural decisions and module boundaries
   - All files under `specs/` — for requirements and scenarios
   - `tasks.md` — for task decomposition and file/module assignments

3. **Identify module boundaries**

   From design.md and tasks.md, extract the **module map**: every file, module, or subsystem that tasks touch.

   Then from specs and design, infer the **data flow edges** between modules. Look for these generic boundary types:

   | Boundary Type | What to Look For |
   |---------------|-----------------|
   | **State sync** | Two modules sharing state (URL hash ↔ JS state ↔ DOM, shared store ↔ consumers) |
   | **Data pipeline** | Module A produces data that Module B consumes (parser → transformer → renderer, API → service → repository) |
   | **Event contract** | Module A emits events/callbacks that Module B handles (click → handler, webhook → processor) |
   | **API handoff** | Module A calls Module B's interface (controller → service, CLI arg parser → command handler) |
   | **I/O boundary** | Module crosses an I/O seam (in-memory → filesystem, in-process → network, app → database) |
   | **Format conversion** | Data changes representation between modules (JSON → HTML, internal type → API response, raw → validated) |

   For each edge, note: **source module → boundary type → consumer module**.

4. **Check task coverage for each boundary**

   For every identified edge, scan tasks.md: is there a task that explicitly covers this integration point?

   **Coverage criteria** (a task covers a boundary if it):
   - Mentions both the source and consumer module
   - Describes the data/state flowing between them
   - Includes error handling at the boundary (what happens when the seam fails)
   - OR is explicitly labeled as an "integration" or "wiring" task

   **Classify each boundary**:

   | Status | Meaning |
   |--------|---------|
   | **COVERED** | At least one task explicitly addresses this boundary |
   | **IMPLICIT** | No dedicated task, but a task description implies the integration (may be sufficient) |
   | **GAP** | No task covers this boundary — integration logic will be ad-hoc during implementation |

5. **Generate boundary report**

   Present results in this format:

   ```
   ## Integration Coverage: <change-name>

   ### Module Map
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │ Module A │────────▶│ Module B │────────▶│ Module C │
   │ (source) │  edge-1 │ (middle) │  edge-2 │ (sink)   │
   └──────────┘         └──────────┘         └──────────┘

   ### Boundary Scan
   | Edge | Type | Status | Evidence |
   |------|------|--------|----------|
   | A → B | state sync | ⚠️ GAP | No task covers hash→state wiring |
   | B → C | data pipeline | ✅ COVERED | T14: "Wire render to API response" |
   | A → C | event contract | 🟡 IMPLICIT | T8 mentions "on route change" but not A→C directly |

   ### Summary
   - Total boundaries: X
   - ✅ COVERED: Y
   - 🟡 IMPLICIT: Z
   - ⚠️ GAP: W

   Coverage: Y/X (P%)
   ```

6. **Handle gaps**

   **If all boundaries are COVERED or IMPLICIT with low risk:**
   > "Integration coverage looks solid. Ready for `/opsx:apply`."

   **If any boundary is GAP:**
   - List each gap with its boundary type and risk assessment
   - Ask user:

   > "Some module boundaries have no task coverage. Options:"

   - **Add integration tasks** — Generate task stubs for each GAP boundary and append to tasks.md
   - **Accept risk** — Proceed knowing these boundaries are uncovered
   - **Update design** — Go back to design.md to make boundaries explicit, then re-check

   **If user selects "Add integration tasks":**
   For each GAP boundary, propose a task:

   ```markdown
   - [ ] T{N}: Wire {source} → {consumer} ({boundary_type})
     Verify: {specific verifiable outcome for this boundary}
   ```

   The task MUST include a `Verify:` line describing a concrete observable outcome — not just "it works" but a specific state or behavior that proves the integration is correct.

   **`Verify:` line spec** (authoritative format — applies to hand-written tasks too, not only generated ones):
   - **Position**: the line immediately below the task `- [ ]` line, indented 2 spaces
   - **Content**: a concrete, observable state or behavior (e.g., "切换项目后 session 列表刷新；点击行 drawer 打开"). Banned: "it works" / "测试通过" / vague restatements of the task title
   - **Scope**: only cross-module or manually-verifiable tasks need one — routine unit-tested tasks don't
   - **Consumer**: `/opsx:verify` reads these as the manual checklist for CODE_ONLY scenarios, so a missing `Verify:` line there means the scenario has no human-verifiable path either

7. **Write marker and proceed**

   If no gaps remain (or user accepted risk), create an integration check marker:

   Write a file at `<changeRoot>/.integration-checked` containing:
   ```
   checkedAt: <ISO timestamp>
   totalBoundaries: <number>
   covered: <number>
   implicit: <number>
   gaps: <number>
   coverage: "<percentage>%"
   gapsAccepted: <boolean>
   ```

   Remind the user:
   > "Integration check complete. Run `/opsx:apply` to start implementation."

**Detecting Boundaries — Heuristics**

When reading artifacts, use these signals to detect boundaries:

**From tasks.md:**
- Different files/modules mentioned across tasks = potential boundary
- Tasks that say "Depends on: T{n}" where T{n} is in a different module = confirmed boundary
- Tasks grouped by phase where Phase 1 output feeds Phase 2 input = pipeline boundary

**From design.md:**
- Architecture diagrams or module lists with arrows
- "Component A sends X to Component B" language
- Any mention of "interface", "contract", "protocol", "event", "callback", "handler"
- Data flow descriptions (input → transform → output)

**From specs:**
- Requirements that span two capabilities = cross-module boundary
- Scenarios with "when X then Y" where X and Y live in different modules
- Error handling requirements ("if API fails, show error state") = I/O boundary

**From proposal.md:**
- Capability list where capabilities logically depend on each other
- "Integration" or "wiring" mentioned in scope

**Common Boundary Patterns by Project Type**

These are reference patterns — the scan should detect these structures regardless of project type:

| Project Type | Typical Boundaries |
|--------------|-------------------|
| **Web SPA** | Route ↔ State ↔ DOM; API call ↔ Render; User event ↔ Handler ↔ State update |
| **Web SSR** | Server data ↔ Client hydration; Route ↔ Data loader ↔ Template |
| **REST API** | Controller ↔ Service ↔ Repository; Request validation ↔ Business logic; Service ↔ External API |
| **CLI** | Arg parser ↔ Command handler; Command ↔ Output formatter; Command ↔ Filesystem |
| **Library** | Public API ↔ Internal logic; Internal ↔ I/O adapter; Config ↔ Runtime |
| **Data pipeline** | Reader ↔ Transformer ↔ Writer; Schema validation ↔ Processing; Batch ↔ Error handling |
| **Plugin system** | Host ↔ Plugin interface; Plugin ↔ Shared state; Event bus ↔ Plugin handlers |

**Guardrails**
- Do NOT modify existing artifacts unless user explicitly chooses "Add integration tasks"
- Do NOT proceed to implementation — this is a read-only analysis step
- The `.integration-checked` marker and optional task additions are the only writes
- IMPLICIT is not necessarily bad — many trivial boundaries don't need dedicated tasks. Use judgment.
- Focus on boundaries where data format changes, error modes differ, or async timing matters — these are where bugs hide
- When in doubt, FLAG rather than silently mark COVERED
