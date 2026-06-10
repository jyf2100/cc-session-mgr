/**
 * Shared helper functions for the CLI module.
 * Extracted for testability.
 *
 * Date/week functions are re-exported from tz-utils.ts (the centralized
 * timezone-aware module). Only parseWeekArg remains here.
 */

export { todayStr, getISOWeekForNow as getISOWeek } from "./tz-utils.js";

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
