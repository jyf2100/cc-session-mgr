## ADDED Requirements

### Requirement: CLI entry point with subcommands
The system SHALL provide a `session-mgr` CLI tool with `report` as the primary command group, supporting `daily`, `weekly`, and `project` subcommands.

#### Scenario: Show help
- **WHEN** `session-mgr --help` is run
- **THEN** the system SHALL display usage information listing all subcommands and global options

#### Scenario: Show version
- **WHEN** `session-mgr --version` is run
- **THEN** the system SHALL display the current version number

### Requirement: Daily report command
The system SHALL support `session-mgr report daily [date]` to generate a daily report.

#### Scenario: Report for today
- **WHEN** `session-mgr report daily` is run without a date argument
- **THEN** the system SHALL generate a report for the current date

#### Scenario: Report for specific date
- **WHEN** `session-mgr report daily 2026-06-08` is run
- **THEN** the system SHALL generate a report for June 8, 2026

### Requirement: Weekly report command
The system SHALL support `session-mgr report weekly [week]` to generate a weekly report.

#### Scenario: Report for current week
- **WHEN** `session-mgr report weekly` is run without a week argument
- **THEN** the system SHALL generate a report for the current ISO week

#### Scenario: Report for specific week
- **WHEN** `session-mgr report weekly 2026-W23` is run
- **THEN** the system SHALL generate a report for ISO week 23 of 2026

### Requirement: Project analysis command
The system SHALL support `session-mgr report project <name>` to generate a project analysis report.

#### Scenario: Report by project name substring
- **WHEN** `session-mgr report project my-app` is run
- **THEN** the system SHALL fuzzy-match project directories containing "my-app" and generate the report

#### Scenario: List available projects
- **WHEN** `session-mgr report project --list` is run
- **THEN** the system SHALL display all discovered project names with session counts

### Requirement: Global output option
All report commands SHALL support an `--output <path>` option to write the report to a file instead of stdout.

#### Scenario: Redirect to file
- **WHEN** `session-mgr report daily --output report.md` is run
- **THEN** the system SHALL write the daily report to `report.md` and print "Report written to report.md"

### Requirement: Configurable Claude config directory
The system SHALL support a `--claude-dir <path>` option to specify an alternative Claude Code config directory (defaulting to `~/.claude`).

#### Scenario: Custom config directory
- **WHEN** `session-mgr report daily --claude-dir /tmp/claude-test` is run
- **THEN** the system SHALL read session data from `/tmp/claude-test/projects/` instead of `~/.claude/projects/`
