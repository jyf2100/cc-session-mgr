---
name: "OPSX: Status"
description: Legacy slash-entry shim for the openspec-status skill. Prefer the skill directly.
category: Workflow
tags: [workflow, status, experimental]
---

# OPSX: Status (Legacy Shim)

Use this only if you still invoke `/opsx:status`. The maintained workflow lives in `skills/openspec-status/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-status` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-status` skill.
- Overlay the `.reviewed` / `.integration-checked` / `.verified` marker files onto the artifact view so the report shows both in one pass.
- Treat this strictly as read-only — report the verdict and recommended next step rather than re-implementing the gating logic here.
- If no change is supplied and none is inferrable, surface that plainly instead of fabricating status.
