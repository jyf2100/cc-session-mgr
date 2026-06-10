import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { useTuiStore } from "./store.js";
import { buildDayIndexedWorkSummaries } from "../aggregator/build-day-indexed-work.js";
import type { SummarizeOptions } from "../summarize/summarize.js";

export interface TuiOptions {
  reportDir?: string;
  summarizeOptions?: SummarizeOptions | null;
}

/**
 * Load session data and start the TUI.
 *
 * Called from the CLI `tui` subcommand via dynamic import.
 */
export async function startTui(
  claudeDir: string,
  options?: TuiOptions,
): Promise<void> {
  const store = useTuiStore.getState();

  store.setClaudeDir(claudeDir);
  if (options?.reportDir) {
    store.setReportDir(options.reportDir);
  }
  if (options?.summarizeOptions !== undefined) {
    store.setSummarizeOptions(options.summarizeOptions);
  }

  store.setLoading(true);

  try {
    const indexed = await buildDayIndexedWorkSummaries(claudeDir);
    store.setIndexed(indexed);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load session data";
    store.setError(message);
  } finally {
    store.setLoading(false);
  }

  render(React.createElement(App));
}
