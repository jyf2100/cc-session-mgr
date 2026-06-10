import React from "react";
import { Box, Text } from "ink";
import { useTuiStore, type ViewId } from "../store.js";

const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: "Dashboard",
  daily: "Daily Report",
  weekly: "Weekly Report",
  sessions: "Sessions",
  detail: "Session Detail",
};

const VIEW_KEYS: Record<ViewId, string> = {
  dashboard: "1",
  daily: "2",
  weekly: "3",
  sessions: "4",
  detail: "5",
};

export function Header(): React.ReactElement {
  const view = useTuiStore((s) => s.view);

  return React.createElement(
    Box,
    {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingX: 1,
      borderBottom: true,
      borderColor: "gray",
    },
    React.createElement(
      Box,
      null,
      React.createElement(Text, { bold: true, color: "cyan" }, "cc-session-mgr"),
      React.createElement(Text, { dimColor: true }, " │ "),
      React.createElement(Text, { bold: true }, VIEW_LABELS[view]),
    ),
    React.createElement(
      Box,
      null,
      ...(["dashboard", "daily", "weekly", "sessions"] as ViewId[]).flatMap(
        (v) => [
          React.createElement(
            Text,
            {
              key: `${v}-key`,
              color: view === v ? "green" : "gray",
              bold: view === v,
            },
            VIEW_KEYS[v],
          ),
          React.createElement(
            Text,
            { key: `${v}-label`, color: view === v ? "white" : "gray" },
            `:${VIEW_LABELS[v]} `,
          ),
        ],
      ),
    ),
  );
}
