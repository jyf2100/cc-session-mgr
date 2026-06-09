## ADDED Requirements

### Requirement: Aggregate sessions by date
The system SHALL group sessions by calendar date (using session start timestamp) and compute per-day statistics.

#### Scenario: Daily aggregation
- **WHEN** sessions exist on 2026-06-07, 2026-06-08, and 2026-06-09
- **THEN** the system SHALL produce three daily groups, each with session count, total cost, and message totals

#### Scenario: Filter by date range
- **WHEN** a start date and optional end date are provided
- **THEN** the system SHALL only include sessions whose start timestamp falls within the range

### Requirement: Aggregate sessions by week
The system SHALL group sessions by ISO week (Monday-Sunday) and compute per-week statistics.

#### Scenario: Weekly aggregation
- **WHEN** sessions span Monday June 2 through Sunday June 8
- **THEN** the system SHALL group them into a single weekly summary for ISO week 23

### Requirement: Aggregate sessions by project
The system SHALL group sessions by decoded project path and compute per-project statistics.

#### Scenario: Project aggregation
- **WHEN** 5 sessions exist for project `/Users/dev/app` and 3 sessions for `/Users/dev/api`
- **THEN** the system SHALL produce two project groups with respective counts and statistics

#### Scenario: Sort projects by activity
- **WHEN** project aggregation is complete
- **THEN** the system SHALL sort projects by total session count (descending) as default order

### Requirement: Compute time-range statistics
The system SHALL compute the following metrics for each aggregation group: total sessions, total messages (user + assistant), total cost (USD), model distribution, and active time span.

#### Scenario: Calculate model distribution
- **WHEN** a week has 10 sessions using `sonnet` and 3 using `haiku`
- **THEN** the system SHALL report model distribution as `{sonnet: 10, haiku: 3}`

#### Scenario: Calculate active time span
- **WHEN** a day has sessions from 09:00 to 17:30
- **THEN** the system SHALL report active time span as `09:00 - 17:30` (8h 30m)

### Requirement: Extract file edit summary per project
The system SHALL scan tool_use entries for file edit operations (Write, Edit) and produce a summary of modified files per project.

#### Scenario: Summarize file edits
- **WHEN** a session contains Write tool calls to `src/auth.ts` and `src/utils.ts`
- **THEN** the system SHALL include those files in the project's file edit summary with edit counts

### Requirement: Merge cost data from costs.jsonl
The system SHALL read `~/.claude/metrics/costs.jsonl` and merge per-request cost data with session-level data.

#### Scenario: Enrich session costs
- **WHEN** `costs.jsonl` has entries for session `abc-123` with individual request costs
- **THEN** the system SHALL use the sum of those entries as the authoritative cost for that session
