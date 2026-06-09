## ADDED Requirements

### Requirement: Extract user intent from session entries
The system SHALL extract the primary user intent from each session by reading the first user message's text content. If no user text is available, the system SHALL fall back to the `customTitle` field.

#### Scenario: Session with user messages
- **WHEN** a session JSONL contains entries of type `user` with text content
- **THEN** the system extracts the text of the first user message, truncated to 200 characters, as `primaryIntent`

#### Scenario: Session with no user messages but custom title
- **WHEN** a session has no user message entries but has a `customTitle`
- **THEN** the system uses `customTitle` as `primaryIntent`

#### Scenario: Session with neither user messages nor title
- **WHEN** a session has no user messages and no `customTitle`
- **THEN** the system sets `primaryIntent` to `"Untitled session"`

### Requirement: Extract tool call summary
The system SHALL extract all tool call names and their inputs from assistant message content blocks of type `tool_use`. The system SHALL group tool calls by name and count occurrences.

#### Scenario: Session with multiple tool calls
- **WHEN** a session's assistant entries contain `tool_use` blocks with names like `Bash`, `Write`, `Edit`, `Read`, `Grep`
- **THEN** the system produces a `toolCallSummary` map of tool name to occurrence count (e.g., `{ "Bash": 12, "Write": 5, "Edit": 3 }`)

#### Scenario: Session with no tool calls
- **WHEN** a session's assistant entries contain no `tool_use` blocks
- **THEN** the system produces an empty `toolCallSummary`

### Requirement: Extract Bash command list
The system SHALL extract Bash command strings from `tool_use` blocks where the name is `Bash`. The system SHALL deduplicate consecutive identical commands and cap the list at 20 entries.

#### Scenario: Session with Bash tool calls
- **WHEN** assistant entries contain `tool_use` blocks with name `Bash` and `input.command` field
- **THEN** the system extracts each command string, removes consecutive duplicates, and stores up to 20 unique commands in `bashCommands`

#### Scenario: Long-running session with many commands
- **WHEN** a session has more than 20 unique Bash commands
- **THEN** the system keeps the first 20 and stops extracting further

### Requirement: Extract file edit narrative
The system SHALL group file edit paths by their top-level directory (or `src/` subdirectory if under `src/`) to produce a human-readable description of which modules were worked on.

#### Scenario: Edits across multiple modules
- **WHEN** a session has file edits to `src/parser/parse-jsonl.ts`, `src/parser/extract-metadata.ts`, `src/report/daily.ts`
- **THEN** the system produces `moduleSummary` as `["parser (2 files)", "report (1 file)"]`

#### Scenario: All edits in root directory
- **WHEN** a session has file edits to `package.json`, `README.md`
- **THEN** the system produces `moduleSummary` as `["root (2 files)"]`

### Requirement: Extract assistant text snippets
The system SHALL extract brief text snippets from assistant message content blocks of type `text`, limited to the first 5 snippets per session, each truncated to 150 characters.

#### Scenario: Session with assistant text responses
- **WHEN** assistant entries contain `text` content blocks
- **THEN** the system extracts up to 5 text snippets, each truncated to 150 characters, stored in `assistantSnippets`

#### Scenario: Session with no assistant text
- **WHEN** assistant entries contain only `tool_use` blocks and no `text` blocks
- **THEN** the system produces an empty `assistantSnippets` array

### Requirement: Handle compacted sessions
The system SHALL detect compacted sessions (via `isCompacted` or `compact_boundary` entries) and fall back to `summary` entry content when available.

#### Scenario: Compacted session with summary entry
- **WHEN** a session is compacted and contains entries of type `summary` with text content
- **THEN** the system extracts the summary text as `compactedSummary`, truncated to 500 characters

#### Scenario: Compacted session without summary
- **WHEN** a session is compacted but has no `summary` entries
- **THEN** the system sets `compactedSummary` to `null` and extraction proceeds with available data

### Requirement: Produce WorkContent per session
The system SHALL combine all extracted signals into a single `WorkContent` object per session, with fields: `primaryIntent`, `toolCallSummary`, `bashCommands`, `moduleSummary`, `assistantSnippets`, `compactedSummary`.

#### Scenario: Full extraction
- **WHEN** `extractWorkContent` is called with a valid `JsonlEntry[]`
- **THEN** it returns a `WorkContent` object with all fields populated according to the above requirements

#### Scenario: Empty entries array
- **WHEN** `extractWorkContent` is called with an empty array
- **THEN** it returns a `WorkContent` with default empty values (`primaryIntent: "Untitled session"`, empty arrays and maps)
