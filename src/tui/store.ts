import { create } from "zustand";
import type { DayIndexedWorkSession } from "../types/index.js";
import type { SummarizeOptions } from "../summarize/summarize.js";

export type ViewId = "dashboard" | "daily" | "weekly" | "sessions" | "detail";

export interface TuiState {
  // Data
  indexed: DayIndexedWorkSession[];
  loading: boolean;
  error: string | null;

  // Config
  reportDir: string;
  claudeDir: string;
  summarizeOptions: SummarizeOptions | null;

  // Export status
  exporting: boolean;
  exportStatus: string | null;

  // Navigation
  view: ViewId;
  prevView: ViewId | null;
  selectedSessionId: string | null;

  // Filter
  filter: string;
  filterActive: boolean;

  // Cursors
  dailyDate: string;
  weeklyYear: number;
  weeklyWeek: number;
  listCursor: number;
}

export interface TuiActions {
  setIndexed: (data: DayIndexedWorkSession[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setReportDir: (dir: string) => void;
  setClaudeDir: (dir: string) => void;
  setSummarizeOptions: (opts: SummarizeOptions | null) => void;
  setExporting: (exporting: boolean) => void;
  setExportStatus: (msg: string | null) => void;
  setView: (view: ViewId) => void;
  setFilter: (filter: string) => void;
  setFilterActive: (active: boolean) => void;
  navigateDaily: (delta: 1 | -1) => void;
  navigateWeekly: (delta: 1 | -1) => void;
  selectSession: (id: string) => void;
  setListCursor: (cursor: number) => void;
  goBack: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentIsoWeek(): { year: number; week: number } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: d.getFullYear(), week };
}

export type TuiStore = TuiState & TuiActions;

export const useTuiStore = create<TuiStore>((set, get) => ({
  // Data
  indexed: [],
  loading: false,
  error: null,

  // Config
  reportDir: "",
  claudeDir: "",
  summarizeOptions: null,

  // Export status
  exporting: false,
  exportStatus: null,

  // Navigation
  view: "dashboard",
  prevView: null,
  selectedSessionId: null,

  // Filter
  filter: "",
  filterActive: false,

  // Cursors
  dailyDate: todayStr(),
  weeklyYear: currentIsoWeek().year,
  weeklyWeek: currentIsoWeek().week,
  listCursor: 0,

  // Actions
  setIndexed: (data) => set({ indexed: data }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setReportDir: (dir) => set({ reportDir: dir }),
  setClaudeDir: (dir) => set({ claudeDir: dir }),
  setSummarizeOptions: (opts) => set({ summarizeOptions: opts }),
  setExporting: (exporting) => set({ exporting }),
  setExportStatus: (msg) => set({ exportStatus: msg }),

  setView: (view) => {
    const prev = get().view;
    set({ view, prevView: prev });
  },

  setFilter: (filter) => set({ filter }),
  setFilterActive: (active) => set({ filterActive: active }),

  navigateDaily: (delta) => {
    const current = new Date(get().dailyDate + "T00:00:00");
    current.setDate(current.getDate() + delta);
    const next = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
    set({ dailyDate: next });
  },

  navigateWeekly: (delta) => {
    const { weeklyYear, weeklyWeek } = get();
    let week = weeklyWeek + delta;
    let year = weeklyYear;
    if (week < 1) {
      year -= 1;
      week = 52;
    } else if (week > 52) {
      year += 1;
      week = 1;
    }
    set({ weeklyYear: year, weeklyWeek: week });
  },

  selectSession: (id) => {
    const prev = get().view;
    set({ selectedSessionId: id, view: "detail", prevView: prev });
  },

  setListCursor: (cursor) => set({ listCursor: cursor }),

  goBack: () => {
    const { prevView } = get();
    if (prevView) {
      set({ view: prevView, prevView: null });
    } else {
      set({ view: "dashboard", prevView: null });
    }
    if (get().filterActive) {
      set({ filter: "", filterActive: false });
    }
  },
}));
