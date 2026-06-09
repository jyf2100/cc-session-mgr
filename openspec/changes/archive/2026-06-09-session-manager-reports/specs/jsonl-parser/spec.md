## ADDED Requirements

### Requirement: Parse JSONL transcript files
The system SHALL parse Claude Code JSONL transcript files from `~/.claude/projects/<encoded-path>/<session-uuid>.jsonl`, processing each line as an independent JSON object.

#### Scenario: Parse valid JSONL file
- **WHEN** a valid JSONL file path is provided
- **THEN** the system SHALL return an array of parsed transcript entries, one per non-empty line

#### Scenario: Skip malformed lines
- **WHEN** a JSONL file contains malformed or truncated JSON lines
- **THEN** the system SHALL skip invalid lines without failing and log a warning with the line number

### Requirement: Extract session metadata
The system SHALL extract session-level metadata from each JSONL file, including session ID, project path (cwd), timestamps, version, and permission mode.

#### Scenario: Extract from first valid entries
- **WHEN** a JSONL file is parsed
- **THEN** the system SHALL read the first `user` or `assistant` entry to extract `sessionId`, `cwd`, and `timestamp` fields

#### Scenario: Handle missing metadata gracefully
- **WHEN** a JSONL file has no entries with `cwd` or `sessionId`
- **THEN** the system SHALL use the filename as fallback session ID and mark project path as unknown

### Requirement: Extract message statistics
The system SHALL count user messages, assistant messages, tool calls, and identify the model used from each session transcript.

#### Scenario: Count message types
- **WHEN** a JSONL file is fully parsed
- **THEN** the system SHALL report counts for each entry type (`user`, `assistant`, `system`, etc.)

#### Scenario: Identify model from assistant entries
- **WHEN** assistant entries contain a `model` field
- **THEN** the system SHALL extract and report the model identifier

### Requirement: Stream-based parsing for large files
The system SHALL use streaming (readline) to parse JSONL files without loading the entire file into memory.

#### Scenario: Parse 50MB file
- **WHEN** a JSONL file larger than 50MB is parsed
- **THEN** the system SHALL complete parsing without exceeding 200MB of heap memory

### Requirement: Extract cost data from entries
The system SHALL extract `costUSD` fields from assistant entries and aggregate per-session cost.

#### Scenario: Sum costs across session
- **WHEN** a session contains 10 assistant entries each with `costUSD` of 0.01
- **THEN** the system SHALL report total session cost as 0.10

#### Scenario: Handle missing cost data
- **WHEN** assistant entries lack `costUSD` field
- **THEN** the system SHALL report cost as 0 and mark the session as having incomplete cost data

### Requirement: Parse project directory structure
The system SHALL scan `~/.claude/projects/` to discover all project directories and their session JSONL files.

#### Scenario: Discover all projects
- **WHEN** the system scans `~/.claude/projects/`
- **THEN** it SHALL return a list of encoded project paths, each with its set of JSONL files

### Requirement: Decode project paths
The system SHALL decode encoded project directory names back to approximate filesystem paths using a three-layer strategy: session metadata lookup, JSONL cwd scan, and naive decode fallback.

#### Scenario: Decode via session metadata
- **WHEN** `~/.claude/sessions/*.json` files exist with `cwd` fields
- **THEN** the system SHALL map encoded directory names to real paths using those cwd values
