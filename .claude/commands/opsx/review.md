---
name: "OPSX: Review"
description: Legacy slash-entry shim for the openspec-review-change skill. Prefer the skill directly.
category: Workflow
tags: [workflow, artifacts, experimental, review]
---

# OPSX: Review (Legacy Shim)

Use this only if you still invoke `/opsx:review`. The maintained workflow lives in `skills/openspec-review-change/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-review-change` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-review-change` skill.
- This is a read-only review that runs AFTER all artifacts exist and BEFORE `/opsx:apply`; never modify artifacts here.
- Report only the verdict and the PASS/FLAG risk-scan summary instead of maintaining a second checklist.
- On approval, delegate the `.reviewed` marker write to the skill rather than re-implementing it inline.
