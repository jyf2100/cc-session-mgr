## 1. Format Functions

- [x] 1.1 Create `src/report/session-format.ts` with `formatSessionRow(s: SessionSummary): string` — returns one Markdown table row: `| shortId | title | date | msgs | cost |`
- [x] 1.2 Add `formatSessionList(sessions: SessionSummary[], limit: number): string` — header + table rows + count line
- [x] 1.3 Add `formatSessionDetail(s: SessionSummary): string` — full detail view with sections: ID, project, time, messages, cost, models, file edits
- [x] 1.4 Write unit tests for `session-format.ts`: row format, list with limit, detail view, untitled session fallback

## 2. CLI Handlers

- [x] 2.1 Create `src/cli/session-handlers.ts` with `runList(opts)` handler — build summaries, filter by project/date/limit, call `formatSessionList`, output
- [x] 2.2 Add `runShow(sessionId, opts)` handler — build summaries, find by ID (prefix match), handle ambiguous/missing cases, call `formatSessionDetail`, output
- [x] 2.3 Write unit tests for handlers: filter logic, prefix matching, ambiguous prefix error, not-found error

## 3. CLI Registration

- [x] 3.1 Register `session` command group with `list` and `show` subcommands in `src/cli/index.ts`
- [x] 3.2 Add `--project`, `--from`, `--to`, `--limit` options to `session list`
- [x] 3.3 Add `<sessionId>` argument to `session show`

## 4. Integration Verification

- [x] 4.1 Run `npm run build` — no type errors
- [x] 4.2 Run `npm run test` — all tests pass
- [x] 4.3 Run `node dist/cli/index.js session list --project cc-session-mgr` — verify output
- [x] 4.4 Run `node dist/cli/index.js session show <id>` with a real session ID — verify detail output
