## 1. Types & Module Scaffolding

- [x] 1.1 Add `llmSummary: string | null` field to `WorkContent` interface in `src/types/index.ts` (default `null` in factory functions)
- [x] 1.2 Create `src/summarize/` directory with barrel `index.ts` export

## 2. Prompt Construction

- [x] 2.1 Create `src/summarize/prompt.ts` — pure function `buildSummaryPrompt(session: SessionWorkSummary): string` that formats all WorkContent signals into a labeled prompt
- [x] 2.2 Write unit tests for `buildSummaryPrompt` — verify prompt contains userIntents, moduleSummary, toolCallSummary, bashCommands, fileEdits sections when present
- [x] 2.3 Write unit test for minimal-data session (only compactedSummary) — verify prompt still produces valid output

## 3. Provider Adapters & API Client

- [x] 3.1 Create `src/summarize/providers.ts` — `LlmProvider` interface with `anthropicProvider` and `ollamaProvider` adapters
- [x] 3.2 Create `src/summarize/summarize.ts` — `summarizeSession()` using provider adapter with `fetch`
- [x] 3.3 Implement retry with exponential backoff (max 3 retries, 1s/2s/4s delays) for HTTP 429 responses
- [x] 3.4 Add `summarizeSessions()` — sequential loop, mutates `session.workContent.llmSummary`
- [x] 3.5 Implement `detectProvider()` — checks ANTHROPIC_API_KEY first, then probes Ollama; Ollama requires `--llm-model`
- [x] 3.6 Handle API errors (network, 5xx) — log warning to stderr, set `llmSummary: null`, continue to next session
- [x] 3.7 Write unit tests for `summarizeSession` with mocked `fetch` — Anthropic success/error, Ollama success/error, retry, empty session, batch

## 4. CLI Integration

- [x] 4.1 Add `--llm <provider>`, `--llm-model <name>`, `--llm-base-url <url>`, `--no-llm` flags to `report work-daily` and `report work-weekly` subcommands
- [x] 4.2 Implement `resolveSummarizeOptions()` — resolves CLI flags, env vars, and auto-detection
- [x] 4.3 Wire `maybeSummarize()` into `runWorkDaily` and `runWorkWeekly` — calls `summarizeSessions` before report generation

## 5. Report Integration

- [x] 5.1 Update `formatWorkBullet()` in `src/report/work-daily.ts` — prefer `llmSummary ?? primaryIntent`
- [x] 5.2 Update `formatWorkBullet()` in `src/report/work-weekly.ts` — same logic
- [x] 5.3 Update tests in `src/report/work-reports.test.ts` — add test cases for `llmSummary` presence and fallback

## 6. Verification

- [x] 6.1 Run full test suite — `npm run test` — 170 tests, all pass
- [x] 6.2 Run build — `npm run build` — clean compilation
- [ ] 6.3 Manual smoke test — `node dist/cli/index.js report work-daily` with Ollama running locally
