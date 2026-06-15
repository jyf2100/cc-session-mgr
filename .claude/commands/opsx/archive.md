---
name: "OPSX: Archive"
description: Legacy slash-entry shim for the openspec-archive-change skill. Prefer the skill directly.
category: Workflow
tags: [workflow, archive, experimental]
---

# OPSX: Archive (Legacy Shim)

Use this only if you still invoke `/opsx:archive`. The maintained workflow lives in `skills/openspec-archive-change/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-archive-change` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-archive-change` skill.
- When `$ARGUMENTS` is empty, fall back to the skill's change-selection step rather than guessing a name here.
- Report only the final archive verdict (success / success-with-warnings / archive-exists error); the completion checks, marker reads, and sync assessment live in the skill.
- Surface the `Output On Success With Warnings` and `Output On Error (Archive Exists)` templates verbatim from the skill when those branches fire — do not reword them.
