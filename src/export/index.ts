/**
 * Export module — multi-format output for reports.
 *
 * All functions are pure: data in, string out. No file I/O.
 */

export { renderHtml } from "./html.js";
export { renderJson } from "./json.js";
export { renderCsv } from "./csv.js";
