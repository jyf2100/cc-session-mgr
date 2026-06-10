import { useInput } from "ink";
import { useTuiStore, type ViewId } from "../store.js";

/**
 * Global keyboard handler for TUI navigation.
 *
 * Handles view switching (1-5), quit (q), and back (Esc).
 * View-specific keys (arrows, Enter, /) are handled in each view.
 */
export function useNavigation(onQuit: () => void): void {
  const setView = useTuiStore((s) => s.setView);
  const goBack = useTuiStore((s) => s.goBack);
  const view = useTuiStore((s) => s.view);
  const filterActive = useTuiStore((s) => s.filterActive);

  useInput((input, key) => {
    // Don't handle global shortcuts while filter is active
    if (filterActive) return;

    // Quit
    if (input === "q") {
      onQuit();
      return;
    }

    // Back
    if (key.escape) {
      goBack();
      return;
    }

    // View switching (1-5)
    const viewMap: Record<string, ViewId> = {
      "1": "dashboard",
      "2": "daily",
      "3": "weekly",
      "4": "sessions",
      "5": "detail",
    };

    // Only switch to "detail" if a session is selected
    if (input === "5") {
      const selectedId = useTuiStore.getState().selectedSessionId;
      if (!selectedId) return;
    }

    const target = viewMap[input];
    if (target && target !== view) {
      setView(target);
    }
  });
}
