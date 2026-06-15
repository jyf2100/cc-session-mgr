import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scoreContext } from "./context.js";
import type { SessionSummary } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

function testFile(name: string): string {
  return join(testDir, name);
}

function makeSummary(overrides?: Partial<SessionSummary>): SessionSummary {
  return {
    sessionId: "test-session",
    projectPath: "/test/project",
    encodedDir: "-test-project",
    startTime: "2026-06-12T10:00:00Z",
    endTime: "2026-06-12T11:00:00Z",
    messageCounts: { user: 5, assistant: 5, tool_use: 3 },
    cost: { totalUSD: 0.5, source: "inline", incomplete: false, inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, isEstimated: false },
    models: ["claude-sonnet-4-6"],
    fileEdits: [{ filePath: "src/app.ts", editCount: 2 }],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scoreContext", () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `ctx-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns null for non-existent file", () => {
    const result = scoreContext(testFile("no-such-file.md"));
    expect(result).toBeNull();
  });

  it("returns grade F for empty file", () => {
    const path = testFile("empty.md");
    writeFileSync(path, "");
    const result = scoreContext(path);
    expect(result).not.toBeNull();
    expect(result!.grade).toBe("F");
    expect(result!.overallScore).toBe(0);
    expect(result!.dimensions.completeness).toBe(0);
    expect(result!.detectedSections).toEqual([]);
  });

  it("returns grade F for minimal file (< 50 chars)", () => {
    const path = testFile("minimal.md");
    writeFileSync(path, "This is too short to be useful.");
    const result = scoreContext(path);
    expect(result).not.toBeNull();
    expect(result!.grade).toBe("F");
  });

  it("scores a well-structured file highly (grade A or B)", () => {
    const path = testFile("claude.md");
    writeFileSync(
      path,
      `# Project Guide

## Build commands
Run \`npm run build\` to compile. Use \`npm run test\` for tests.

## Architecture overview
The project follows a pipeline architecture with parser, aggregator, report, and cli stages.

## Coding conventions
- Use TypeScript strict mode
- Follow lint rules from .eslintrc
- Format with prettier

## Project constraints
- Must never modify files in ~/.claude/
- Always validate input at system boundaries
- Never hardcode API keys

## Common pitfalls
- Known issue: the parser skips malformed JSONL lines
- Warning: don't forget to add .js extensions to imports

\`\`\`typescript
const src = "src/index.ts";
const output = build(src);
\`\`\`
`,
    );
    const result = scoreContext(path);
    expect(result).not.toBeNull();
    expect(result!.grade).toMatch(/^[AB]$/);
    expect(result!.overallScore).toBeGreaterThanOrEqual(65);
    expect(result!.dimensions.completeness).toBeGreaterThanOrEqual(80);
    expect(result!.dimensions.specificity).toBeGreaterThan(30);
  });

  it("detects expected sections", () => {
    const path = testFile("sections.md");
    writeFileSync(
      path,
      `## Build commands\nnpm run build\n\n## Architecture overview\nPipeline design\n\n## Coding conventions\nUse strict TS\n\n## Project constraints\nMust validate\n\n## Common pitfalls\nKnown issue here`,
    );
    const result = scoreContext(path);
    expect(result).not.toBeNull();
    expect(result!.detectedSections).toContain("Build commands");
    expect(result!.detectedSections).toContain("Architecture overview");
    expect(result!.detectedSections).toContain("Coding conventions");
    expect(result!.detectedSections).toContain("Project constraints");
    expect(result!.detectedSections).toContain("Common pitfalls");
    expect(result!.missingSections).toEqual([]);
  });

  it("reports missing sections for thin content", () => {
    const path = testFile("thin.md");
    writeFileSync(path, "Just some random text that is long enough to pass the minimum threshold check but lacks any structure or expected sections.");
    const result = scoreContext(path);
    expect(result).not.toBeNull();
    expect(result!.missingSections.length).toBeGreaterThan(0);
    expect(result!.detectedSections.length).toBeLessThan(5);
  });

  it("computes session correlation as unknown when no sessions provided", () => {
    const path = testFile("test.md");
    writeFileSync(path, "Build: npm run build. Architecture: pipeline design. Constraints: must validate.");
    const result = scoreContext(path);
    expect(result).not.toBeNull();
    expect(result!.sessionCorrelation).toBe("unknown");
  });

  it("computes positive session correlation for productive sessions", () => {
    const path = testFile("test.md");
    writeFileSync(path, "Build: npm run build. Architecture: pipeline design. Constraints: must validate.");
    const sessions = [
      makeSummary(),
      makeSummary(),
      makeSummary(),
    ];
    const result = scoreContext(path, sessions);
    expect(result).not.toBeNull();
    expect(result!.sessionCorrelation).toBe("positive");
  });

  it("computes negative session correlation for costly sessions with no output", () => {
    const path = testFile("test.md");
    writeFileSync(path, "Build: npm run build. Architecture: pipeline design. Constraints: must validate.");
    const sessions = [
      makeSummary({ fileEdits: [], cost: { totalUSD: 5.0, source: "inline", incomplete: false, inputTokens: 10000, outputTokens: 5000, cacheReadTokens: 0, isEstimated: false } }),
      makeSummary({ fileEdits: [], cost: { totalUSD: 3.0, source: "inline", incomplete: false, inputTokens: 8000, outputTokens: 4000, cacheReadTokens: 0, isEstimated: false } }),
      makeSummary({ fileEdits: [], cost: { totalUSD: 4.0, source: "inline", incomplete: false, inputTokens: 9000, outputTokens: 4500, cacheReadTokens: 0, isEstimated: false } }),
    ];
    const result = scoreContext(path, sessions);
    expect(result).not.toBeNull();
    expect(result!.sessionCorrelation).toBe("negative");
  });

  it("includes all four scoring dimensions", () => {
    const path = testFile("dims.md");
    writeFileSync(path, "Build commands: npm run build. Architecture: pipeline. Coding conventions: strict TS. Constraints: must validate. Pitfalls: known issue.");
    const result = scoreContext(path);
    expect(result).not.toBeNull();
    expect(result!.dimensions).toHaveProperty("completeness");
    expect(result!.dimensions).toHaveProperty("specificity");
    expect(result!.dimensions).toHaveProperty("consistency");
    expect(result!.dimensions).toHaveProperty("recency");
    // All dimensions should be 0-100
    for (const val of Object.values(result!.dimensions)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });
});
