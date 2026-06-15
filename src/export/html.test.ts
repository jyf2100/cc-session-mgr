import { describe, it, expect } from "vitest";
import { renderHtml } from "./html.js";

describe("renderHtml", () => {
  it("returns complete HTML document with DOCTYPE", () => {
    const result = renderHtml("# Hello");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<html");
    expect(result).toContain("</html>");
    expect(result).toContain("<head>");
    expect(result).toContain("</head>");
    expect(result).toContain("<body>");
    expect(result).toContain("</body>");
  });

  it("includes inline CSS in <style> tag", () => {
    const result = renderHtml("text");
    expect(result).toContain("<style>");
    expect(result).toContain("</style>");
    expect(result).toContain("font-family:");
    expect(result).toContain("border-collapse:");
  });

  it("renders markdown headings as HTML elements", () => {
    const result = renderHtml("# Title\n## Subtitle");
    expect(result).toContain("<h1");
    expect(result).toContain("Title");
    expect(result).toContain("<h2");
    expect(result).toContain("Subtitle");
  });

  it("renders markdown tables as <table> elements", () => {
    const md = "| Name | Cost |\n| --- | --- |\n| A | 1.0 |";
    const result = renderHtml(md);
    expect(result).toContain("<table>");
    expect(result).toContain("<th>");
    expect(result).toContain("Name");
    expect(result).toContain("A");
  });

  it("renders code blocks as <pre><code> elements", () => {
    const md = "```js\nconsole.log('hi')\n```";
    const result = renderHtml(md);
    expect(result).toContain("<pre>");
    expect(result).toContain("<code");
    expect(result).toContain("console.log");
  });

  it("returns HTML skeleton for empty markdown", () => {
    const result = renderHtml("");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<body>");
    expect(result).toContain("</body>");
  });
});
