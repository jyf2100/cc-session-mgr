---
name: openspec-review-change
description: Review all artifacts of an OpenSpec change before implementation. Use after /opsx:propose completes all artifacts and before /opsx:apply. Presents a structured audit summary, auto-scans for risks and gaps, and requires explicit human approval to proceed.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
---

Review all artifacts of an OpenSpec change before implementation.

Runs AFTER all artifacts are created (proposal, design, specs, tasks) and BEFORE `/opsx:apply`. The goal is to catch issues early — missing test tasks, vague specs, unresolved design questions, and dependency gaps — before any code is written.

**Input**: Optionally specify a change name after `/opsx:review` (e.g., `/opsx:review add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and use the **AskUserQuestion tool** to let the user select

   Only show changes where all artifacts are done (or nearly done). If artifacts are incomplete, warn and offer to continue with what exists.

2. **Load all artifacts**

   Run `openspec status --change "<name>" --json` to get artifact paths.

   Read ALL artifacts:
   - `proposal.md`
   - `design.md`
   - All files under `specs/`
   - `tasks.md`

3. **Generate structured review summary**

   Present a concise summary of each artifact:

   **Proposal Summary:**
   - One-line "Why" and "What Changes"
   - Count of capabilities listed

   **Design Decisions:**
   - List each D-numbered decision as a one-liner with its choice
   - Highlight any open questions that remain

   **Specs Overview:**
   - Per-capability: requirement count, scenario count
   - Total requirements and scenarios across all specs

   **Tasks Overview:**
   - Phase breakdown with task count per phase
   - Total tasks
   - Dependencies between phases

4. **Run automated risk scans**

   Check for the following issues and report each as PASS or FLAG:

   a. **Test coverage gap**:
      - Do all implementation tasks (Phase 2+) mention tests?
      - If any task lacks a "Tests:" line, FLAG it.

   b. **Spec clarity**:
      - Does every Requirement have at least one Scenario?
      - Does every Scenario have both WHEN and THEN?
      - FLAG any Requirement with 0 scenarios or missing THEN.

   c. **Open questions resolved**:
      - Does design.md have an "Open Questions" section with items?
      - FLAG any open questions that remain (user may have resolved them verbally).

   d. **Cross-module dependency**:
      - Do tasks reference files/modules that don't exist in the tasks as dependencies?
      - If a task says "Depends on: T5" but T5 doesn't exist, FLAG it.

   e. **Scope alignment**:
      - Do all capabilities in the proposal have corresponding specs?
      - Do all specs have corresponding tasks?
      - FLAG any orphan (capability with no spec, or spec with no task).

   f. **Non-goals check**:
      - Are there tasks that implement things listed in "Non-Goals"?
      - FLAG any such tasks as scope creep.

   g. **Design-to-spec completeness**:
      - Extract every D-numbered decision from design.md
      - For each decision, check if there is at least one spec requirement that formalizes it
      - Extract every capability from proposal.md
      - For each capability, check that its spec covers: happy path, error/empty states, and edge cases
      - FLAG any design decision with no spec requirement (orphan decision)
      - FLAG any capability where specs only cover happy paths (incomplete coverage)
      - This catches the "design said X but nobody wrote it into specs" gap before code is written

5. **Present review results**

   Show the review in this format:

   ```
   ## Review: <change-name>

   ### Summary
   - X capabilities, Y requirements, Z scenarios
   - N tasks across M phases
   - Design: K decisions, L open questions

   ### Risk Scan
   ✅ Test coverage: All tasks have test plans
   ✅ Spec clarity: All scenarios have WHEN/THEN
   ⚠️ Open questions: 2 unresolved (see D7, D8)
   ✅ Dependencies: All task refs valid
   ⚠️ Scope alignment: capability "X" has no spec
   ✅ Non-goals: No scope creep detected

   ### Action Items (if any)
   1. [Specific issue to address]
   2. [Another issue]
   ```

6. **Ask for approval**

   Use the **AskUserQuestion tool** to ask:

   > "Review complete. Approve this change for implementation?"

   Options:
   - **Approved** — Ready for `/opsx:apply`
   - **Needs changes** — Describe what to fix (user provides free-text)
   - **Defer** — Not ready to implement, leave for later

   If the user selects "Needs changes", ask what needs to change and offer to update the relevant artifact. Do NOT proceed to apply.

   If the user selects "Approved", create a `.reviewed` marker file in the change directory:

   Write a file at `<changeRoot>/.reviewed` containing:
   ```
   reviewedAt: <ISO timestamp>
   reviewedBy: human
   scanResults:
     testCoverage: PASS|FLAG
     specClarity: PASS|FLAG
     openQuestions: PASS|FLAG
     dependencies: PASS|FLAG
     scopeAlignment: PASS|FLAG
     nonGoals: PASS|FLAG
     designCompleteness: PASS|FLAG
   ```

7. **Post-review**

   After approval, remind the user of the next step:

   > "Change approved. Run `/opsx:apply` to start implementation."

**Guardrails**
- Do NOT modify any artifacts during review — only read and report
- Do NOT proceed to implementation — this is a read-only review step
- If artifacts are incomplete, present what's available and warn about gaps
- The `.reviewed` file is the only write operation (and only on approval)
- Always run all 7 risk scans — don't skip any
