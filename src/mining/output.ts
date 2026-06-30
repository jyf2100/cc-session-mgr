/**
 * @file 产物输出(组 5,决策 9/11)。
 *
 * - `lessons/<projectName>/<id>.md`(按项目分目录,只建有产出)
 * - 顶层 `INDEX.md` 总览(按价值排序)
 * - 绝不写 `~/.claude`(只读约束)或 `CLAUDE.md`(决策 9)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AggregatedKnowledge, Lesson } from "./types.js";

/** 安全文件名段(保留 CJK)。 */
function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9一-鿿._-]/g, "_").slice(0, 60) || "_";
}

/** YAML frontmatter(数组 → 列表,其余 JSON 字符串)。 */
function yamlFrontmatter(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${k}: []`);
      else {
        lines.push(`${k}:`);
        for (const item of v) lines.push(`  - ${String(item)}`);
      }
    } else if (v === undefined || v === "") {
      lines.push(`${k}: ""`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** 单 lesson → Markdown + frontmatter(借鉴 claude-memory-extractor 格式)。 */
export function renderLesson(l: Lesson): string {
  const fm: Record<string, unknown> = {
    id: l.id,
    type: l.type,
    confidence: l.confidence,
    uncertain: l.uncertain,
    certaintyReasoning: l.certaintyReasoning,
    trigger: l.trigger,
    "source-sessions": l.sourceSessions,
    projects: l.projects,
    date: l.date,
  };
  return `---
${yamlFrontmatter(fm)}---

# ${l.problem}

**Root cause:** ${l.rootCause || "(未明确)"}

**Solution:** ${l.solution || "(未明确)"}

**Takeaway:** ${l.takeaway || "(未明确)"}

**Confidence:** ${l.confidence}/5${l.uncertain ? " · ⚠️ uncertain" : ""}

**Trigger:** ${l.trigger || "(未指定)"}
`;
}

/** 聚合条目 → Markdown(信号组或 lesson 组)。 */
export function renderKnowledge(k: AggregatedKnowledge): string {
  const head = k.lessons[0]?.problem ?? k.signals[0]?.content ?? k.key;
  const fm: Record<string, unknown> = {
    kind: k.kind,
    project: k.projectName,
    occurrences: k.occurrences,
    "source-sessions": k.sourceSessions,
    projects: k.projects,
  };
  const body: string[] = [
    `**Occurrences:** ${k.occurrences} · **Project:** ${k.projectName} · **Kind:** ${k.kind}`,
  ];
  if (k.lessons.length > 0) {
    body.push("", "## Lessons");
    for (const l of k.lessons) {
      body.push(`- [${l.confidence}/5] ${l.problem} — ${l.takeaway}`);
    }
  }
  if (k.signals.length > 0) {
    body.push("", "## Signals");
    for (const s of k.signals) {
      body.push(`- [${s.type}] ${s.content} (${s.evidence})`);
    }
  }
  return `---
${yamlFrontmatter(fm)}---

# ${head}

${body.join("\n")}
`;
}

/** INDEX 总览(按 `条目数 × 最高confidence` 排序)。 */
export function renderIndex(ks: AggregatedKnowledge[]): string {
  const byProject = new Map<string, AggregatedKnowledge[]>();
  for (const k of ks) {
    const arr = byProject.get(k.projectName) ?? [];
    arr.push(k);
    byProject.set(k.projectName, arr);
  }
  const rows = [...byProject.entries()].map(([project, items]) => {
    const confs = items.flatMap((k) => k.lessons.map((l) => l.confidence));
    const maxConf = confs.length > 0 ? Math.max(...confs) : 0;
    return {
      project,
      count: items.length,
      maxConf,
      kinds: [...new Set(items.map((k) => k.kind))].join(", "),
    };
  });
  rows.sort((a, b) => b.count * (b.maxConf || 1) - a.count * (a.maxConf || 1));
  const lines: string[] = [
    "# Mining Index",
    "",
    "| 项目 | 条目数 | 最高 confidence | 类型 |",
    "|------|--------|-----------------|------|",
  ];
  for (const r of rows) {
    lines.push(`| ${r.project} | ${r.count} | ${r.maxConf}/5 | ${r.kinds} |`);
  }
  return lines.join("\n") + "\n";
}

/** 写全部产物(按项目分目录,只建有产出;+ INDEX)。返回写入统计。 */
export function writeOutput(
  ks: AggregatedKnowledge[],
  outputDir: string,
): { written: number; projects: string[] } {
  const lessonsRoot = join(outputDir, "lessons");
  let written = 0;
  const projects = new Set<string>();
  for (const k of ks) {
    const projDir = join(lessonsRoot, safeName(k.projectName));
    mkdirSync(projDir, { recursive: true });
    projects.add(k.projectName);
    const name = safeName(k.key).slice(0, 50) || "item";
    writeFileSync(join(projDir, `${name}.md`), renderKnowledge(k), "utf-8");
    written++;
  }
  if (ks.length > 0) {
    writeFileSync(join(lessonsRoot, "INDEX.md"), renderIndex(ks), "utf-8");
  }
  return { written, projects: [...projects] };
}
