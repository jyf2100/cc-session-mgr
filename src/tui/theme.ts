/**
 * TUI theme definitions.
 *
 * Every color used by `src/tui/` views/components comes from here —
 * views must not hardcode colors. The active theme is chosen once at
 * startup from the `SESSION_MGR_THEME` environment variable
 * (`dark` | `light`; unset or unknown values fall back to `dark`).
 */

export type ThemeName = "dark" | "light";

export const THEME_ENV_VAR = "SESSION_MGR_THEME";

/**
 * Styling props spread onto an ink `<Text>` for one tone.
 *
 * On dark terminals "dim" is an intensity flag (`dimColor: true`),
 * while on light terminals dimming drives text toward the white
 * background, so a mid-gray `color` is used instead.
 */
export interface TuiTextTone {
  color?: string;
  dimColor?: boolean;
}

export interface TuiTheme {
  name: ThemeName;
  /** App/brand accent (header title). */
  accent: string;
  /** Primary emphasis: section headers, report titles, active nav key. */
  primary: string;
  /** Info emphasis: cost/token lines. */
  info: string;
  /** Secondary emphasis: model lists. */
  secondary: string;
  /** Success messages (e.g. export finished). */
  success: string;
  /** Warnings: loading, filters, hints, section markers. */
  warning: string;
  /** Errors. */
  error: string;
  /** Inactive nav keys/labels, separators, decorative rules. */
  muted: string;
  /** High-emphasis plain text (active nav label). */
  text: string;
  /** Header/status bar border color. */
  border: string;
  /** Props for dim/secondary text. */
  dim: TuiTextTone;
  /** Props for dimmed warning text (scroll indicators). */
  dimWarning: TuiTextTone;
}

/** Default theme — mirrors the historical hardcoded colors exactly. */
export const DARK_THEME: TuiTheme = {
  name: "dark",
  accent: "cyan",
  primary: "green",
  info: "cyan",
  secondary: "magenta",
  success: "green",
  warning: "yellow",
  error: "red",
  text: "white",
  muted: "gray",
  border: "gray",
  dim: { dimColor: true },
  dimWarning: { color: "yellow", dimColor: true },
};

/**
 * Light theme — dark foreground colors with ≥4.5:1 contrast on white
 * backgrounds. Bright named colors (yellow, cyan, white…) are unreadable
 * on light terminals, so hex values tuned for light backgrounds are used.
 */
export const LIGHT_THEME: TuiTheme = {
  name: "light",
  accent: "#0e7490", // cyan-700
  primary: "#15803d", // green-700
  info: "#0e7490", // cyan-700
  secondary: "#86198f", // fuchsia-700
  success: "#15803d", // green-700
  warning: "#a16207", // yellow-700
  error: "#b91c1c", // red-700
  text: "#1f2937", // gray-800
  muted: "#6b7280", // gray-500
  border: "#9ca3af", // gray-400
  dim: { color: "#52525b" }, // zinc-600
  dimWarning: { color: "#a16207" }, // yellow-700
};

const THEMES: Record<ThemeName, TuiTheme> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
};

/** Resolve a raw env value to a theme name. Unknown/unset → `dark`. */
export function resolveThemeName(value: string | undefined): ThemeName {
  return value === "light" ? "light" : "dark";
}

export function getTheme(name: ThemeName): TuiTheme {
  return THEMES[name];
}

// The theme is fixed for the lifetime of a TUI run, so a module-level
// active theme read at render time is sufficient — no React context needed.
let activeTheme: TuiTheme = DARK_THEME;

export function getActiveTheme(): TuiTheme {
  return activeTheme;
}

export function setActiveTheme(name: ThemeName): void {
  activeTheme = THEMES[name];
}

/**
 * Select the active theme from an env object (defaults to `process.env`).
 * Returns the resolved theme name.
 */
export function initThemeFromEnv(
  env: { [key: string]: string | undefined } = process.env,
): ThemeName {
  const name = resolveThemeName(env[THEME_ENV_VAR]);
  setActiveTheme(name);
  return name;
}
