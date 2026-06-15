---
name: openspec-status
description: Show where a change stands in the OpenSpec workflow — artifact completion plus process-gate markers (.reviewed/.integration-checked/.verified). Use to see what's done, what's skipped, and what to run next, at a glance.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  inspired-by: retro-2026-06-12-web-ui-redesign
---

Show the current position of a change in the OpenSpec workflow — not just artifact completion (which `openspec status` already shows), but **which process gates have been passed**.

This overlays the three marker files written by the workflow commands onto the artifact graph, so at a glance you can see: *what's done, what's skipped, and what to run next*.

**Why this exists**: `openspec status` reports artifact `done/todo`, but the workflow gates (`.reviewed`, `.integration-checked`, `.verified`) are invisible there. Without this view, you can't tell whether a "done" change was ever reviewed or verified — the exact blindness that let incomplete changes reach archive.

**Input**: Optionally specify a change name (e.g., `/opsx:status add-auth`). If omitted, infer from context or prompt.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` and use **AskUserQuestion** to let the user select

2. **Get artifact + path context**

   Run `openspec status --change "<name>" --json`.

   Parse for:
   - `schemaName`
   - `changeRoot` — where the marker files live
   - `artifacts` — each artifact's `status` (`done` or other)

3. **Read process gate markers**

   From `changeRoot/`, read each marker if it exists:

   - `.reviewed` → note `reviewedAt`, `scanResults.designCompleteness`
   - `.integration-checked` → note `checkedAt`, `coverage`, `gaps`, `gapsAccepted`
   - `.verified` → note `verifiedAt`, `scenarioCoverage`, `decisionCoverage`, `crossCuttingGaps`, `manualVerifyChecks` (count of CODE_ONLY scenarios signed off by hand via a `Verify:` line)

   Record presence/absence and the key signal from each. apply has no marker of its own — task completion (step 4) is its proxy.

4. **Read task completion**

   Read `tasks.md` (from `artifactPaths.tasks.existingOutputPaths`, or `changeRoot/tasks.md`).

   Count `- [x]` (complete) vs `- [ ]` (incomplete). This tells "apply done" from "apply in progress".

5. **Infer workflow position**

   Use the marker + task state to locate the change on the workflow:

   | `.reviewed` | `.integration-checked` | tasks complete | `.verified` | Position | Next |
   |-------------|------------------------|----------------|-------------|----------|------|
   | absent | — | — | — | pre-review | `/opsx:review` |
   | present | absent | — | — | post-review | `/opsx:check-integration` |
   | present | present | no | — | apply (in progress) | `/opsx:apply` |
   | present | present | yes | absent | post-apply | `/opsx:verify` |
   | present | present | yes | present | ready to archive | `/opsx:archive` |

   Also detect **anomalies** — gates present out of order:
   - `.verified` present but `.reviewed` absent → verify ran without review
   - `.verified` present but `.integration-checked` absent → verify ran without integration check
   - `.integration-checked` present but `.reviewed` absent → integration checked without review
   - `.verified` present but tasks incomplete → verified before all tasks done
   - `.integration-checked` present but tasks incomplete → integration checked before apply completed

   Surface these as warnings; they usually mean a gate was skipped.

6. **Display status report**

   Present in this format:

   ```
   ## Change Status: <change-name>

   **Schema**: <schema-name>

   ### Artifacts
   - proposal.md ✅
   - design.md ✅
   - specs ✅ (N requirements)
   - tasks.md <X/Y complete>

   ### Process Gates
   | Gate | Marker | Status | Key Signal |
   |------|--------|--------|------------|
   | Review | .reviewed | ✅ passed | designCompleteness: PASS |
   | Integration | .integration-checked | ✅ passed | coverage: 100%, gapsAccepted: false |
   | Verify | .verified | ⚠️ not run | — |

   ### Workflow Position
   propose ✓ → review ✓ → check-integration ✓ → apply (3/10) → verify → archive
                                                 ^ here

   ### Next Step
   Continue `/opsx:apply` — 7 tasks remaining.
   ```

   If anomalies exist, add:

   ```
   ### Anomalies
   - ⚠️ `.verified` exists but `.reviewed` is missing — verify ran without review
   ```

   If fully ready:

   ```
   ### Workflow Position
   propose ✓ → review ✓ → check-integration ✓ → apply ✓ → verify ✓ → archive
                                                                    ^ here

   ### Next Step
   Ready to `/opsx:archive`.
   ```

**Guardrails**
- Read-only — never write or modify anything
- Do not run apply/review/verify/archive — only report and recommend
- If a marker is malformed or unreadable, show `⚠️ unreadable` rather than guessing its contents
- If no change is selected and none exists, say so plainly — don't fabricate status
