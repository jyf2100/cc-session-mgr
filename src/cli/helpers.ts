/**
 * Shared helper functions for the CLI module.
 * Extracted for testability.
 */

/**
 * Get today's date in YYYY-MM-DD format.
 */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parse a week argument in YYYY-WNN format.
 * Returns null if the format is invalid.
 */
export function parseWeekArg(
  arg: string,
): { year: number; week: number } | null {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(arg);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  if (week < 1 || week > 53) return null;
  return { year, week };
}

/**
 * Get the ISO week number and year for a given date.
 * Uses the standard nearest-Thursday algorithm.
 */
export function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // ISO day of week: Mon=1, Tue=2, ..., Sun=7
  const dayNum = d.getUTCDay() || 7;
  // Set to nearest Thursday (the ISO year's defining day)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: d.getUTCFullYear(), week };
}
