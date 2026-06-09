import { describe, it, expect } from "vitest";
import { parseWeekArg, getISOWeek, todayStr } from "./helpers.js";

describe("parseWeekArg", () => {
  it("parses valid YYYY-WNN format", () => {
    const result = parseWeekArg("2026-W23");
    expect(result).toEqual({ year: 2026, week: 23 });
  });

  it("parses single-digit week number", () => {
    const result = parseWeekArg("2026-W5");
    expect(result).toEqual({ year: 2026, week: 5 });
  });

  it("returns null for invalid format", () => {
    expect(parseWeekArg("2026-23")).toBeNull();
    expect(parseWeekArg("not-a-week")).toBeNull();
    expect(parseWeekArg("W23")).toBeNull();
    expect(parseWeekArg("")).toBeNull();
  });

  it("returns null for out-of-range week number", () => {
    expect(parseWeekArg("2026-W00")).toBeNull();
    expect(parseWeekArg("2026-W54")).toBeNull();
  });

  it("returns null for malformed year", () => {
    expect(parseWeekArg("abc-W23")).toBeNull();
  });
});

describe("getISOWeek", () => {
  it("returns correct ISO week for a known date", () => {
    // 2026-01-01 is a Thursday, ISO week 1 of 2026
    const result = getISOWeek(new Date("2026-01-01"));
    expect(result.year).toBe(2026);
    expect(result.week).toBe(1);
  });

  it("returns week 2 for Jan 5 2026 (Monday of week 2)", () => {
    const result = getISOWeek(new Date("2026-01-05"));
    expect(result.week).toBe(2);
  });

  it("handles late December dates", () => {
    // 2026-12-31 is a Thursday
    const result = getISOWeek(new Date("2026-12-31"));
    expect(result.year).toBe(2026);
    expect(result.week).toBeGreaterThanOrEqual(52);
  });
});

describe("todayStr", () => {
  it("returns a string in YYYY-MM-DD format", () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
