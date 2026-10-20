import React from "react";
import { Box, Text } from "ink";
import { useTuiStore } from "../store.js";
import { getActiveTheme } from "../theme.js";

export function StatusBar(): React.ReactElement {
  const view = useTuiStore((s) => s.view);
  const filterActive = useTuiStore((s) => s.filterActive);
  const filter = useTuiStore((s) => s.filter);
  const indexed = useTuiStore((s) => s.indexed);
  const theme = getActiveTheme();

  const sessionCount = indexed.length;
  const left = `${sessionCount} sessions loaded`;

  let right = "q:quit";
  if (view === "daily" || view === "weekly") {
    right = "←→:navigate  e:export  q:quit";
  } else if (view === "sessions") {
    right = "↑↓:move  Enter:detail  /:filter  q:quit";
  } else if (view === "detail") {
    right = "Esc:back  q:quit";
  }

  return React.createElement(
    Box,
    {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingX: 1,
      borderTop: true,
      borderColor: theme.border,
    },
    React.createElement(
      Box,
      null,
      React.createElement(Text, { ...theme.dim }, left),
      filterActive &&
        React.createElement(
          Text,
          { color: theme.warning },
          ` │ filter: ${filter}█`,
        ),
    ),
    React.createElement(Text, { ...theme.dim }, right),
  );
}
