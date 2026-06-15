/**
 * Session report formatting — pure functions that turn analysis results
 * into Markdown strings for CLI output.
 */

import type {
  Phase,
  LintFinding,
  StandupReport,
  TimelineResult,
  PostmortemResult,
  SessionDiff,
  ContextScore,
  ContextGrade,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Session overview report (phases + lint + timeline)
// ---------------------------------------------------------------------------

/**
 * Format a comprehensive session report combining phases, lint findings,
 * and timeline summary into a single Markdown document.
 */
export function formatSessionReport(opts: {
  phases: Phase[];
  lintFindings: LintFinding[];
  timeline: TimelineResult;
  postmortem?: PostmortemResult;
}): string {
  const { phases, lintFindings, timeline } = opts;
  const lines: string[] = ["# Session Analysis Report", ""];

  // Phases section
  lines.push("## Phases", "");
  if (phases.length === 0) {
    lines.push("_No phases detected._", "");
  } else {
    for (const phase of phases) {
      const duration =
        phase.durationMs > 0
          ? ` (${(phase.durationMs / 1000).toFixed(1)}s)`
          : "";
      const cost =
        phase.costUSD > 0 ? ` — $${phase.costUSD.toFixed(4)}` : "";
      const tools =
        phase.toolCalls.length > 0
          ? ` [${phase.toolCalls.map((t) => t.toolName).join(", ")}]`
          : "";
      const errors =
        phase.errorCount > 0 ? ` ⚠ ${phase.errorCount} errors` : "";
      lines.push(
        `### Phase ${phase.index + 1}: ${phase.name}${duration}${cost}${tools}${errors}`,
      );
      if (phase.filesModified.length > 0) {
        lines.push(
          `Files: ${phase.filesModified.join(", ")}`,
        );
      }
      lines.push("");
    }
  }

  // Lint section
  lines.push("## Lint Findings", "");
  if (lintFindings.length === 0) {
    lines.push("✅ No issues detected.", "");
  } else {
    for (const finding of lintFindings) {
      const icon = finding.severity === "error" ? "❌" : "⚠️";
      lines.push(
        `${icon} **${finding.ruleId}** (${finding.severity}): ${finding.message}`,
      );
      lines.push("");
    }
  }

  // Timeline section
  lines.push("## Timeline", "");
  formatTimelineSummary(timeline, lines);

  // Postmortem section (optional)
  if (opts.postmortem) {
    lines.push("## Postmortem", "");
    formatPostmortemSection(opts.postmortem, lines);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Standalone format functions for individual CLI sub-commands
// ---------------------------------------------------------------------------

export function formatLintReport(findings: LintFinding[]): string {
  const lines: string[] = ["# Session Lint Report", ""];

  if (findings.length === 0) {
    lines.push("✅ No issues detected.", "");
    return lines.join("\n");
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  lines.push(`**${errors.length} errors, ${warnings.length} warnings**`, "");

  for (const finding of findings) {
    const icon = finding.severity === "error" ? "❌" : "⚠️";
    lines.push(
      `${icon} **${finding.ruleId}**: ${finding.message}`,
      `   Entries: ${finding.entries.join(", ")}`,
      "",
    );
  }

  return lines.join("\n");
}

export function formatStandupReport(report: StandupReport): string {
  const lines: string[] = ["# Standup Report", ""];

  if (report.approaches.length > 0) {
    lines.push("## Approaches", "");
    for (const approach of report.approaches) {
      const files = approach.filesModified.length > 0
        ? ` (${approach.filesModified.join(", ")})`
        : "";
      lines.push(`- ${approach.description}${files}`);
    }
    lines.push("");
  }

  if (report.abandoned.length > 0) {
    lines.push("## Abandoned", "");
    for (const approach of report.abandoned) {
      lines.push(`- ${approach.description}`);
    }
    lines.push("");
  }

  if (report.uncertainties.length > 0) {
    lines.push("## Uncertainties", "");
    for (const u of report.uncertainties) {
      lines.push(`- ${u.userMessage} (entry ${u.entryIndex + 1})`);
    }
    lines.push("");
  }

  if (report.reviewItems.length > 0) {
    lines.push("## Review Items", "");
    for (const item of report.reviewItems) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (report.newDependencies.length > 0) {
    lines.push("## New Dependencies", "");
    for (const dep of report.newDependencies) {
      lines.push(`- ${dep}`);
    }
    lines.push("");
  }

  if (report.contextResetCount > 0) {
    lines.push(`**Context resets:** ${report.contextResetCount}`, "");
  }

  return lines.join("\n");
}

export function formatDiffReport(diff: SessionDiff): string {
  const lines: string[] = ["# Session Diff", ""];

  // Phase alignment
  lines.push("## Phase Alignment", "");
  for (const alignment of diff.phaseAlignment) {
    const icon =
      alignment.status === "matched"
        ? "✅"
        : alignment.status === "inserted"
          ? "➕"
          : "➖";
    const name =
      alignment.status === "inserted"
        ? alignment.phaseB?.name ?? "?"
        : alignment.status === "deleted"
          ? alignment.phaseA?.name ?? "?"
          : alignment.phaseA?.name ?? "?";
    lines.push(`${icon} ${name} (${alignment.status})`);
  }
  lines.push("");

  // Metric deltas
  if (diff.metricDeltas.length > 0) {
    lines.push("## Metric Deltas", "");
    for (const delta of diff.metricDeltas) {
      lines.push(`**${delta.phaseName}**:`);
      if (delta.costDelta !== 0) {
        lines.push(`  Cost: ${delta.costDelta >= 0 ? "+" : ""}$${delta.costDelta.toFixed(4)}`);
      }
      if (delta.toolCallCountDelta !== 0) {
        lines.push(`  Tool calls: ${delta.toolCallCountDelta >= 0 ? "+" : ""}${delta.toolCallCountDelta}`);
      }
      if (delta.errorCountDelta !== 0) {
        lines.push(`  Errors: ${delta.errorCountDelta >= 0 ? "+" : ""}${delta.errorCountDelta}`);
      }
      if (delta.durationDeltaMs !== 0) {
        lines.push(`  Duration: ${delta.durationDeltaMs >= 0 ? "+" : ""}${(delta.durationDeltaMs / 1000).toFixed(1)}s`);
      }
      lines.push("");
    }
  }

  // Divergence points
  if (diff.divergencePoints.length > 0) {
    lines.push("## Divergences", "");
    for (const point of diff.divergencePoints) {
      lines.push(`⚠️ **${point.phaseName}** (${point.reason}): ${point.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatContextReport(score: ContextScore): string {
  const lines: string[] = ["# Context File Score", ""];

  const gradeIcon: Record<ContextGrade, string> = {
    A: "🟢",
    B: "🔵",
    C: "🟡",
    D: "🟠",
    F: "🔴",
  };

  lines.push(
    `**Grade: ${gradeIcon[score.grade]} ${score.grade}** (${score.overallScore}/100)`,
    "",
  );

  lines.push("## Dimensions", "");
  lines.push("| Dimension | Score |");
  lines.push("|-----------|-------|");
  lines.push(`| Completeness | ${score.dimensions.completeness} |`);
  lines.push(`| Specificity | ${score.dimensions.specificity} |`);
  lines.push(`| Consistency | ${score.dimensions.consistency} |`);
  lines.push(`| Recency | ${score.dimensions.recency} |`);
  lines.push("");

  if (score.detectedSections.length > 0) {
    lines.push("## Detected Sections", "");
    for (const section of score.detectedSections) {
      lines.push(`- ✅ ${section}`);
    }
    lines.push("");
  }

  if (score.missingSections.length > 0) {
    lines.push("## Missing Sections", "");
    for (const section of score.missingSections) {
      lines.push(`- ❌ ${section}`);
    }
    lines.push("");
  }

  lines.push(
    `**Session correlation:** ${score.sessionCorrelation}`,
    "",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatTimelineSummary(timeline: TimelineResult, lines: string[]): void {
  const { summary, phases } = timeline;

  lines.push(
    `**Tool calls:** ${summary.totalToolCalls} | **Duration:** ${(summary.totalDurationMs / 1000).toFixed(1)}s | **Cost:** $${summary.totalCost.toFixed(4)}`,
    "",
  );

  if (phases.length > 0) {
    lines.push("| Phase | Range | Tool calls | Errors | Cost |");
    lines.push("|-------|-------|------------|--------|------|");
    for (const phase of phases) {
      const range =
        phase.endIndex > phase.startIndex
          ? `${phase.startIndex + 1}–${phase.endIndex + 1}`
          : `${phase.startIndex + 1}`;
      lines.push(
        `| ${phase.name} | ${range} | ${phase.toolCallCount} | ${phase.errorCount} | $${phase.costUSD.toFixed(4)} |`,
      );
    }
    lines.push("");
  }

  if (summary.wastedSpendUSD > 0) {
    lines.push(`⚠️ **Wasted spend:** $${summary.wastedSpendUSD.toFixed(4)}`, "");
  }
}

function formatPostmortemSection(
  pm: PostmortemResult,
  lines: string[],
): void {
  if (pm.crashInfo) {
    const crash = pm.crashInfo;
    lines.push(
      `**Crash detected:** ${crash.type} at ${crash.timestamp}`,
      "",
    );
    if (crash.lastUserPrompt) {
      lines.push(`> Last prompt: ${crash.lastUserPrompt}`, "");
    }
  } else {
    lines.push("✅ Session completed normally.", "");
  }

  if (pm.rootCauseTimeline.length > 0) {
    lines.push("### Root Cause Timeline", "");
    for (const entry of pm.rootCauseTimeline) {
      const trigger = entry.isTrigger ? " 🔥" : "";
      lines.push(`- [${entry.entryIndex + 1}] ${entry.annotation}${trigger}`);
    }
    lines.push("");
  }

  if (pm.agentsMdViolations.length > 0) {
    lines.push("### CLAUDE.md Violations", "");
    for (const violation of pm.agentsMdViolations) {
      lines.push(`- **${violation.rule}**: ${violation.description}`);
    }
    lines.push("");
  }

  if (pm.recoverySuggestions.length > 0) {
    lines.push("### Recovery Suggestions", "");
    for (const suggestion of pm.recoverySuggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push("");
  }
}
