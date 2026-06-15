---
name: "OPSX: Check Integration"
description: Legacy slash-entry shim for the openspec-check-integration skill. Prefer the skill directly.
category: Workflow
tags: [workflow, artifacts, experimental, review]
---

# Check Integration (Legacy Shim)

Use this only if you still invoke `/opsx:check-integration`. The maintained workflow lives in `skills/openspec-check-integration/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-check-integration` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-check-integration` skill.
- Pass `<change-name>` as the change to scan; omit to auto-detect.
- Runs after artifact review and before apply — keep this ordering when delegating.
- Report only the verdict (boundary map + GAP/COVERED/IMPLICIT summary); the skill owns the scan procedure and report format.
