## Context

The cc-session-mgr pipeline currently extracts work content signals heuristically via `extractWorkContent()`. This function collects user messages, tool calls, bash commands, module paths, and assistant snippets from JSONL entries. However, the resulting `primaryIntent` field often shows slash commands, skill names, or generic text that does not describe what was accomplished.

The existing pipeline is strictly four-stage: `parser → aggregator → report → cli`. Data flows unidirectionally. The `summarize` layer will slot between aggregator and report as an optional enhancement.

## Goals / Non-Goals

**Goals:**
- Generate a 1-2 sentence natural-language summary per session describing what was accomplished
- Support both Anthropic (Claude) and Ollama as LLM providers via a thin adapter interface
- Preserve existing heuristic output as the fallback when `--no-llm` is set or no provider is available
- Keep the summarize layer isolated — no changes to parser or aggregator

**Non-Goals:**
- Summarizing across sessions (one API call per session, not per day)
- Caching or persisting LLM summaries (re-run each time)
- Streaming or interactive summarization
- Modifying the existing heuristic extraction logic

## Decisions

### 1. Direct fetch over SDK

**Decision**: Use Node.js built-in `fetch` to call LLM APIs directly via a provider adapter interface.

**Rationale**: The project has zero runtime dependencies today (only devDependencies). The API surface needed is minimal (one endpoint, no streaming, no tool use). A provider adapter pattern (`LlmProvider` interface with `buildRequest`/`parseResponse`) supports both Anthropic (`/v1/messages`) and Ollama (`/v1/chat/completions`) without any SDK dependency.

**Alternative considered**: `@anthropic-ai/sdk` and `openai` SDK — provide type safety but add ~200KB+ of production dependencies for single-endpoint calls.

### 2. Batch per day, sequential within

**Decision**: When generating a daily report, call the API once per session sequentially (no parallelism).

**Rationale**: A typical day has 5-20 sessions. Sequential calls avoid rate-limit issues and keep the implementation simple. The CLI is not latency-sensitive.

**Alternative considered**: Parallel calls with `Promise.all` and rate-limit handling — adds complexity for marginal speed gain in a CLI tool.

### 3. Prompt as a pure function

**Decision**: Extract prompt construction into `src/summarize/prompt.ts` as a pure function `(session: SessionWorkSummary) => string`.

**Rationale**: Makes the prompt testable without mocking the API. The prompt can be unit-tested by asserting the output contains expected signals.

### 4. `llmSummary` field on `WorkContent`

**Decision**: Add `llmSummary: string | null` to the existing `WorkContent` interface, defaulting to `null`.

**Rationale**: The report layer already reads from `WorkContent`. Adding the field there means report formatters check one place: `llmSummary ?? primaryIntent`. No new data structure needed.

### 5. Multi-provider with auto-detection

**Decision**: Support Anthropic and Ollama via a `LlmProvider` adapter. Auto-detect by checking `ANTHROPIC_API_KEY` first, then probing `http://localhost:11434/api/tags` for Ollama.

**Rationale**: Anthropic requires an API key and costs money. Ollama runs locally for free. Auto-detection lets the tool "just work" with either provider without manual configuration. Ollama has no default model — users must specify `--llm-model` to avoid accidentally using an unsuitable model.

**Alternative considered**: Only supporting Anthropic — limits usability for offline/air-gapped environments.

## Risks / Trade-offs

- **API cost**: Each session costs ~200-500 input tokens + ~100 output tokens (Haiku). A 20-session day costs ~$0.005 on Haiku. → Mitigation: default to `claude-haiku-4-5-20251001` model, document cost.
- **Latency**: Sequential API calls add ~1-2s per session. A 20-session day takes ~20-40s. → Mitigation: acceptable for a CLI report tool; show progress indicator.
- **Rate limits**: Anthropic free tier has low rate limits. → Mitigation: add basic retry with exponential backoff (max 3 retries).
- **Network dependency**: The tool currently works fully offline. → Mitigation: `--no-llm` flag and automatic fallback when API key is absent or network fails.
