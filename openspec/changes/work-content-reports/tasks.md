## 1. Types

- [x] 1.1 Add `WorkContent` type to `src/types/index.ts` with fields: `primaryIntent`, `toolCallSummary` (Map-like record), `bashCommands` (string[]), `moduleSummary` (string[]), `assistantSnippets` (string[]), `compactedSummary` (string | null)
- [x] 1.2 Add `SessionWorkSummary` type to `src/types/index.ts` combining `SessionSummary` with `WorkContent`
- [x] 1.3 Add `WorkDailyData` and `WorkWeeklyData` types to `src/types/index.ts` for report generator consumption

## 2. Parser — Work Content Extraction

- [x] 2.1 Create `src/parser/extract-work-content.ts` with `extractWorkContent(entries: JsonlEntry[]): WorkContent` function
- [x] 2.2 Implement user intent extraction: read first user message text, truncate to 200 chars, fallback to customTitle / "Untitled session"
- [x] 2.3 Implement tool call summary extraction: iterate assistant entries for `tool_use` blocks, count by name
- [x] 2.4 Implement Bash command extraction: get `input.command` from Bash tool_use blocks, deduplicate consecutive, cap at 20
- [x] 2.5 Implement module summary extraction: group file edits by `src/` subdirectory or root dir, format as "module (N files)"
- [x] 2.6 Implement assistant text snippet extraction: get `text` blocks from assistant messages, cap 5 snippets × 150 chars
- [x] 2.7 Implement compacted session handling: detect `compact_boundary` / `summary` entries, extract summary text up to 500 chars
- [x] 2.8 Handle empty entries array: return default WorkContent with empty values
- [x] 2.9 Export `extractWorkContent` from `src/parser/index.ts`

## 3. Parser — Tests

- [x] 3.1 Create `src/parser/extract-work-content.test.ts` with test factory for JsonlEntry
- [x] 3.2 Test user intent extraction (with messages, fallback to title, fallback to default)
- [x] 3.3 Test tool call summary (multiple tools, no tools)
- [x] 3.4 Test Bash command extraction (with commands, dedup, cap at 20)
- [x] 3.5 Test module summary (src/ subdirs, root files, empty edits)
- [x] 3.6 Test assistant snippets (with text blocks, no text blocks, truncation)
- [x] 3.7 Test compacted session handling (with summary, without summary)
- [x] 3.8 Test empty entries array returns defaults

## 4. Aggregator — Work Summaries

- [x] 4.1 Create `src/aggregator/work-summaries.ts` with `buildWorkSummaries(claudeDir: string): Promise<SessionWorkSummary[]>` that extends `buildSessionSummaries` with work content extraction
- [x] 4.2 Create `src/aggregator/work-by-date.ts` with `aggregateWorkByDate(summaries: SessionWorkSummary[], dateRange?): WorkDailyData[]`
- [x] 4.3 Create `src/aggregator/work-by-week.ts` with `aggregateWorkByWeek(dailyData: WorkDailyData[], weekRange?): WorkWeeklyData[]`
- [x] 4.4 Export new aggregator functions from `src/aggregator/index.ts`

## 5. Aggregator — Tests

- [x] 5.1 Create `src/aggregator/work-summaries.test.ts` with test factory for SessionWorkSummary
- [x] 5.2 Test `buildWorkSummaries` integration (uses real parser + extractor)
- [x] 5.3 Test `aggregateWorkByDate` (multi-date grouping, single date, empty)
- [x] 5.4 Test `aggregateWorkByWeek` (week grouping, boundary crossing, empty)

## 6. Report — Work Report Generators

- [x] 6.1 Create `src/report/work-daily.ts` with `generateWorkDailyReport(data: WorkDailyData): string`
- [x] 6.2 Implement per-project accomplishment bullets: combine primaryIntent + moduleSummary
- [x] 6.3 Handle empty day case: "No work sessions found for YYYY-MM-DD."
- [x] 6.4 Create `src/report/work-weekly.ts` with `generateWorkWeeklyReport(data: WorkWeeklyData): string`
- [x] 6.5 Implement day-by-day breakdown with per-project sections
- [x] 6.6 Handle empty week case: "No work sessions found for week YYYY-WNN."
- [x] 6.7 Export new report functions from `src/report/index.ts`

## 7. Report — Tests

- [x] 7.1 Create `src/report/work-daily.test.ts` with test factory for WorkDailyData
- [x] 7.2 Test multi-project daily report, single project, empty day
- [x] 7.3 Test accomplishment bullet formatting (intent + modules, intent only)
- [x] 7.4 Create `src/report/work-weekly.test.ts` with test factory for WorkWeeklyData
- [x] 7.5 Test multi-day weekly report, single day, empty week

## 8. CLI Integration

- [x] 8.1 Add `work-daily` subcommand to `src/cli/index.ts` under the `report` command, optional date arg (default today)
- [x] 8.2 Add `work-weekly` subcommand to `src/cli/index.ts` under the `report` command, optional week arg (default current week)
- [x] 8.3 Wire CLI commands to pipeline: `buildWorkSummaries` → `aggregateWorkByDate`/`aggregateWorkByWeek` → `generateWorkDailyReport`/`generateWorkWeeklyReport` → `writeReport`

## 9. Smoke Test

- [x] 9.1 Build the project (`npm run build`) and verify no errors
- [x] 9.2 Run `node dist/cli/index.js report work-daily` and verify output
- [x] 9.3 Run `node dist/cli/index.js report work-weekly` and verify output
