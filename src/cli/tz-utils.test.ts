import { describe, it, expect, afterEach } from "vitest";
import {
  setTimezone,
  getTimezone,
  toDateStr,
  todayStr,
  getISOWeekForDate,
  getISOWeekForNow,
} from "./tz-utils.js";

const SYSTEM_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Always restore system timezone after each test
afterEach(() => {
  setTimezone(SYSTEM_TZ);
});

// ---------------------------------------------------------------------------
// setTimezone / getTimezone
// ---------------------------------------------------------------------------

describe("setTimezone / getTimezone", () => {
  it("defaults to system local timezone", () => {
    expect(getTimezone()).toBe(SYSTEM_TZ);
  });

  it("sets a valid IANA timezone", () => {
    setTimezone("Asia/Shanghai");
    expect(getTimezone()).toBe("Asia/Shanghai");
  });

  it("sets UTC", () => {
    setTimezone("UTC");
    expect(getTimezone()).toBe("UTC");
  });

  it("throws on invalid timezone string", () => {
    expect(() => setTimezone("Invalid/Zone")).toThrow(
      'Invalid timezone: "Invalid/Zone"',
    );
  });

  it("throws on empty string", () => {
    expect(() => setTimezone("")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// toDateStr
// ---------------------------------------------------------------------------

describe("toDateStr", () => {
  it("returns null for null input", () => {
    setTimezone("UTC");
    expect(toDateStr(null)).toBeNull();
  });

  it("extracts UTC date when tz is UTC", () => {
    setTimezone("UTC");
    // 2026-06-09T15:30:00Z → 2026-06-09
    expect(toDateStr("2026-06-09T15:30:00Z")).toBe("2026-06-09");
  });

  it("extracts local date for Asia/Shanghai (UTC+8)", () => {
    setTimezone("Asia/Shanghai");
    // 2026-06-09T23:30:00Z = 2026-06-10 07:30 in Shanghai
    expect(toDateStr("2026-06-09T23:30:00Z")).toBe("2026-06-10");
  });

  it("extracts local date for Asia/Shanghai (same day)", () => {
    setTimezone("Asia/Shanghai");
    // 2026-06-10T01:30:00Z = 2026-06-10 09:30 in Shanghai
    expect(toDateStr("2026-06-10T01:30:00Z")).toBe("2026-06-10");
  });

  it("extracts local date for America/New_York (UTC-5/4)", () => {
    setTimezone("America/New_York");
    // 2026-06-10T02:00:00Z = 2026-06-09 22:00 in New York (EDT, UTC-4 in June)
    expect(toDateStr("2026-06-10T02:00:00Z")).toBe("2026-06-09");
  });

  it("handles midnight boundary correctly", () => {
    setTimezone("Asia/Shanghai");
    // Exactly midnight UTC = 08:00 in Shanghai
    expect(toDateStr("2026-06-10T00:00:00Z")).toBe("2026-06-10");
  });

  it("handles timestamps without Z suffix", () => {
    setTimezone("UTC");
    expect(toDateStr("2026-06-09T10:00:00")).toBe("2026-06-09");
  });
});

// ---------------------------------------------------------------------------
// todayStr
// ---------------------------------------------------------------------------

describe("todayStr", () => {
  it("returns YYYY-MM-DD format", () => {
    setTimezone("UTC");
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("respects configured timezone", () => {
    setTimezone("Asia/Shanghai");
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// getISOWeekForDate
// ---------------------------------------------------------------------------

describe("getISOWeekForDate", () => {
  it("returns correct ISO week for a known Monday", () => {
    // 2026-01-05 is a Monday → week 2 of 2026
    // (Week 1 = Dec 29 - Jan 4, because it contains Jan 1 = Thursday)
    const result = getISOWeekForDate("2026-01-05");
    expect(result.week).toBe(2);
    expect(result.year).toBe(2026);
  });

  it("returns correct ISO week for a known Sunday", () => {
    // 2026-01-04 is a Sunday → week 1 (Thursday Jan 1 is in this week)
    const result = getISOWeekForDate("2026-01-04");
    expect(result.week).toBe(1);
    expect(result.year).toBe(2026);
  });

  it("handles year boundaries (week 52/53 crossing)", () => {
    // 2025-12-29 is a Monday → ISO week 1 of 2026
    const result = getISOWeekForDate("2025-12-29");
    expect(result.week).toBe(1);
    expect(result.year).toBe(2026);
  });

  it("returns week for a mid-year date", () => {
    // 2026-06-09 is a Tuesday → ISO week 24
    const result = getISOWeekForDate("2026-06-09");
    expect(result.week).toBe(24);
    expect(result.year).toBe(2026);
  });
});

// ---------------------------------------------------------------------------
// getISOWeekForNow
// ---------------------------------------------------------------------------

describe("getISOWeekForNow", () => {
  it("returns year and week numbers", () => {
    setTimezone("UTC");
    const result = getISOWeekForNow();
    expect(result.year).toBeGreaterThan(2020);
    expect(result.week).toBeGreaterThanOrEqual(1);
    expect(result.week).toBeLessThanOrEqual(53);
  });
});
