/**
 * Export module — serialize structured data to formatted JSON.
 *
 * Pure function: no side effects, no file I/O.
 */

/**
 * Serialize any JSON-compatible value to a pretty-printed JSON string.
 *
 * @param data - The data to serialize (report object, session array, etc.)
 * @returns 2-space indented JSON string.
 */
export function renderJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
