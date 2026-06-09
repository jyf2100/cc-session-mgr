## Why

The heuristic `extractWorkContent()` extracts user intents, tool calls, and module names from JSONL entries — but it cannot understand *what was accomplished*. The resulting reports show slash commands, skill names, or raw file paths instead of meaningful work descriptions. An LLM can synthesize the structured signals (user messages, tool calls, file edits, assistant snippets, compacted summaries) into a natural-language summary of what each session actually did.

## What Changes

- New `src/summarize/` module that calls the Anthropic API to generate per-session work summaries
- Accepts the existing `WorkContent` + `SessionWorkSummary` data as input; returns a short natural-language string
- CLI gains a `--no-llm` flag to skip LLM calls and fall back to the current heuristic output
- Report formatters (`work-daily.ts`, `work-weekly.ts`) prefer the LLM summary when available, fall back to `primaryIntent`
- No changes to parser or aggregator — the summarize layer sits between aggregator and report

## Capabilities

### New Capabilities
- `llm-summary`: Generates natural-language work summaries by sending structured session data to the Anthropic API. Handles batching, rate limiting, `--no-llm` fallback, and error recovery.

### Modified Capabilities
<!-- No existing capabilities require spec-level changes. The report layer is an implementation detail of the existing work-content-reports pipeline. -->

## Impact

- **New dependency**: `@anthropic-ai/sdk` (or direct `fetch` to the Messages API)
- **New module**: `src/summarize/` (~3 files: `summarize.ts`, `prompt.ts`, `index.ts`)
- **CLI changes**: `report daily` and `report weekly` commands accept `--no-llm` flag
- **Report changes**: `work-daily.ts` and `work-weekly.ts` use LLM summary in `formatWorkBullet()` when present
- **Types**: `WorkContent` gains an optional `llmSummary: string | null` field
- **No breaking changes**: Existing behavior is preserved when `--no-llm` is used or API key is absent
