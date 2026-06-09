## ADDED Requirements

### Requirement: LLM summary generation
The system SHALL generate a natural-language summary (1-2 sentences) for each session by sending structured work content to a configured LLM provider (Anthropic or Ollama).

#### Scenario: Successful summary with Anthropic
- **WHEN** a session has non-empty `WorkContent` (at least one of: userIntents, toolCallSummary, bashCommands, moduleSummary, assistantSnippets, compactedSummary)
- **AND** the `ANTHROPIC_API_KEY` environment variable is set or `--llm anthropic` is specified
- **THEN** the system SHALL call the Anthropic Messages API (`/v1/messages`) with a prompt constructed from the session's structured data
- **AND** store the response in `WorkContent.llmSummary`

#### Scenario: Successful summary with Ollama
- **WHEN** Ollama is running at `http://localhost:11434` (or configured `--llm-base-url`)
- **AND** `--llm-model <name>` is specified (Ollama has no default model)
- **THEN** the system SHALL call the Ollama OpenAI-compatible API (`/v1/chat/completions`)
- **AND** store the response in `WorkContent.llmSummary`

#### Scenario: Ollama detected without model
- **WHEN** Ollama is auto-detected but no model is specified via `--llm-model` or `LLM_MODEL` env var
- **THEN** the system SHALL print a warning to stderr
- **AND** skip LLM summarization entirely

#### Scenario: Empty session skipped
- **WHEN** a session has an empty `WorkContent` (primaryIntent is "Untitled session" and all signal arrays are empty)
- **THEN** the system SHALL NOT make an API call
- **AND** `WorkContent.llmSummary` SHALL remain `null`

#### Scenario: No provider available
- **WHEN** no `ANTHROPIC_API_KEY` is set and Ollama is not running
- **THEN** the system SHALL skip all API calls
- **AND** all sessions SHALL have `llmSummary: null`
- **AND** reports SHALL use the heuristic `primaryIntent` as before

### Requirement: Prompt construction
The system SHALL construct a structured prompt that includes all available signals from `SessionWorkSummary` and `WorkContent`.

#### Scenario: Prompt includes all signals
- **WHEN** a session has userIntents, toolCallSummary, bashCommands, moduleSummary, and fileEdits
- **THEN** the constructed prompt SHALL include all of these as labeled sections
- **AND** the prompt SHALL instruct the model to produce a 1-2 sentence summary in the user's language

#### Scenario: Prompt with minimal data
- **WHEN** a session only has a `compactedSummary` and no other signals
- **THEN** the prompt SHALL include the compactedSummary
- **AND** still produce a valid summary request

### Requirement: CLI flags for LLM control
The system SHALL provide `--llm`, `--llm-model`, `--llm-base-url`, and `--no-llm` flags on `report work-daily` and `report work-weekly` commands.

#### Scenario: --no-llm disables LLM calls
- **WHEN** the user runs `report work-daily --no-llm`
- **THEN** no API calls SHALL be made
- **AND** reports SHALL use the heuristic `primaryIntent` exclusively

#### Scenario: Explicit provider selection
- **WHEN** the user runs `report work-daily --llm ollama --llm-model qwen3:8b`
- **THEN** the system SHALL use Ollama with the specified model
- **AND** skip auto-detection

#### Scenario: Auto-detection with Anthropic key
- **WHEN** the user runs `report work-daily` without `--llm` flags
- **AND** `ANTHROPIC_API_KEY` is set
- **THEN** the system SHALL use Anthropic with `claude-haiku-4-5-20251001`

#### Scenario: Auto-detection with Ollama
- **WHEN** the user runs `report work-daily` without `--llm` flags
- **AND** no Anthropic key is set
- **AND** Ollama is running with `LLM_MODEL` env var set
- **THEN** the system SHALL use Ollama with the specified model

### Requirement: Report integration
The report formatters SHALL prefer the LLM summary over the heuristic intent when available.

#### Scenario: LLM summary available
- **WHEN** a session has a non-null `llmSummary`
- **THEN** the report bullet point SHALL display `llmSummary` instead of `primaryIntent`

#### Scenario: LLM summary null (fallback)
- **WHEN** a session has `llmSummary: null`
- **THEN** the report bullet point SHALL display `primaryIntent` as before

### Requirement: Error recovery
The system SHALL handle API errors gracefully without failing the entire report.

#### Scenario: API returns error
- **WHEN** an API call fails (network error, 429, 500, etc.)
- **THEN** the system SHALL log a warning to stderr
- **AND** set `llmSummary: null` for that session
- **AND** continue processing remaining sessions

#### Scenario: Rate limit with retry
- **WHEN** the API returns HTTP 429
- **THEN** the system SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s)
- **AND** if all retries fail, treat as an error per the above scenario
