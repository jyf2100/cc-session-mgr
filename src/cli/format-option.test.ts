import { describe, it, expect } from "vitest";
import { Command, type OptionValues } from "commander";
import { renderHtml, renderJson, renderCsv } from "../export/index.js";
import type { SessionWorkSummary } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers — mirrors of the private CLI functions
// ---------------------------------------------------------------------------

type OutputFormat = "md" | "html" | "json" | "csv";

function resolveFormat(opts: OptionValues): OutputFormat {
  const f = (opts.format as string) ?? "md";
  if (f === "html" || f === "json" || f === "csv") return f;
  return "md";
}

function applyFormat(
  markdown: string,
  format: OutputFormat,
  sessions?: SessionWorkSummary[],
): string {
  switch (format) {
    case "html":
      return renderHtml(markdown);
    case "json":
      return renderJson(sessions ?? { markdown });
    case "csv":
      return sessions ? renderCsv(sessions) : markdown;
    default:
      return markdown;
  }
}

function makeSession(overrides?: Partial<SessionWorkSummary>): SessionWorkSummary {
  return {
    sessionId: "s1",
    projectPath: "/proj/test",
    encodedDir: "-proj-test",
    startTime: "2026-06-09T10:00:00Z",
    endTime: "2026-06-09T11:00:00Z",
    messageCounts: { user: 5, assistant: 5, system: 0, other: 0 },
    cost: {
      totalUSD: 0.5,
      source: "inline",
      incomplete: false,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      isEstimated: false,
    },
    models: ["claude-sonnet-4-6"],
    fileEdits: [{ filePath: "src/a.ts", editCount: 2 }],
    isCompacted: false,
    hasCustomTitle: false,
    customTitle: null,
    workContent: {
      primaryIntent: "Test intent",
      userIntents: [],
      toolCallSummary: {},
      bashCommands: [],
      moduleSummary: [],
      assistantSnippets: [],
      compactedSummary: null,
      llmSummary: null,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveFormat
// ---------------------------------------------------------------------------

describe("resolveFormat", () => {
  it("defaults to md when no format specified", () => {
    expect(resolveFormat({})).toBe("md");
  });

  it("defaults to md for unrecognized format", () => {
    expect(resolveFormat({ format: "pdf" })).toBe("md");
  });

  it("resolves html", () => {
    expect(resolveFormat({ format: "html" })).toBe("html");
  });

  it("resolves json", () => {
    expect(resolveFormat({ format: "json" })).toBe("json");
  });

  it("resolves csv", () => {
    expect(resolveFormat({ format: "csv" })).toBe("csv");
  });
});

// ---------------------------------------------------------------------------
// applyFormat
// ---------------------------------------------------------------------------

describe("applyFormat", () => {
  const md = "# Report\n\nHello **world**.\n";
  const sessions = [makeSession()];

  it("passes markdown through for md format", () => {
    expect(applyFormat(md, "md")).toBe(md);
  });

  it("converts to HTML for html format", () => {
    const result = applyFormat(md, "html");
    expect(result).toContain("<h1>");
    expect(result).toContain("Hello");
  });

  it("serializes sessions as JSON for json format with sessions", () => {
    const result = applyFormat(md, "json", sessions);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].sessionId).toBe("s1");
  });

  it("serializes fallback object as JSON for json format without sessions", () => {
    const result = applyFormat(md, "json");
    const parsed = JSON.parse(result);
    expect(parsed.markdown).toBe(md);
  });

  it("renders CSV for csv format with sessions", () => {
    const result = applyFormat(md, "csv", sessions);
    expect(result).toContain("sessionId");
    expect(result).toContain("s1");
  });

  it("passes markdown through for csv format without sessions", () => {
    expect(applyFormat(md, "csv")).toBe(md);
  });
});

// ---------------------------------------------------------------------------
// CLI --format option parsing
// ---------------------------------------------------------------------------

describe("--format option parsing", () => {
  it("parses --format html on work-daily", async () => {
    const cmd = new Command();
    cmd.exitOverride();

    let capturedFormat: string | undefined;

    cmd
      .command("work-daily")
      .option("--format <fmt>", "Output format")
      .action((opts) => {
        capturedFormat = opts.format;
      });

    await cmd.parseAsync(["node", "test", "work-daily", "--format", "html"]);
    expect(capturedFormat).toBe("html");
  });

  it("parses --format csv on insights", async () => {
    const cmd = new Command();
    cmd.exitOverride();

    let capturedFormat: string | undefined;

    cmd
      .command("insights")
      .option("--format <fmt>", "Output format")
      .action((opts) => {
        capturedFormat = opts.format;
      });

    await cmd.parseAsync(["node", "test", "insights", "--format", "csv"]);
    expect(capturedFormat).toBe("csv");
  });

  it("format defaults to undefined when not provided", async () => {
    const cmd = new Command();
    cmd.exitOverride();

    let capturedFormat: string | undefined;

    cmd
      .command("work-weekly")
      .option("--format <fmt>", "Output format")
      .action((opts) => {
        capturedFormat = opts.format;
      });

    await cmd.parseAsync(["node", "test", "work-weekly"]);
    expect(capturedFormat).toBeUndefined();
  });

  it("parses --format json on work-monthly", async () => {
    const cmd = new Command();
    cmd.exitOverride();

    let capturedFormat: string | undefined;

    cmd
      .command("work-monthly")
      .option("--format <fmt>", "Output format")
      .action((opts) => {
        capturedFormat = opts.format;
      });

    await cmd.parseAsync(["node", "test", "work-monthly", "--format", "json"]);
    expect(capturedFormat).toBe("json");
  });

  it("parses --format html on work-quarterly", async () => {
    const cmd = new Command();
    cmd.exitOverride();

    let capturedFormat: string | undefined;

    cmd
      .command("work-quarterly")
      .option("--format <fmt>", "Output format")
      .action((opts) => {
        capturedFormat = opts.format;
      });

    await cmd.parseAsync(["node", "test", "work-quarterly", "--format", "html"]);
    expect(capturedFormat).toBe("html");
  });
});
