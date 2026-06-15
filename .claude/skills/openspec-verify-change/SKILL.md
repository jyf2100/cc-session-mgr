---
name: openspec-verify-change
description: Verify that implementation matches specs after /opsx:apply. Reads every spec scenario, searches the codebase for implementation evidence, and outputs VERIFIED/PARTIAL/MISSING/STUB per scenario. Auto-generates test stubs for uncovered scenarios.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
---

Verify that implementation matches specs after `/opsx:apply` completes.

Runs AFTER implementation (all tasks checked off) and BEFORE `/opsx:archive`. The goal is to confirm every spec scenario has real implementation — not just that tasks were marked complete, but that the actual code does what the spec says.

**Input**: Optionally specify a change name after `/opsx:verify` (e.g., `/opsx:verify add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and use the **AskUserQuestion tool** to let the user select

   Only show changes where tasks are complete (or nearly complete). If tasks are incomplete, warn and suggest running `/opsx:apply` first.

2. **Load specs and implementation**

   Run `openspec status --change "<name>" --json` to get artifact paths.

   Read ALL spec files from `specs/` directory. For each spec, extract:
   - Every `### Requirement:` block
   - Every `#### Scenario:` under each requirement
   - Each scenario's WHEN/THEN conditions

   Then search the implementation code (typically `src/`) for evidence matching each scenario.

   **Also read `tasks.md`** and extract every `Verify:` line (the manual-verification checkpoints written by `/opsx:check-integration` when it generates boundary-gap tasks, or hand-added by the author). Record each as `task-id → verify text`, and note which scenario/boundary it targets. These become the human-verification fallback for CODE_ONLY scenarios that have no automated test — consumed in steps 3 and 5.

3. **Verify each scenario**

   For each scenario, classify it as one of:

   | Status | Meaning |
   |--------|---------|
   | **VERIFIED** | Found implementation code that clearly handles this scenario, AND a test that exercises it |
   | **CODE_ONLY** | Implementation exists but no test found. If a matching `Verify:` line exists in tasks.md, mark it human-verifiable and route it to the manual checklist (step 5) rather than treating as a pure gap |
   | **PARTIAL** | Implementation partially covers the scenario (e.g., handles the happy path but not edge cases) |
   | **MISSING** | No implementation found for this scenario |
   | **STUB** | Code exists but is a placeholder (empty function body, TODO comment, throw "not implemented") |

   **Verification method:**
   - Search for function names mentioned in specs (e.g., `renderHtml`, `detectCostAnomalies`)
   - Read the implementation function body
   - Check for condition handling matching WHEN clauses
   - Search test files for scenario descriptions or related test names
   - For edge cases (empty input, null fields, zero division), check explicit guard code

4. **Reverse completeness scan**

   This step catches what step 3 misses: features that exist in design or code but have NO spec coverage.

   **a. Design-to-spec gap check:**
   - Extract every D-numbered decision from design.md
   - For each decision, search specs for a requirement that formalizes it
   - Classify each decision:

   | Status | Meaning |
   |--------|---------|
   | **SPECIFIED** | At least one spec requirement covers this decision |
   | **UNSPECIFIED** | Decision exists in design but no spec requirement formalizes it |

   **b. Code-to-spec gap check:**
   - From the implementation, identify significant functions/features that were added or modified
   - For each, check if there is a corresponding spec scenario
   - Classify each implementation feature:

   | Status | Meaning |
   |--------|---------|
   | **COVERED** | Functionality has a spec scenario that describes it |
   | **ORPHAN** | Functionality exists in code but no spec scenario covers it |

   **c. Cross-cutting concern check:**
   - For every capability in the proposal, check specs for coverage of:
     - Happy path (normal operation)
     - Empty state (no data / zero results)
     - Error state (API failure, invalid input, timeout)
   - FLAG any capability missing sad-path or empty-state scenarios

   **Present completeness results:**

   ```
   ### Completeness Scan

   #### Design Decisions Coverage
   | Decision | Status | Spec Reference |
   |----------|--------|----------------|
   | D1: Use hash routing | ✅ SPECIFIED | session-browser/spec.md R3 |
   | D5: Retry on API failure | ⚠️ UNSPECIFIED | No spec requirement found |

   #### Code-to-Spec Coverage
   | Implementation | Status | Spec Reference |
   |----------------|--------|----------------|
   | onRoute() handler | ✅ COVERED | session-browser/spec.md S4 |
   | debounceInput() | ⚠️ ORPHAN | No spec scenario covers this |
   | errorBanner() | ⚠️ ORPHAN | Added during impl, never specified |

   #### Cross-cutting Concerns
   | Capability | Happy | Empty | Error |
   |------------|-------|-------|-------|
   | session-browser | ✅ | ⚠️ Missing | ⚠️ Missing |
   | cost-analysis | ✅ | ✅ | ✅ |

   Coverage: X/Y decisions specified, Z/W features covered
   ```

5. **Generate verification report**

   Present combined results in this format:

   ```
   ## Verification: <change-name>

   ### Scenario Verification

   #### Requirement: <requirement-name>
   | Scenario | Status | Evidence |
   |----------|--------|----------|
   | Standard daily report | ✅ VERIFIED | `src/export/html.ts:15` + `html.test.ts:22` |
   | Empty markdown | ⚠️ CODE_ONLY | `src/export/html.ts:31` (no test) |

   ### Completeness Scan
   *(output from step 4)*

   ### Manual Verification Checklist
   CODE_ONLY scenarios with no automated test, but each has a `Verify:` line in tasks.md describing a concrete outcome to confirm by hand. Walk these in the browser/CLI before archiving. (Shown only when such scenarios exist.)

   | Task | Verify (from tasks.md) | Scenario |
   |------|------------------------|----------|
   | T12 | 切换项目后 session 列表刷新 | session-browser R3 |
   | T15 | 输入错误格式显示错误态 | form-validation R2 |

   A CODE_ONLY scenario with **no** `Verify:` line stays in the gap list (step 6) — either add a test or add a `Verify:` line.

   ### Overall Summary

   - Spec scenarios: Y/X verified (P%)
   - Design decisions: A/B specified (Q%)
   - Code features: C/D covered (R%)
   - Cross-cutting gaps: N capabilities missing sad-path/empty-state scenarios
   - Manual verify checks: M CODE_ONLY scenarios have `Verify:` lines (see checklist above)
   ```

6. **Handle gaps**

   **If all scenarios are VERIFIED (or CODE_ONLY but routed to the manual checklist via a matching `Verify:` line), and completeness scan is clean:**
   > "All scenarios verified, or covered by manual checks. Ready for `/opsx:archive`."

   If any CODE_ONLY scenarios relied on a `Verify:` line, walk through the Manual Verification Checklist (step 5) before archiving — these are tracked in `manualVerifyChecks` (step 7) and surfaced again at archive time. Manual checks do not block archive; they are not held as gaps here.

   **If any scenario is MISSING, STUB, PARTIAL, or CODE_ONLY WITHOUT a matching `Verify:` line, or completeness scan found gaps:**
   - List all gaps: missing scenarios, unspecified decisions, orphan code, missing cross-cutting concerns
   - Ask user: "Gaps found. Options:"
     - **Continue to archive** — accept the gaps, archive as-is (sets `gapsAccepted: true` in the `.verified` marker, step 7)
     - **Generate test stubs** — create test files for MISSING scenarios, or CODE_ONLY scenarios WITHOUT a `Verify:` line
     - **Go back to apply** — return to `/opsx:apply` to implement missing scenarios and features
     - **Update specs** — add missing requirements/scenarios for unspecified decisions or orphan code

   **If user selects "Generate test stubs":**
   For each MISSING scenario, or CODE_ONLY scenario WITHOUT a `Verify:` line, generate a test stub:

   ```typescript
   // TODO: Implement test for <scenario-name>
   test('<requirement>: <scenario-name>', () => {
     // WHEN: <when-condition>
     // THEN: <then-condition>
     expect(true).toBe(false); // Stub — replace with real test
   });
   ```

   Write stubs to the appropriate test file based on the spec's module location.

7. **Write verification marker**

   If all scenarios are VERIFIED and no gaps remain (or user accepts gaps), create a `.verified` marker file:

   Write a file at `<changeRoot>/.verified` containing:
   ```
   verifiedAt: <ISO timestamp>
   totalScenarios: <number>
   verified: <number>
   codeOnly: <number>
   partial: <number>
   missing: <number>
   stub: <number>
   scenarioCoverage: "<percentage>%"
   totalDecisions: <number>
   specifiedDecisions: <number>
   decisionCoverage: "<percentage>%"
   orphanCode: <number>
   crossCuttingGaps: <number>
   gapsAccepted: <boolean>   # true = user chose "Continue to archive" accepting remaining gaps; false = no gaps existed or all resolved
   manualVerifyChecks: <number>   # CODE_ONLY scenarios that have a matching Verify: line
   ```

8. **Post-verification**

   After verification, remind the user of the next step:

   > "Verification complete. Run `/opsx:archive` to archive this change."

**Search Strategy**

When looking for implementation evidence:

1. **Function search**: Use Grep to find function names from specs
2. **Type search**: Find type definitions mentioned in specs
3. **Test search**: Look for test files matching the module name (e.g., `insights.test.ts` for `insights.ts`)
4. **Edge case search**: For null/empty/zero scenarios, grep for guard conditions (null checks, empty array checks, try/catch)
5. **CLI search**: For CLI option scenarios, check Commander option definitions in `cli/index.ts`

**Guardrails**
- Do NOT modify implementation code — this is a read-only verification step
- The only writes are the `.verified` marker and optional test stubs (on user request)
- Be generous with VERIFIED — if code clearly handles the intent even if wording differs, count it
- Be strict with STUB — any TODO, `throw new Error("not implemented")`, or empty block is STUB
- Always search both implementation AND test files
- If a spec is ambiguous, note it in the report but don't block verification
