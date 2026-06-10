/**
 * Centralized timezone-aware date operations.
 *
 * All date extraction, "today" calculation, and ISO week computation flow
 * through this module so that every layer of the pipeline (aggregator,
 * report, CLI, web) respects the same configured timezone.
 *
 * Default: system local timezone (via `Intl.DateTimeFormat`).
 * Override: `setTimezone("Asia/Shanghai")` or `--tz` CLI flag.
 */

// ---------------------------------------------------------------------------
// Module-level timezone state
// ---------------------------------------------------------------------------

/** Current IANA timezone string. */
let tz: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Cached formatter for `toDateStr`. Invalidated on timezone change. */
let dateFmt: Intl.DateTimeFormat = createDateFormatter(tz);

/** Cached formatter for `formatTime`. Invalidated on timezone change. */
let timeFmt: Intl.DateTimeFormat = createTimeFormatter(tz);

function createDateFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function createTimeFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Set the active timezone. Validates the IANA identifier and throws
 * on invalid values.
 */
export function setTimezone(timezone: string): void {
  // Validate by attempting to create a formatter
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(
      `Invalid timezone: "${timezone}". Use IANA format like "Asia/Shanghai" or "UTC".`,
    );
  }
  tz = timezone;
  dateFmt = createDateFormatter(tz);
  timeFmt = createTimeFormatter(tz);
}

/** Return the currently active IANA timezone string. */
export function getTimezone(): string {
  return tz;
}

/**
 * Convert a UTC ISO timestamp to a local date string (YYYY-MM-DD)
 * using the configured timezone.
 *
 * Replaces all `ts.slice(0, 10)` calls throughout the codebase.
 */
export function toDateStr(ts: string | null): string | null {
  if (!ts) return null;
  return dateFmt.format(new Date(ts));
}

/**
 * Format a UTC ISO timestamp as a local time string (HH:MM)
 * using the configured timezone.
 */
export function formatTime(ts: string): string {
  return timeFmt.format(new Date(ts));
}

/**
 * Return today's date in YYYY-MM-DD format using the configured timezone.
 */
export function todayStr(): string {
  return dateFmt.format(new Date());
}

/**
 * Compute the ISO week number and year for a local date string (YYYY-MM-DD).
 *
 * The input is expected to be a *local* date (from `toDateStr`), so this
 * uses local Date methods rather than UTC.
 */
export function getISOWeekForDate(dateStr: string): {
  year: number;
  week: number;
} {
  // Parse as local midnight — no "Z" suffix
  const d = new Date(dateStr + "T00:00:00");
  // ISO day of week: Mon=1, ..., Sun=7
  const dayNum = d.getDay() || 7;
  // Set to nearest Thursday (the ISO year's defining day)
  d.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: d.getFullYear(), week };
}

/**
 * Return the ISO week number and year for the current moment
 * using the configured timezone.
 */
export function getISOWeekForNow(): { year: number; week: number } {
  return getISOWeekForDate(todayStr());
}
