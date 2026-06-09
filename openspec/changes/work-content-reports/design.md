## Context

cc-session-mgr's four-stage pipeline (parser → aggregator → report → cli) currently extracts metadata, message counts, cost, and file edit paths — but never reads the actual conversation content. The existing `extractFileEditSummary` demonstrates the pattern of inspecting `message.content` arrays for `tool_use` blocks, but only for Write/Edit operations. User prompts, assistant text responses, Bash commands, and other tool calls are present in the data but ignored.

The user wants reports that answer "what did I accomplish?" not "how much did I use?"

## Goals / Non-Goals

### Goals
- Extract meaningful work-content signals from JSONL conversation data without external dependencies
- Generate per-session work summaries describing what was done
- Produce daily/weekly Markdown reports that read like work logs
- Support both CLI output and future web UI consumption
- Keep the existing pipeline untouched — new modules slot in alongside

### Non-Goals
- LLM-based summarization (no API calls, no API keys, no network)
- Perfect natural language understanding — heuristic extraction is acceptable
- Real-time processing — batch extraction from local files only
- Replacing existing reports — they remain available

## Decisions

### Decision 1: Heuristic extraction, not ML

**Choice**: Use rule-based text extraction and pattern matching to derive work summaries from conversation content.

**Alternatives considered**:
- LLM summarization via API: Would produce better prose, but requires network, API keys, costs money, and adds latency. Violates the project's "read-only local tool" principle.
- Template-based extraction only (no text analysis): Would miss the narrative aspect — user wouldn't get "implemented web UI" from just file paths.

**Rationale**: Heuristics can extract 80% of the value (what files were edited, what commands were run, what the session title says) with zero dependencies and zero cost.

### Decision 2: Three-tier extraction strategy

Extract work content at increasing levels of granularity:

1. **Session title** (`customTitle` or first user message topic) — already available, strong signal
2. **File edit narrative** (group edits by directory/module, describe as "worked on X module") — derived from existing `FileEditEntry` data plus new extraction
3. **Action summary** (extract key verbs from user prompts and tool calls) — new extraction from `message.content`

Each tier degrades gracefully if data is missing.

### Decision 3: New types extend the existing pipeline

Add new types (`WorkContent`, `SessionWorkSummary`, `WorkDailyData`, `WorkWeeklyData`) to `src/types/index.ts`. These are parallel to existing types — no existing types are modified. The aggregator produces `SessionWorkSummary[]` alongside `SessionSummary[]`.

### Decision 4: Extraction as a new parser module

`src/parser/extract-work-content.ts` follows the same pattern as `extractFileEditSummary` — takes `JsonlEntry[]`, returns a structured result. This keeps the parser layer responsible for all data extraction from raw entries.

### Decision 5: Report format — structured Markdown

Work reports use a structured Markdown format:
- Header with date/week range
- Per-project sections with bullet-point accomplishments
- File change summary grouped by module
- Key commands/actions list
- No prose paragraphs — the user composes prose themselves from the structured output

## Risks / Trade-offs

- **[Heuristic quality]** → Heuristics may miss context or misinterpret intent. Mitigation: show raw signals (file edits, commands, titles) alongside derived summaries so the user can judge accuracy.
- **[Compacted sessions]** → Compacted/summarized sessions lose original message content. Mitigation: fall back to `summary` entry content and `customTitle` when original messages are unavailable.
- **[Large sessions]** → Some sessions have thousands of messages. Mitigation: cap extraction at first N user messages and last N tool calls; truncate individual text blocks at 500 characters.
- **[Privacy]** → Conversation content may contain sensitive data. Mitigation: reports are generated locally and written to stdout or local files; no data leaves the machine.

## Migration Plan

- Purely additive — no migration needed
- New CLI commands (`report work-daily`, `report work-weekly`) are opt-in
- Existing `report daily`, `report weekly`, `report project` commands unchanged

## Open Questions

- Should work reports support a `--detail` flag for including raw extracted signals alongside summaries?
- Should the web UI get a dedicated "Work Summary" tab, or integrate into existing session detail view?
