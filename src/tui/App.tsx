import React from "react";
import { Box, Text, useApp } from "ink";
import { useTuiStore } from "./store.js";
import { useNavigation } from "./hooks/useNavigation.js";
import { Header } from "./components/Header.js";
import { StatusBar } from "./components/StatusBar.js";
import { Dashboard } from "./views/Dashboard.js";
import { DailyReport } from "./views/DailyReport.js";
import { WeeklyReport } from "./views/WeeklyReport.js";
import { SessionList } from "./views/SessionList.js";
import { SessionDetail } from "./views/SessionDetail.js";

export function App(): React.ReactElement {
  const view = useTuiStore((s) => s.view);
  const loading = useTuiStore((s) => s.loading);
  const error = useTuiStore((s) => s.error);
  const { exit } = useApp();

  useNavigation(exit);

  if (loading) {
    return React.createElement(
      Box,
      { padding: 1 },
      React.createElement(Text, { color: "yellow" }, "Loading session data..."),
    );
  }

  if (error) {
    return React.createElement(
      Box,
      { padding: 1, flexDirection: "column" },
      React.createElement(Text, { color: "red", bold: true }, "Error: ", error),
      React.createElement(Text, { dimColor: true }, "Press q to exit."),
    );
  }

  const viewMap: Record<string, React.ReactElement> = {
    dashboard: React.createElement(Dashboard),
    daily: React.createElement(DailyReport),
    weekly: React.createElement(WeeklyReport),
    sessions: React.createElement(SessionList),
    detail: React.createElement(SessionDetail),
  };

  return React.createElement(
    Box,
    { flexDirection: "column", height: "100%" },
    React.createElement(Header),
    React.createElement(
      Box,
      { flexGrow: 1, flexDirection: "column", paddingX: 1 },
      viewMap[view] ?? React.createElement(Dashboard),
    ),
    React.createElement(StatusBar),
  );
}
