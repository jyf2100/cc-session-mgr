---
name: "OPSX: Apply"
description: Legacy slash-entry shim for the openspec-apply-change skill. Prefer the skill directly.
category: Workflow
tags: [workflow, artifacts, experimental]
---

# OPSX: Apply (Legacy Shim)

Use this only if you still invoke `/opsx:apply`. The maintained workflow lives in `skills/openspec-apply-change/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-apply-change` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-apply-change` skill.
- Pass the optional change name (e.g., `/opsx:apply add-auth`) through unchanged; omit it to let the skill infer or auto-select.
- When the skill suggests the blocked state, point users to the `openspec-continue-change` skill rather than the legacy `/opsx:continue` reference in older docs.
- Report only the verdict (change used, progress, pause reason) instead of maintaining a second progress checklist here.
