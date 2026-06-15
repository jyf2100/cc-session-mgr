import { marked } from "marked";

/**
 * Export module — render Markdown to a self-contained HTML page.
 *
 * Pure function: no side effects, no file I/O.
 */

/** Inline CSS embedded in every exported HTML page. */
const INLINE_CSS = `
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1rem;
  color: #1a1a1a;
  line-height: 1.6;
  background: #fff;
}
h1, h2, h3, h4, h5, h6 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  line-height: 1.3;
}
h1 { font-size: 1.8rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3rem; }
h2 { font-size: 1.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.2rem; }
h3 { font-size: 1.25rem; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.9rem;
}
th, td {
  border: 1px solid #d1d5db;
  padding: 0.5rem 0.75rem;
  text-align: left;
}
th { background: #f3f4f6; font-weight: 600; }
tr:nth-child(even) { background: #f9fafb; }
code {
  background: #f3f4f6;
  padding: 0.15em 0.35em;
  border-radius: 3px;
  font-size: 0.9em;
}
pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.5;
}
pre code {
  background: none;
  padding: 0;
  color: inherit;
}
blockquote {
  border-left: 4px solid #e5e7eb;
  margin: 1em 0;
  padding: 0.5em 1em;
  color: #6b7280;
}
hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
`.trim();

/**
 * Convert a Markdown string into a self-contained HTML page with inline CSS.
 *
 * @param markdown - Markdown content to render.
 * @returns Complete HTML document string.
 */
export function renderHtml(markdown: string): string {
  const bodyHtml = marked.parse(markdown) as string;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${INLINE_CSS}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
