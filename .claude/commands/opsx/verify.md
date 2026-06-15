---
name: "OPSX: Verify"
description: Legacy slash-entry shim for the openspec-verify-change skill. Prefer the skill directly.
category: Workflow
tags: [workflow, artifacts, experimental, verification]
---

# OPSX: Verify (Legacy Shim)

Use this only if you still invoke `/opsx:verify`. The maintained workflow lives in `skills/openspec-verify-change/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-verify-change` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-verify-change` skill.
- Accept the change name as `$ARGUMENTS`; if omitted, infer from context or prompt via `openspec list --json`.
- Report only the verdict plus gap summary — the scenario completeness scan, `.verified` marker schema, and CODE_ONLY/Verify-line routing live in the skill.
- Read-only by default; the only writes are the `.verified` marker and optional user-requested test stubs, exactly as the skill dictates.
