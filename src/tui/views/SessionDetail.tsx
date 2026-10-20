import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useTuiStore } from "../store.js";
import { getActiveTheme } from "../theme.js";
import { formatCost, formatTokenCount } from "../../report/format.js";

const SEP = "────────────────────────────────────────";

// Overhead: Header (~2 lines) + StatusBar (1 line)
const OVERHEAD_LINES = 4;

interface ContentLine {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

function ln(
  text: string,
  opts?: { color?: string; bold?: boolean; dim?: boolean },
): ContentLine {
  return { text, ...opts };
}

/**
 * Session detail view — scrollable, viewport-windowed.
 * Build all lines first, then only render visible slice.
 */
export function SessionDetail(): React.ReactElement {
  const { stdout } = useStdout();
  const selectedSessionId = useTuiStore((s) => s.selectedSessionId);
  const goBack = useTuiStore((s) => s.goBack);
  const indexed = useTuiStore((s) => s.indexed);
  const filterActive = useTuiStore((s) => s.filterActive);
  const [scrollOffset, setScrollOffset] = useState(0);
  const theme = getActiveTheme();

  if (!selectedSessionId) {
    return React.createElement(
      Box,
      { padding: 1, flexDirection: "column" },
      React.createElement(
        Text,
        { color: theme.warning },
        "No session selected.",
      ),
      React.createElement(
        Text,
        { ...theme.dim },
        'Press "4" to browse sessions, then Enter to view detail.',
      ),
    );
  }

  const item = indexed.find(
    (s) => s.summary.sessionId === selectedSessionId,
  );

  if (!item) {
    return React.createElement(
      Box,
      { padding: 1, flexDirection: "column" },
      React.createElement(
        Text,
        { color: theme.error },
        `Session not found: ${selectedSessionId.slice(0, 12)}`,
      ),
      React.createElement(
        Text,
        { color: theme.warning },
        "Press Esc to go back.",
      ),
    );
  }

  const s = item.summary;
  const wc = s.workContent;

  // Build all content lines as flat array
  const allLines: ContentLine[] = useMemo(() => {
    const lines: ContentLine[] = [];

    lines.push(ln(SEP, { color: theme.muted }));
    lines.push(
      ln(s.customTitle ?? `Session ${s.sessionId.slice(0, 12)}`, {
        bold: true,
        color: theme.primary,
      }),
    );
    lines.push(ln(SEP, { color: theme.muted }));

    lines.push(ln(`ID:       ${s.sessionId}`, { dim: true }));
    lines.push(ln(`Project:  ${s.projectPath}`, { bold: true }));
    lines.push(ln(`Time:     ${s.startTime ?? "?"} → ${s.endTime ?? "?"}`));
    lines.push(
      ln(
        `Cost:     ${formatCost(s.cost.totalUSD)}${s.cost.isEstimated ? " (estimated)" : ""} │ In: ${formatTokenCount(s.cost.inputTokens)} │ Out: ${formatTokenCount(s.cost.outputTokens)}`,
        { color: theme.info },
      ),
    );
    lines.push(
      ln(`Models:   ${s.models.join(", ") || "unknown"}`, {
        color: theme.secondary,
      }),
    );
    lines.push(
      ln(
        `Messages: ${s.messageCounts.user} user / ${s.messageCounts.assistant} assistant / ${s.messageCounts.system} system`,
      ),
    );

    // LLM Summary (from summarizer, higher quality than compactedSummary)
    if (wc?.llmSummary) {
      lines.push(ln(SEP, { color: theme.muted }));
      lines.push(ln("LLM Summary", { bold: true, color: theme.warning }));
      lines.push(ln(`  ${wc.llmSummary}`));
    }

    if (wc) {
      lines.push(ln(SEP, { color: theme.muted }));
      lines.push(ln("Work Summary", { bold: true, color: theme.warning }));

      if (wc.primaryIntent) {
        lines.push(ln(`  Intent: ${wc.primaryIntent}`, { bold: true }));
      }
      if (wc.userIntents.length > 0) {
        lines.push(ln(`  Intents: ${wc.userIntents.join("; ")}`));
      }
      if (wc.moduleSummary.length > 0) {
        lines.push(ln("  Modules:", { bold: true }));
        for (const m of wc.moduleSummary) {
          lines.push(ln(`    • ${m}`));
        }
      }
      if (wc.bashCommands.length > 0) {
        lines.push(ln("  Commands:", { bold: true }));
        for (const c of wc.bashCommands.slice(0, 10)) {
          lines.push(ln(`    $ ${c}`, { dim: true }));
        }
        if (wc.bashCommands.length > 10) {
          lines.push(ln(`    ... +${wc.bashCommands.length - 10} more`, { dim: true }));
        }
      }
      if (wc.compactedSummary) {
        lines.push(ln("  Summary:", { bold: true }));
        lines.push(ln(`    ${wc.compactedSummary}`));
      }
    }

    if (s.fileEdits.length > 0) {
      lines.push(ln(SEP, { color: theme.muted }));
      lines.push(ln("File Edits", { bold: true, color: theme.warning }));
      for (const f of s.fileEdits.slice(0, 15)) {
        lines.push(ln(`  ${f.filePath} (${f.editCount})`));
      }
      if (s.fileEdits.length > 15) {
        lines.push(ln(`  ... +${s.fileEdits.length - 15} more`, { dim: true }));
      }
    }

    if (item.daySlices.length > 0) {
      lines.push(ln(SEP, { color: theme.muted }));
      lines.push(ln("Activity by Day", { bold: true, color: theme.warning }));
      for (const d of item.daySlices) {
        const msgs = d.messageCounts.user + d.messageCounts.assistant;
        lines.push(ln(`  ${d.date} │ ${msgs} msgs │ ${formatCost(d.cost)}`));
      }
    }

    lines.push(ln(SEP, { color: theme.muted }));
    lines.push(
      ln("Esc: back  ↑↓/jk: scroll  ^U/^D: page", { color: theme.warning }),
    );

    return lines;
  }, [s, wc, item.daySlices, theme]);

  // Viewport
  const maxVisible = Math.max(3, (stdout?.rows ?? 24) - OVERHEAD_LINES);
  const maxOffset = Math.max(0, allLines.length - maxVisible);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  useInput((input, key) => {
    if (filterActive) return;

    const pageStep = Math.max(1, maxVisible - 1);

    if (key.upArrow || input === "k") {
      setScrollOffset((o) => Math.max(0, o - 1));
    }
    if (key.downArrow || input === "j") {
      setScrollOffset((o) => Math.min(maxOffset, o + 1));
    }
    if (key.pageUp || (key.ctrl && input === "u")) {
      setScrollOffset((o) => Math.max(0, o - pageStep));
    }
    if (key.pageDown || (key.ctrl && input === "d")) {
      setScrollOffset((o) => Math.min(maxOffset, o + pageStep));
    }
    if (key.escape) {
      setScrollOffset(0);
      goBack();
    }
  });

  const visibleLines = allLines.slice(clampedOffset, clampedOffset + maxVisible);
  const hasUp = clampedOffset > 0;
  const hasDown = clampedOffset + maxVisible < allLines.length;

  return React.createElement(
    Box,
    { flexDirection: "column" },
    hasUp &&
      React.createElement(
        Text,
        { ...theme.dimWarning },
        `  ↑ ${clampedOffset} lines above...`,
      ),
    ...visibleLines.map((l, i) =>
      React.createElement(
        Text,
        {
          key: clampedOffset + i,
          ...(l.color ? { color: l.color } : {}),
          ...(l.dim ? theme.dim : {}),
          ...(l.bold ? { bold: true } : {}),
        },
        l.text,
      ),
    ),
    hasDown &&
      React.createElement(
        Text,
        { ...theme.dimWarning },
        `  ↓ ${allLines.length - clampedOffset - maxVisible} lines below...`,
      ),
  );
}
