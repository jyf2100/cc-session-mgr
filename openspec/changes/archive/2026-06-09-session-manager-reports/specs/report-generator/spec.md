## ADDED Requirements

### Requirement: Generate daily report
The system SHALL generate a Markdown daily report showing all session activity for a given date.

#### Scenario: Daily report with multiple sessions
- **WHEN** a date with 4 sessions across 2 projects is provided
- **THEN** the system SHALL output a Markdown report with: date header, per-project breakdown (session count, cost, file edits), and total summary

#### Scenario: Daily report with no activity
- **WHEN** a date has no sessions
- **THEN** the system SHALL output a report stating "No sessions found for YYYY-MM-DD"

### Requirement: Generate weekly report
The system SHALL generate a Markdown weekly report showing aggregated activity for a given ISO week.

#### Scenario: Weekly report with trend comparison
- **WHEN** a week with activity is provided
- **THEN** the system SHALL output a Markdown report with: week range header, daily breakdown table (date, sessions, cost, messages), project ranking, model usage breakdown, and total summary

#### Scenario: Weekly report shows day-by-day table
- **WHEN** the weekly report is generated
- **THEN** the report SHALL include a table with one row per day showing: date, session count, total messages, total cost

### Requirement: Generate project analysis report
The system SHALL generate a Markdown project analysis report showing the history and patterns of a specific project.

#### Scenario: Project report with history
- **WHEN** a project path is provided
- **THEN** the system SHALL output a Markdown report with: project name header, total sessions count, date range of activity, cost summary, most-used model, top edited files, and recent session summaries (last 5)

#### Scenario: Project not found
- **WHEN** no sessions exist for the given project path
- **THEN** the system SHALL output an error message listing available project names

### Requirement: Report format standards
All reports SHALL follow a consistent Markdown format with specific sections.

#### Scenario: Consistent header structure
- **WHEN** any report is generated
- **THEN** the report SHALL start with an H1 title containing the report type and date/week/project, followed by a summary table, followed by detailed sections

#### Scenario: Cost formatting
- **WHEN** costs are displayed in any report
- **THEN** the system SHALL format costs as `$X.XX` with exactly 2 decimal places

### Requirement: Output to file or stdout
The system SHALL support writing report output to a specified file path or to stdout.

#### Scenario: Output to stdout
- **WHEN** no output file is specified
- **THEN** the system SHALL write the Markdown report to stdout

#### Scenario: Output to file
- **WHEN** an `--output` flag with a file path is provided
- **THEN** the system SHALL write the Markdown report to that file path
