## ADDED Requirements

### Requirement: Generate daily work report
The system SHALL generate a Markdown daily work report from `WorkDailyData` that describes what work was accomplished, organized by project.

#### Scenario: Day with multiple projects
- **WHEN** a daily work report is generated for a date with sessions across 3 projects
- **THEN** the report contains a header with the date, a summary section listing each project name, and per-project sections with accomplishment bullets derived from session titles and module summaries

#### Scenario: Day with no sessions
- **WHEN** a daily work report is generated for a date with no sessions
- **THEN** the report outputs a single line: "No work sessions found for YYYY-MM-DD."

#### Scenario: Day with one project
- **WHEN** a daily work report is generated for a date with sessions in one project
- **THEN** the report lists all sessions under a single project section with their intents and module summaries

### Requirement: Generate weekly work report
The system SHALL generate a Markdown weekly work report from `WorkWeeklyData` that provides a day-by-day breakdown of accomplishments.

#### Scenario: Week with activity across multiple days
- **WHEN** a weekly work report is generated for a week with sessions on Monday, Wednesday, and Friday
- **THEN** the report contains a header with the week identifier, a summary section, and per-day sections each listing projects and accomplishments

#### Scenario: Week with no sessions
- **WHEN** a weekly work report is generated for a week with no sessions
- **THEN** the report outputs a single line: "No work sessions found for week YYYY-WNN."

### Requirement: Per-project accomplishment bullets
The system SHALL derive accomplishment bullets for each project section from session-level data: `primaryIntent`, `moduleSummary`, and `bashCommands`.

#### Scenario: Session with clear intent and module edits
- **WHEN** a session has `primaryIntent` "Add web UI for session browsing" and `moduleSummary` ["web (3 files)", "parser (1 file)"]
- **THEN** the system generates a bullet: "Add web UI for session browsing — worked on web (3 files), parser (1 file)"

#### Scenario: Session with only title
- **WHEN** a session has only `primaryIntent` and no module edits
- **THEN** the system generates a bullet with just the intent text

#### Scenario: Multiple sessions in same project
- **WHEN** a project has 3 sessions on the same day
- **THEN** the system generates one bullet per session under that project section

### Requirement: Aggregate work content by date
The system SHALL accept `SessionWorkSummary[]` and group them by calendar date (YYYY-MM-DD derived from `startTime`), producing `WorkDailyData` for each date.

#### Scenario: Sessions spanning multiple dates
- **WHEN** 5 sessions span 2026-06-07 through 2026-06-09
- **THEN** the aggregator produces 3 `WorkDailyData` objects, one per date, each containing the sessions for that date

#### Scenario: All sessions on one date
- **WHEN** all sessions have the same `startTime` date
- **THEN** the aggregator produces a single `WorkDailyData`

### Requirement: Aggregate work content by week
The system SHALL group `WorkDailyData` into ISO weeks, producing `WorkWeeklyData` with nested daily data.

#### Scenario: Daily data spanning ISO week boundary
- **WHEN** daily data exists for 2026-06-07 (Saturday) and 2026-06-08 (Sunday) across different ISO weeks
- **THEN** the aggregator produces separate `WorkWeeklyData` for each week

#### Scenario: All daily data within one ISO week
- **WHEN** all daily data falls within the same ISO week
- **THEN** the aggregator produces a single `WorkWeeklyData`

### Requirement: CLI work-daily command
The system SHALL register a `work-daily` subcommand under the `report` command that accepts an optional date argument (defaults to today) and outputs a daily work report.

#### Scenario: No date argument
- **WHEN** the user runs `report work-daily` without arguments
- **THEN** the system generates a work report for today's date

#### Scenario: Explicit date argument
- **WHEN** the user runs `report work-daily 2026-06-09`
- **THEN** the system generates a work report for 2026-06-09

### Requirement: CLI work-weekly command
The system SHALL register a `work-weekly` subcommand under the `report` command that accepts an optional week argument (defaults to current week) and outputs a weekly work report.

#### Scenario: No week argument
- **WHEN** the user runs `report work-weekly` without arguments
- **THEN** the system generates a work report for the current ISO week

#### Scenario: Explicit week argument
- **WHEN** the user runs `report work-weekly 2026-W23`
- **THEN** the system generates a work report for ISO week 23 of 2026
