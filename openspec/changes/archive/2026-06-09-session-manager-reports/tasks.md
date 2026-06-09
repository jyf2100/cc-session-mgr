## 1. Project Setup

- [x] 1.1 Initialize TypeScript project with `package.json`, `tsconfig.json`, and `src/` directory structure
- [x] 1.2 Add dependencies: `commander` (CLI), `glob` (file discovery), `typescript` (compiler), `vitest` (testing)
- [x] 1.3 Create project directory layout: `src/parser/`, `src/aggregator/`, `src/report/`, `src/cli/`

## 2. JSONL Parser (spec: jsonl-parser)

- [x] 2.1 Implement `parseJsonlStream(filePath)` — readline-based streaming JSONL parser that yields parsed entries
- [x] 2.2 Implement `extractSessionMetadata(entries)` — extract sessionId, cwd, timestamps, version, permission mode from first entries
- [x] 2.3 Implement `extractMessageStats(entries)` — count message types (user, assistant, system) and identify model
- [x] 2.4 Implement `extractCostData(entries)` — sum `costUSD` from assistant entries, flag incomplete data
- [x] 2.5 Implement `scanProjects(claudeDir)` — discover all project directories under `~/.claude/projects/`
- [x] 2.6 Implement `decodeProjectPaths(encodedDirs, claudeDir)` — three-layer path decoding (session metadata -> JSONL cwd -> naive fallback)
- [x] 2.7 Write unit tests for parser: valid JSONL, malformed lines, missing metadata, large file handling, cost extraction

## 3. Session Aggregator (spec: session-aggregator)

- [x] 3.1 Define `SessionSummary` TypeScript interface (sessionId, projectPath, startTime, endTime, messageCounts, cost, model, fileEdits)
- [x] 3.2 Implement `buildSessionSummaries(claudeDir)` — orchestrate parser to produce SessionSummary[] from all projects
- [x] 3.3 Implement `aggregateByDate(summaries, dateRange)` — group sessions by calendar date with statistics
- [x] 3.4 Implement `aggregateByWeek(summaries, weekRange)` — group sessions by ISO week with statistics
- [x] 3.5 Implement `aggregateByProject(summaries, projectFilter)` — group sessions by decoded project path with statistics
- [x] 3.6 Implement `mergeCostData(summaries, claudeDir)` — read `costs.jsonl` and enrich session costs
- [x] 3.7 Implement `extractFileEditSummary(entries)` — scan Write/Edit tool_use entries and count file modifications
- [x] 3.8 Write unit tests for aggregator: daily grouping, weekly grouping, project grouping, model distribution, cost merge

## 4. Report Generator (spec: report-generator)

- [x] 4.1 Define report data interfaces: `DailyReportData`, `WeeklyReportData`, `ProjectReportData`
- [x] 4.2 Implement `generateDailyReport(data)` — Markdown daily report with date header, per-project breakdown, total summary
- [x] 4.3 Implement `generateWeeklyReport(data)` — Markdown weekly report with day-by-day table, project ranking, model usage
- [x] 4.4 Implement `generateProjectReport(data)` — Markdown project report with history, cost summary, top files, recent sessions
- [x] 4.5 Implement `formatCost(usd)` — format as `$X.XX` with 2 decimal places
- [x] 4.6 Implement `writeReport(markdown, outputPath)` — write to file or stdout based on output option
- [x] 4.7 Write unit tests for report generator: daily output, weekly output, project output, empty data, cost formatting

## 5. CLI Interface (spec: cli-interface)

- [x] 5.1 Implement CLI entry point with `commander`: `session-mgr report` command group
- [x] 5.2 Implement `session-mgr report daily [date]` subcommand — default to today, parse YYYY-MM-DD
- [x] 5.3 Implement `session-mgr report weekly [week]` subcommand — default to current week, parse YYYY-WNN
- [x] 5.4 Implement `session-mgr report project <name>` subcommand — fuzzy-match project name
- [x] 5.5 Add `--output <path>` global option — redirect report to file
- [x] 5.6 Add `--claude-dir <path>` global option — override default `~/.claude` config directory
- [x] 5.7 Add `--version` and `--help` flags

## 6. Integration & End-to-End

- [x] 6.1 Write integration test: parse real `~/.claude/` directory, generate daily report for today
- [x] 6.2 Write integration test: generate weekly report for current week
- [x] 6.3 Write integration test: generate project report for an existing project
- [x] 6.4 Add `bin` entry in `package.json` for `session-mgr` CLI
- [x] 6.5 Add README.md with usage examples and installation instructions
