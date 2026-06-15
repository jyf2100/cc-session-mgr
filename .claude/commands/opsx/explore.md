---
name: "OPSX: Explore"
description: Legacy slash-entry shim for the openspec-explore skill. Prefer the skill directly.
category: Workflow
tags: [workflow, explore, experimental, thinking]
---

# OPSX: Explore (Legacy Shim)

Use this only if you still invoke `/opsx:explore`. The maintained workflow lives in `skills/openspec-explore/SKILL.md`.

## Canonical Surface

- Prefer the `openspec-explore` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

$ARGUMENTS

## Delegation

Apply the `openspec-explore` skill.
- Pass `$ARGUMENTS` through unchanged — the skill defines the five accepted shapes (vague idea, specific problem, change name, comparison, empty) in its `## Input` section.
- If a change name is given, the skill will read that change's artifacts for context before exploring — do not pre-resolve it here.
- Report only the summary shape described in the skill's `## Ending Discovery`; do not maintain a second checklist.
