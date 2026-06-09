## Why

Current reports (daily/weekly/project) are usage-oriented — they show session counts, token consumption, and cost. Users need **work-content-oriented** reports: "what did I actually accomplish?" — a narrative summary of work done across projects, based on analyzing conversation content, tool calls, and file edits.

## What Changes

- **New parser module**: Extract work-content signals from JSONL entries — user prompts, assistant text responses, all tool calls (Bash commands, reads, searches, not just Write/Edit), `summary` entry text, and `customTitle`.
- **New aggregator module**: Build per-session work summaries that describe what was done, then group by date/week for reporting.
- **New report generators**: Produce Markdown reports (daily/weekly) that read like work logs — listing accomplishments, projects worked on, features implemented, files modified, problems solved — not usage metrics.
- **New CLI commands**: `report work-daily [date]`, `report work-weekly [week]` to generate content-oriented reports.
- **Web API + UI enhancement**: Add a work-summary endpoint and display work content in the session browser.

## Capabilities

### New Capabilities
- `work-extraction`: Extract work-content signals (user intent, assistant actions, tool calls, summaries) from JSONL conversation data per session
- `work-reports`: Generate content-oriented Markdown work reports (daily/weekly) that describe accomplishments rather than usage metrics

### Modified Capabilities

## Impact

- **New files**: `src/parser/extract-work-content.ts`, `src/aggregator/work-summaries.ts`, `src/report/work-daily.ts`, `src/report/work-weekly.ts`, plus test files
- **Modified files**: `src/types/index.ts` (new types for work content), `src/parser/index.ts` (barrel export), `src/aggregator/index.ts` (barrel export), `src/report/index.ts` (barrel export), `src/cli/index.ts` (new commands)
- **No breaking changes**: Existing reports and APIs remain untouched
- **Dependencies**: No new external dependencies; all processing is local, using text extraction and heuristic summarization (no LLM calls)
