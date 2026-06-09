import { writeFile } from "node:fs/promises";

/**
 * Write a Markdown report to a file or stdout.
 *
 * @param markdown - The complete Markdown report content
 * @param outputPath - File path to write to, or undefined for stdout
 */
export async function writeReport(
  markdown: string,
  outputPath?: string,
): Promise<void> {
  if (outputPath) {
    await writeFile(outputPath, markdown, "utf-8");
    console.log(`Report written to ${outputPath}`);
  } else {
    process.stdout.write(markdown);
  }
}
