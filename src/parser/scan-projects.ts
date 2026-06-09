import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "glob";

export interface ProjectDir {
  /** Encoded directory name (e.g., "-Volumes-work-myapp") */
  encodedName: string;
  /** Absolute path to the project directory */
  dirPath: string;
  /** Absolute paths to JSONL session files in this directory */
  jsonlFiles: string[];
}

/**
 * Discover all project directories under `~/.claude/projects/`
 * and list their JSONL session files.
 */
export async function scanProjects(
  claudeDir: string,
): Promise<ProjectDir[]> {
  const projectsDir = join(claudeDir, "projects");

  let entries: string[];
  try {
    entries = await readdir(projectsDir);
  } catch {
    // No projects directory yet
    return [];
  }

  const results: ProjectDir[] = [];

  for (const name of entries) {
    const dirPath = join(projectsDir, name);
    const jsonlFiles = await glob("*.jsonl", {
      cwd: dirPath,
      absolute: true,
    });

    if (jsonlFiles.length > 0) {
      results.push({ encodedName: name, dirPath, jsonlFiles });
    }
  }

  return results;
}
