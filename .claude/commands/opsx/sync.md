---
name: "OPSX: Sync"
description: Legacy slash-entry shim for the openspec-sync-specs skill. Prefer the skill directly.
category: Workflow
tags: [workflow, specs, experimental]
---

# OPSX: Sync (Legacy Shim)

Use this only if you still invoke `/opsx:sync`. The maintained workflow lives in `skills/openspec-sync-specs/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-sync-specs` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-sync-specs` skill.
- Never guess or auto-select a change; always let the user pick when no name is supplied.
- Stop early if status reports `actionContext.mode: "workspace-planning"` — workspace spec sync is not supported in this slice.
- Report only the synced-specs verdict (capabilities touched, add/modify/remove/rename counts) instead of maintaining a second checklist here.
