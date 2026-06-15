---
name: "OPSX: Propose"
description: Legacy slash-entry shim for the openspec-propose skill. Prefer the skill directly.
category: Workflow
tags: [workflow, artifacts, experimental]
---

# OPSX: Propose (Legacy Shim)

Use this only if you still invoke `/opsx:propose`. The maintained workflow lives in `skills/openspec-propose/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-propose` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-propose` skill.
- Treat the argument as a kebab-case change name or a free-form description; derive the kebab-case name before delegating so the skill receives a concrete target.
- Report only the change name, location, and the next step (`/opsx:apply`) instead of duplicating the artifact-build checklist here.
- If a change with the derived name already exists, surface the conflict decision (resume vs. create new) before proceeding into the skill.
