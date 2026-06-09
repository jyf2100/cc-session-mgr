## 1. Server Foundation

- [x] 1.1 Create `src/web/server.ts` with `startServer(summaries, port)` function using `node:http`, binding to `localhost` only, returning the server instance
- [x] 1.2 Write basic request router: match `/` → HTML, `/api/*` → JSON handlers, else → 404
- [x] 1.3 Add error handling for port-in-use (catch EADDRINUSE, print message, exit 1)
- [x] 1.4 Write unit tests for router: known routes match, unknown returns 404, API responses have correct Content-Type

## 2. API Handlers

- [x] 2.1 Create `src/web/api-handlers.ts` with `handleProjects(summaries)` — aggregate by project, return JSON array
- [x] 2.2 Add `handleSessions(summaries, filters)` — filter by project substring + date range, return JSON array with short fields
- [x] 2.3 Add `handleSessionDetail(summaries, idPrefix)` — prefix match, handle ambiguous (400) and not-found (404)
- [x] 2.4 Write unit tests for all handlers: project list, session filtering, prefix match, ambiguous prefix, not found

## 3. Web UI

- [x] 3.1 Create `src/web/ui.ts` with `getHtml()` returning full HTML page (inline CSS + JS skeleton)
- [x] 3.2 Implement project list view: fetch `/api/projects`, render cards with name, sessionCount, dateRange
- [x] 3.3 Implement session list view: fetch `/api/sessions?project=`, render table with date filter inputs, click → detail
- [x] 3.4 Implement session detail view: fetch `/api/sessions/:id`, render all fields (ID, project, time, messages, cost, models, file edits)
- [x] 3.5 Implement responsive CSS: 3-column on >= 768px, stacked on < 768px
- [x] 3.6 Implement hash-based routing: `#project=<name>`, `#session=<id>` for bookmarkable URLs

## 4. CLI Registration

- [x] 4.1 Add `web` command to `src/cli/index.ts` with `--port` option
- [x] 4.2 Wire handler: load summaries → merge costs → call `startServer()`, print URL

## 5. Integration Verification

- [x] 5.1 Run `npm run build` — no type errors
- [x] 5.2 Run `npm run test` — all tests pass
- [x] 5.3 Run `node dist/cli/index.js web` — open browser, verify project list loads
- [x] 5.4 Click a project → verify session list with date filter works
- [x] 5.5 Click a session → verify detail view shows all fields
