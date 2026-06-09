# cc-session-mgr

A read-only CLI tool that analyzes Claude Code session data from `~/.claude/` and generates daily reports, weekly reports, and project analysis reports in Markdown format.

## Features

- **Daily Report** — All session activity for a given date, broken down by project
- **Weekly Report** — Day-by-day table with project ranking and model usage
- **Project Report** — Full project history: cost, top files, model distribution, recent sessions
- **Read-only** — Never modifies Claude Code files
- **Dual cost source** — Merges inline `costUSD` with `~/.claude/metrics/costs.jsonl` when available

## Installation

```bash
# Clone and build
git clone <repo-url> cc-session-mgr
cd cc-session-mgr
npm install
npm run build

# Use globally (optional)
npm link
```

## Usage

### Daily Report

```bash
# Today's report (stdout)
session-mgr report daily

# Specific date
session-mgr report daily 2026-06-09

# Write to file
session-mgr --output daily-report.md report daily 2026-06-09
```

### Weekly Report

```bash
# Current week
session-mgr report weekly

# Specific week (ISO week format)
session-mgr report weekly 2026-W23
```

### Project Report

```bash
# Match by project name/path substring
session-mgr report project cc-session-mgr
```

### Global Options

| Option | Description |
|--------|-------------|
| `--claude-dir <path>` | Path to `~/.claude` directory (default: auto-detected) |
| `--output <path>` | Write report to file instead of stdout |
| `--version` | Show version |
| `--help` | Show help |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm run test

# Type check
npm run lint
```

## Architecture

```
src/
├── types/index.ts         # TypeScript interfaces
├── parser/                # Phase 1: Parse JSONL files
│   ├── parse-jsonl.ts     # Streaming JSONL reader
│   ├── extract-metadata.ts
│   ├── extract-message-stats.ts
│   ├── extract-cost.ts
│   ├── scan-projects.ts   # Discover project dirs
│   └── decode-paths.ts    # 3-layer path decoding
├── aggregator/            # Phase 2: Aggregate summaries
│   ├── build-summaries.ts # Orchestrate parse phase
│   ├── by-date.ts         # Group by date
│   ├── by-week.ts         # Group by ISO week
│   ├── by-project.ts      # Group by project
│   ├── merge-cost.ts      # Merge costs.jsonl
│   └── file-edits.ts      # Extract file edit summary
├── report/                # Phase 3: Generate Markdown
│   ├── daily.ts
│   ├── weekly.ts
│   ├── project-report.ts
│   ├── format.ts          # Cost formatting
│   └── output.ts          # File/stdout writer
└── cli/                   # Phase 4: CLI entry point
    ├── index.ts           # Commander-based CLI
    └── helpers.ts         # Shared utilities
```

## License

MIT
