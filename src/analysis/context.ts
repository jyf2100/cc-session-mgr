/**
 * Context scoring — evaluates CLAUDE.md (or similar) files for quality
 * in guiding AI sessions. Returns a grade A–F with dimensional scores.
 */

import { readFileSync, statSync, existsSync } from "node:fs";
import type {
  SessionSummary,
  ContextGrade,
  ContextScore,
  ContextScoreDimensions,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum content length to not be considered minimal. */
const MIN_CONTENT_LENGTH = 50;

/** File age threshold for recency scoring (30 days in ms). */
const RECENT_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/** Key sections to detect in context files. */
const EXPECTED_SECTIONS = [
  { patterns: ["build", "compile", "npm run", "make"], label: "Build commands" },
  { patterns: ["architecture", "arch", "structure", "pipeline"], label: "Architecture overview" },
  { patterns: ["coding", "style", "convention", "lint", "format"], label: "Coding conventions" },
  { patterns: ["constraint", "requirement", "must", "shall", "never", "always"], label: "Project constraints" },
  { patterns: ["pitfall", "common issue", "known issue", "caveat", "warning"], label: "Common pitfalls" },
];

/** Vague phrases that indicate low specificity. */
const VAGUE_PHRASES = [
  "write good code",
  "follow best practices",
  "clean code",
  "well-structured",
  "proper error handling",
  "write tests",
  "be careful",
  "use common sense",
];

/** Grade thresholds for overall score. */
const GRADE_THRESHOLDS: Array<{ min: number; grade: ContextGrade }> = [
  { min: 80, grade: "A" },
  { min: 65, grade: "B" },
  { min: 50, grade: "C" },
  { min: 35, grade: "D" },
  { min: 0, grade: "F" },
];

// ---------------------------------------------------------------------------
// Scoring dimensions
// ---------------------------------------------------------------------------

function scoreCompleteness(content: string): {
  score: number;
  detected: string[];
  missing: string[];
} {
  const lower = content.toLowerCase();
  const detected: string[] = [];
  const missing: string[] = [];

  for (const section of EXPECTED_SECTIONS) {
    const found = section.patterns.some((p) => lower.includes(p));
    if (found) {
      detected.push(section.label);
    } else {
      missing.push(section.label);
    }
  }

  const score = Math.round((detected.length / EXPECTED_SECTIONS.length) * 100);
  return { score, detected, missing };
}

function scoreSpecificity(content: string): number {
  const lower = content.toLowerCase();

  // Count vague phrase occurrences
  let vagueCount = 0;
  for (const phrase of VAGUE_PHRASES) {
    if (lower.includes(phrase)) vagueCount++;
  }

  // Count specific indicators: file paths, commands, code blocks, explicit rules
  const specificIndicators = [
    /\.[a-z]{2,4}\b/g,             // file extensions
    /```/g,                          // code blocks
    /npm run/g,                      // npm commands
    /\b[A-Z_]{3,}\b/g,             // CONSTANT_NAMES
    /\d+\s*(px|rem|%|ms|s)\b/g,    // numeric values with units
    /src\/|lib\/|test\//g,          // directory paths
    /never|always|must|shall/gi,    // strong directives
  ];

  let specificCount = 0;
  for (const pattern of specificIndicators) {
    const matches = content.match(pattern);
    if (matches) specificCount += matches.length;
  }

  // Base score from specificity indicators
  const rawScore = Math.min(100, specificCount * 5);

  // Penalize vague language
  const vaguenessPenalty = vagueCount * 10;

  return Math.max(0, Math.min(100, rawScore - vaguenessPenalty));
}

function scoreConsistency(content: string): number {
  const directives = new Set<string>();
  const directivePattern = /\b(must|shall|should|never|always|avoid|prefer|use|don't|do not)\b/gi;
  let match: RegExpExecArray | null;
  const tempPattern = new RegExp(directivePattern.source, directivePattern.flags);
  while ((match = tempPattern.exec(content)) !== null) {
    directives.add(match[1].toLowerCase());
  }

  // Check for internal contradictions (basic heuristic)
  let contradictions = 0;
  const lower = content.toLowerCase();
  if (lower.includes("always use tabs") && lower.includes("always use spaces")) contradictions++;
  if (lower.includes("use semicolons") && lower.includes("no semicolons")) contradictions++;
  if (lower.includes("use camelcase") && lower.includes("use snake_case")) contradictions++;

  const baseScore = directives.size > 0 ? 70 : 30;
  const contradictionPenalty = contradictions * 30;
  const bonus = content.length > 200 ? 10 : 0;

  return Math.max(0, Math.min(100, baseScore + bonus - contradictionPenalty));
}

function scoreRecency(filePath: string): number {
  try {
    const stats = statSync(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs < RECENT_THRESHOLD_MS) return 100;
    // Degrade linearly over 6 months
    const sixMonths = 180 * 24 * 60 * 60 * 1000;
    if (ageMs > sixMonths) return 10;
    return Math.round(100 - ((ageMs - RECENT_THRESHOLD_MS) / (sixMonths - RECENT_THRESHOLD_MS)) * 90);
  } catch {
    return 50; // Default if stat fails
  }
}

// ---------------------------------------------------------------------------
// Grade calculation
// ---------------------------------------------------------------------------

function computeGrade(overallScore: number): ContextGrade {
  for (const { min, grade } of GRADE_THRESHOLDS) {
    if (overallScore >= min) return grade;
  }
  return "F";
}

// ---------------------------------------------------------------------------
// Session correlation
// ---------------------------------------------------------------------------

function computeSessionCorrelation(
  sessions?: SessionSummary[],
): "positive" | "negative" | "neutral" | "unknown" {
  if (!sessions || sessions.length === 0) return "unknown";

  let goodSessions = 0;
  for (const session of sessions) {
    const hasOutput = (session.fileEdits?.length ?? 0) > 0;
    const lowCost = (session.cost?.totalUSD ?? 0) < 1.0;
    if (hasOutput && lowCost) goodSessions++;
  }

  const ratio = goodSessions / sessions.length;
  if (ratio >= 0.7) return "positive";
  if (ratio <= 0.3) return "negative";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Score a context file (e.g., CLAUDE.md) for quality in guiding AI sessions.
 * Returns null if the file does not exist.
 */
export function scoreContext(
  filePath: string,
  sessions?: SessionSummary[],
): ContextScore | null {
  if (!existsSync(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  // Handle empty or minimal files
  if (content.trim().length < MIN_CONTENT_LENGTH) {
    return {
      grade: "F",
      overallScore: 0,
      dimensions: { completeness: 0, specificity: 0, consistency: 0, recency: 0 },
      detectedSections: [],
      missingSections: EXPECTED_SECTIONS.map((s) => s.label),
      sessionCorrelation: sessions ? computeSessionCorrelation(sessions) : "unknown",
    };
  }

  // Compute dimension scores
  const { score: completeness, detected, missing } = scoreCompleteness(content);
  const specificity = scoreSpecificity(content);
  const consistency = scoreConsistency(content);
  const recency = scoreRecency(filePath);

  const dimensions: ContextScoreDimensions = {
    completeness,
    specificity,
    consistency,
    recency,
  };

  const overallScore = Math.round(
    completeness * 0.3 + specificity * 0.3 + consistency * 0.2 + recency * 0.2,
  );

  const grade = computeGrade(overallScore);

  return {
    grade,
    overallScore,
    dimensions,
    detectedSections: detected,
    missingSections: missing,
    sessionCorrelation: sessions
      ? computeSessionCorrelation(sessions)
      : "unknown",
  };
}
