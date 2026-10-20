import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import {
  THEME_ENV_VAR,
  DARK_THEME,
  LIGHT_THEME,
  resolveThemeName,
  getTheme,
  getActiveTheme,
  setActiveTheme,
  initThemeFromEnv,
} from "./theme.js";
import { Header } from "./components/Header.js";
import { StatusBar } from "./components/StatusBar.js";

afterEach(() => {
  setActiveTheme("dark");
});

describe("resolveThemeName", () => {
  it("defaults to dark when the value is undefined (env var unset)", () => {
    expect(resolveThemeName(undefined)).toBe("dark");
  });

  it("resolves explicit light", () => {
    expect(resolveThemeName("light")).toBe("light");
  });

  it("resolves explicit dark", () => {
    expect(resolveThemeName("dark")).toBe("dark");
  });

  it("falls back to dark for unknown values (case-sensitive)", () => {
    for (const value of ["", "Light", "LIGHT", "solarized", "0", "true"]) {
      expect(resolveThemeName(value)).toBe("dark");
    }
  });
});

describe("active theme", () => {
  it("defaults to the dark theme (backwards compatible)", () => {
    expect(getActiveTheme()).toBe(DARK_THEME);
    expect(getActiveTheme().name).toBe("dark");
  });

  it("SESSION_MGR_THEME=light activates the light theme", () => {
    const name = initThemeFromEnv({ [THEME_ENV_VAR]: "light" });
    expect(name).toBe("light");
    expect(getActiveTheme()).toBe(LIGHT_THEME);
  });

  it("unknown SESSION_MGR_THEME value falls back to dark", () => {
    const name = initThemeFromEnv({ [THEME_ENV_VAR]: "banana" });
    expect(name).toBe("dark");
    expect(getActiveTheme()).toBe(DARK_THEME);
  });

  it("unset SESSION_MGR_THEME keeps dark", () => {
    const name = initThemeFromEnv({});
    expect(name).toBe("dark");
    expect(getActiveTheme()).toBe(DARK_THEME);
  });

  it("setActiveTheme switches between themes", () => {
    setActiveTheme("light");
    expect(getActiveTheme().name).toBe("light");
    setActiveTheme("dark");
    expect(getActiveTheme().name).toBe("dark");
  });
});

describe("theme palettes", () => {
  it("getTheme returns the palette matching the name", () => {
    expect(getTheme("dark")).toBe(DARK_THEME);
    expect(getTheme("light")).toBe(LIGHT_THEME);
  });

  it("dark theme keeps the historical colors", () => {
    expect(DARK_THEME.accent).toBe("cyan");
    expect(DARK_THEME.primary).toBe("green");
    expect(DARK_THEME.warning).toBe("yellow");
    expect(DARK_THEME.error).toBe("red");
    expect(DARK_THEME.text).toBe("white");
    expect(DARK_THEME.muted).toBe("gray");
    expect(DARK_THEME.dim).toEqual({ dimColor: true });
  });

  it("light theme uses dark readable foregrounds, not bright named colors", () => {
    // Bright foregrounds (yellow/white/cyan…) are unreadable on white
    // backgrounds; the light palette must use dark hex values instead.
    const brightNamed = new Set([
      "yellow",
      "white",
      "cyan",
      "green",
      "magenta",
      "red",
      "gray",
    ]);
    for (const token of [
      "accent",
      "primary",
      "info",
      "secondary",
      "success",
      "warning",
      "error",
      "text",
      "muted",
      "border",
    ] as const) {
      expect(brightNamed.has(LIGHT_THEME[token])).toBe(false);
      expect(LIGHT_THEME[token]).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Dim text must be readable on light backgrounds: a real color,
    // not just an intensity flag that fades toward the background.
    expect(LIGHT_THEME.dim.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(LIGHT_THEME.dim.color).not.toBe("#ffffff");
  });

  it("light and dark palettes differ on every token", () => {
    for (const token of [
      "accent",
      "primary",
      "info",
      "secondary",
      "success",
      "warning",
      "error",
      "text",
      "muted",
      "border",
    ] as const) {
      expect(LIGHT_THEME[token]).not.toBe(DARK_THEME[token]);
    }
  });
});

describe("themed components", () => {
  it("Header renders with the light theme active", () => {
    setActiveTheme("light");
    const { lastFrame, unmount } = render(React.createElement(Header));
    expect(lastFrame()).toContain("cc-session-mgr");
    expect(lastFrame()).toContain("Dashboard");
    unmount();
  });

  it("StatusBar renders with the light theme active", () => {
    setActiveTheme("light");
    const { lastFrame, unmount } = render(React.createElement(StatusBar));
    expect(lastFrame()).toContain("sessions loaded");
    expect(lastFrame()).toContain("q:quit");
    unmount();
  });

  it("Header keeps identical text content across themes (only colors change)", () => {
    setActiveTheme("dark");
    const dark = render(React.createElement(Header));
    const darkFrame = dark.lastFrame();
    dark.unmount();

    setActiveTheme("light");
    const light = render(React.createElement(Header));
    const lightFrame = light.lastFrame();
    light.unmount();

    // The test renderer emits no ANSI colors, so both frames carry the
    // same text: switching themes must not alter layout or copy.
    expect(darkFrame).toContain("cc-session-mgr");
    expect(lightFrame).toContain("cc-session-mgr");
    expect(lightFrame).toBe(darkFrame);
  });
});
