import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJsonlStream } from "./parse-jsonl.js";

/**
 * Three-layer project path decoding strategy:
 *
 *   Layer 1: Session metadata from `~/.claude/sessions/*.json` → `cwd` field
 *   Layer 2: JSONL file `cwd` field from first user/assistant entry
 *   Layer 3: Naive fallback — replace leading `-` with `/`, remaining `-` with `/`
 *
 * @param projectDirs - Array of { encodedName, dirPath, jsonlFiles } from scanProjects
 * @param claudeDir - Path to `~/.claude`
 * @returns Map from encoded directory name to decoded real path
 */
export async function decodeProjectPaths(
  projectDirs: Array<{ encodedName: string; dirPath: string; jsonlFiles: string[] }>,
  claudeDir: string,
): Promise<Map<string, string>> {
  const pathMap = new Map<string, string>();

  // Layer 1: Read session metadata files
  await fillFromSessionMetadata(claudeDir, pathMap);

  // Layer 2: For remaining unresolved dirs, scan JSONL cwd fields
  const unresolved = projectDirs.filter((d) => !pathMap.has(d.encodedName));

  if (unresolved.length > 0) {
    await fillFromJsonlCwd(unresolved, pathMap);
  }

  // Layer 3: Naive fallback for anything still unresolved
  for (const dir of projectDirs) {
    if (!pathMap.has(dir.encodedName)) {
      pathMap.set(dir.encodedName, naiveDecode(dir.encodedName));
    }
  }

  return pathMap;
}

async function fillFromSessionMetadata(
  claudeDir: string,
  pathMap: Map<string, string>,
): Promise<void> {
  const sessionsDir = join(claudeDir, "sessions");

  let files: string[];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    try {
      const content = await readFile(join(sessionsDir, file), "utf-8");
      const meta = JSON.parse(content) as { cwd?: string };
      if (meta.cwd) {
        const encoded = sanitizePath(meta.cwd);
        if (!pathMap.has(encoded)) {
          pathMap.set(encoded, meta.cwd);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }
}

async function fillFromJsonlCwd(
  unresolved: Array<{ encodedName: string; dirPath: string; jsonlFiles: string[] }>,
  pathMap: Map<string, string>,
): Promise<void> {
  // Only scan the first JSONL file per project to keep it fast
  for (const dir of unresolved) {
    if (dir.jsonlFiles.length === 0) continue;

    try {
      const entries = await parseJsonlStream(dir.jsonlFiles[0]);
      for (const entry of entries) {
        if (entry.cwd) {
          pathMap.set(dir.encodedName, entry.cwd);
          break;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }
}

/**
 * Encode a filesystem path the same way Claude Code does:
 * replace all non-alphanumeric characters with `-`.
 */
function sanitizePath(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Naive decode: convert the encoded directory name back to a
 * plausible path by treating `-` as `/`.
 */
function naiveDecode(encoded: string): string {
  // Claude Code paths are absolute, so the encoded form starts with `-`
  // (because the leading `/` gets encoded to `-`)
  return encoded.replace(/-/g, "/");
}
