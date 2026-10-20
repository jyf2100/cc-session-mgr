import React, { useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useTuiStore } from "../store.js";
import { getActiveTheme } from "../theme.js";
import { formatCost } from "../../report/format.js";

// Overhead: Header (~2 lines) + StatusBar (1 line) + title (1 line) + margins
const OVERHEAD_LINES = 5;

/**
 * Scrollable session list with / filter support.
 * Only renders rows visible in the terminal viewport.
 */
export function SessionList(): React.ReactElement {
  const { stdout } = useStdout();
  const indexed = useTuiStore((s) => s.indexed);
  const listCursor = useTuiStore((s) => s.listCursor);
  const setListCursor = useTuiStore((s) => s.setListCursor);
  const selectSession = useTuiStore((s) => s.selectSession);
  const filterActive = useTuiStore((s) => s.filterActive);
  const filter = useTuiStore((s) => s.filter);
  const setFilter = useTuiStore((s) => s.setFilter);
  const setFilterActive = useTuiStore((s) => s.setFilterActive);
  const theme = getActiveTheme();

  // Filter sessions
  const filtered = useMemo(() => {
    if (!filter) return indexed;
    const q = filter.toLowerCase();
    return indexed.filter((s) => {
      const sum = s.summary;
      return (
        sum.projectPath.toLowerCase().includes(q) ||
        sum.sessionId.toLowerCase().includes(q) ||
        (sum.customTitle ?? "").toLowerCase().includes(q) ||
        sum.models.some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [indexed, filter]);

  // Sort by start time descending
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aTime = a.summary.startTime ?? "";
        const bTime = b.summary.startTime ?? "";
        return bTime.localeCompare(aTime);
      }),
    [filtered],
  );

  const maxVisible = Math.max(
    3,
    (stdout?.rows ?? 24) - OVERHEAD_LINES,
  );
  const safeCursor = Math.min(listCursor, Math.max(0, sorted.length - 1));

  // Viewport: keep cursor always visible
  const viewportEnd = Math.min(sorted.length, safeCursor + maxVisible);
  const viewportStart = Math.max(0, viewportEnd - maxVisible);

  useInput((input, key) => {
    if (filterActive) {
      if (key.escape) {
        setFilter("");
        setFilterActive(false);
        return;
      }
      if (key.return) {
        setFilterActive(false);
        return;
      }
      if (key.backspace || key.delete) {
        setFilter(filter.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setFilter(filter + input);
      }
      return;
    }

    if (input === "/") {
      setFilterActive(true);
      return;
    }
    if (key.upArrow) {
      setListCursor(Math.max(0, safeCursor - 1));
    }
    if (key.downArrow) {
      setListCursor(Math.min(sorted.length - 1, safeCursor + 1));
    }
    if (key.pageUp || (key.ctrl && input === "u")) {
      setListCursor(Math.max(0, safeCursor - maxVisible));
    }
    if (key.pageDown || (key.ctrl && input === "d")) {
      setListCursor(Math.min(sorted.length - 1, safeCursor + maxVisible));
    }
    if (key.return && sorted.length > 0) {
      selectSession(sorted[safeCursor].summary.sessionId);
    }
  });

  // Empty state
  if (sorted.length === 0) {
    return React.createElement(
      Box,
      { padding: 1, flexDirection: "column" },
      React.createElement(
        Text,
        { bold: true },
        `Sessions${filter ? ` (filter: "${filter}")` : ""}`,
      ),
      React.createElement(
        Text,
        { ...theme.dim },
        filter ? "No sessions match filter." : "No sessions loaded.",
      ),
    );
  }

  const visibleRows = sorted.slice(viewportStart, viewportEnd);

  // Scroll indicators
  const hasUp = viewportStart > 0;
  const hasDown = viewportEnd < sorted.length;

  return React.createElement(
    Box,
    { flexDirection: "column", paddingY: 0 },
    // Title bar
    React.createElement(
      Box,
      { marginBottom: 0 },
      React.createElement(
        Text,
        { bold: true },
        `Sessions (${sorted.length}${filter ? `, filter: "${filter}"` : ""})`,
      ),
      React.createElement(Text, { ...theme.dim }, "  ↑↓ navigate  Enter open  / filter  PgUp/PgDn"),
    ),

    // Scroll-up indicator
    hasUp &&
      React.createElement(
        Text,
        { ...theme.dimWarning },
        `  ↑ ${viewportStart} more above...`,
      ),

    // Visible session rows
    ...visibleRows.map((s, i) => {
      const realIndex = viewportStart + i;
      const isCursor = realIndex === safeCursor;
      const sum = s.summary;
      const title = sum.customTitle ?? sum.sessionId.slice(0, 12);
      const time = sum.startTime
        ? sum.startTime.replace("T", " ").slice(0, 16)
        : "unknown";
      const line = `${title} │ ${sum.projectPath.split("/").pop()} │ ${time} │ ${formatCost(sum.cost.totalUSD)}`;

      if (isCursor) {
        return React.createElement(
          Box,
          { key: sum.sessionId },
          React.createElement(Text, { inverse: true, bold: true }, " ▶ "),
          React.createElement(Text, { inverse: true, bold: true }, line),
        );
      }

      return React.createElement(
        Text,
        { key: sum.sessionId, ...theme.dim },
        `   ${line}`,
      );
    }),

    // Scroll-down indicator
    hasDown &&
      React.createElement(
        Text,
        { ...theme.dimWarning },
        `  ↓ ${sorted.length - viewportEnd} more below...`,
      ),
  );
}
