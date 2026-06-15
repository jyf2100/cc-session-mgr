---
name: openspec-archive-change
description: Archive a completed change in the experimental workflow. Use when the user wants to finalize and archive a change after implementation is complete.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.4.1"
---

Archive a completed change in the experimental workflow.

**Input**: Optionally specify a change name. If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **If no change name provided, prompt for selection**

   Run `openspec list --json` to get available changes. Use the **AskUserQuestion tool** to let the user select.

   Show only active changes (not already archived).
   Include the schema used for each change if available.

   **IMPORTANT**: Do NOT guess or auto-select a change. Always let the user choose.

2. **Check artifact completion status**

   Run `openspec status --change "<name>" --json` to check artifact completion.

   Parse the JSON to understand:
   - `schemaName`: The workflow being used
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context
   - `artifacts`: List of artifacts with their status (`done` or other)

   If status reports `actionContext.mode: "workspace-planning"`, explain that workspace archive is not supported in this slice and STOP. Do not move workspace changes into repo-local archives or edit linked repos.

   **If any artifacts are not `done`:**
   - Display warning listing incomplete artifacts
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Check process markers**

   Read the process gate markers from `changeRoot/` to see which workflow stages were actually completed:

   - `.reviewed` — written by `/opsx:review` on approval
   - `.integration-checked` — written by `/opsx:check-integration`
   - `.verified` — written by `/opsx:verify`

   For each marker that exists, read it and surface the key completeness field:
   - `.reviewed` → `scanResults.designCompleteness` (PASS|FLAG)
   - `.integration-checked` → `coverage` and `gapsAccepted`
   - `.verified` → `scenarioCoverage`, `decisionCoverage`, `crossCuttingGaps`, `gapsAccepted`, and `manualVerifyChecks` (gapsAccepted: user chose to archive despite remaining gaps; manualVerifyChecks: CODE_ONLY scenarios signed off by hand via a `Verify:` line — verified in the browser/CLI, not by an automated test)

   **If any marker is missing:**
   - Display a warning listing which gates were skipped
   - Pay special attention to a missing `.verified` — it means the implementation was never checked against specs
   - Use the **AskUserQuestion tool** to confirm the user wants to archive without these gates
   - Proceed if user confirms

   This does not block archive — it ensures the user consciously skips a gate rather than forgetting it existed.

5. **Assess delta spec sync state**

   Use `artifactPaths.specs.existingOutputPaths` from status JSON to check for delta specs. If none exist, proceed without sync prompt.

   **If delta specs exist:**
   - Compare each delta spec with its corresponding main spec at `openspec/specs/<capability>/spec.md`
   - Determine what changes would be applied (adds, modifications, removals, renames)
   - Show a combined summary before prompting

   **Prompt options:**
   - If changes needed: "Sync now (recommended)", "Archive without syncing"
   - If already synced: "Archive now", "Sync anyway", "Cancel"

   If user chooses sync, use Task tool (subagent_type: "general-purpose", prompt: "Use Skill tool to invoke openspec-sync-specs for change '<name>'. Delta spec analysis: <include the analyzed delta spec summary>"). Proceed to archive regardless of choice.

6. **Perform the archive**

   Create an `archive` directory under `planningHome.changesDir` if it doesn't exist:
   ```bash
   mkdir -p "<planningHome.changesDir>/archive"
   ```

   Generate target name using current date: `YYYY-MM-DD-<change-name>`

   **Check if target already exists:**
   - If yes: Fail with error, suggest renaming existing archive or using different date
   - If no: Move `changeRoot` to the archive directory

   ```bash
   mv "<changeRoot>" "<planningHome.changesDir>/archive/YYYY-MM-DD-<name>"
   ```

7. **Display summary**

   Show archive completion summary including:
   - Change name
   - Schema that was used
   - Archive location
   - Whether specs were synced (if applicable)
   - Which process gates were passed vs skipped
   - Note about any warnings (incomplete artifacts/tasks)
   - Gaps accepted by user (from `.verified.gapsAccepted`), if true — user chose to archive despite remaining gaps
   - Manual verify checks pending (from `.verified.manualVerifyChecks`), if any — scenarios signed off by hand rather than an automated test

   **Retro hook (non-blocking)**: If this change triggered ≥2 rounds of user verification, surfaced cross-module bugs, or skipped the `.verified` gate, suggest capturing lessons learned:

   > "This change had rough edges. Consider writing a `docs/retro-YYYY-MM-DD-<change-name>.md` so the next change avoids the same traps. Run `/opsx:explore` to reflect."

   This is a suggestion, not a requirement. Do not block on it.

**Output On Success**

```
## Archive Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** the archive path derived from `planningHome.changesDir`/YYYY-MM-DD-<name>/
**Specs:** ✓ Synced to main specs (or "No delta specs" or "Sync skipped")

All artifacts complete. All tasks complete.
```

**Output On Success With Warnings**

When the archive succeeds but the change carried unfinished artifacts, incomplete tasks, or a skipped delta spec sync, surface all inconsistencies in one structured block instead of folding them away:

```
## Archive Complete (with warnings)

**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** the archive path derived from `planningHome.changesDir`/YYYY-MM-DD-<name>/
**Specs:** Sync skipped (user chose to skip)

**Warnings:**
- Archived with <N> incomplete artifacts
- Archived with <N> incomplete tasks
- Delta spec sync was skipped (user chose to skip)

Review the archive if this was not intentional.
```

**Output On Error (Archive Exists)**

When the target archive directory already exists, fail with a structured block listing the three resolution options so the user has a consistent choice surface:

```
## Archive Failed

**Change:** <change-name>
**Target:** the archive path derived from `planningHome.changesDir`/YYYY-MM-DD-<name>/

Target archive directory already exists.

**Options:**
1. Rename the existing archive
2. Delete the existing archive if it's a duplicate
3. Wait until a different date to archive
```

**Guardrails**
- Always prompt for change selection if not provided
- Use artifact graph (openspec status --json) for completion checking
- Don't block archive on warnings - just inform and confirm
- Process markers (`.reviewed`/`.integration-checked`/`.verified`) inform but never block — surface and confirm
- Preserve .openspec.yaml when moving to archive (it moves with the directory)
- Show clear summary of what happened
- If sync is requested, use openspec-sync-specs approach (agent-driven)
- If delta specs exist, always run the sync assessment and show the combined summary before prompting
