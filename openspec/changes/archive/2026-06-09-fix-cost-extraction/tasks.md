## 1. Pricing Table

- [x] 1.1 Create `src/parser/pricing.ts` with model pricing table (`inputPer1M`, `outputPer1M` per model), prefix-matching lookup function `getPricing(modelName)`, and `estimateCost(inputTokens, outputTokens, pricing)` helper
- [x] 1.2 Write unit tests for `pricing.ts`: exact match, prefix match, unknown model fallback, cost calculation

## 2. Type Extensions

- [x] 2.1 Extend `SessionSummary.cost` type in `src/types/index.ts` to add `inputTokens`, `outputTokens`, `cacheReadTokens`, `isEstimated` fields
- [x] 2.2 Update all existing test factory functions (`makeSummary` etc.) to provide default values for new cost fields

## 3. Cost Extraction Fix

- [x] 3.1 Modify `src/parser/extract-cost.ts` — when `costUSD` is absent, read `entry.message.usage.input_tokens` and `entry.message.usage.output_tokens`, call `estimateCost()`, set `isEstimated: true`
- [x] 3.2 Update `extract-cost` unit tests: add cases for `message.usage` present, `costUSD` present, both absent, `cache_read_input_tokens` present

## 4. Report Display

- [x] 4.1 Add `formatTokenCount(tokens)` helper to `src/report/format.ts` — format as `50.0K` / `1.2M` etc.
- [x] 4.2 Update `src/report/daily.ts` to show token stats alongside cost: `$X.XX (N in / M out)`
- [x] 4.3 Update `src/report/weekly.ts` to show token stats in summary table
- [x] 4.4 Update `src/report/project-report.ts` to show token stats in overview section
- [x] 4.5 Update report unit tests to verify new token display format

## 5. Integration Verification

- [x] 5.1 Run `npm run build` and `npm run test` — all tests pass
- [x] 5.2 Run `node dist/cli/index.js report daily` against real data — verify non-zero token counts appear
