/**
 * Analytics module — pure functions for session analysis.
 *
 * All functions are side-effect free and return typed results
 * defined in src/types/index.ts.
 */

export { generateInsights } from "./insights.js";
export { detectCostAnomalies } from "./cost-anomaly.js";
export { compareModels } from "./model-compare.js";
export { auditCostData } from "./cost-audit.js";
