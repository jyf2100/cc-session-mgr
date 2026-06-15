import { defineConfig } from "vitest/config";

/**
 * Split the suite into isolated projects so each one's timeout reflects its
 * nature:
 *
 * - unit: pure-function tests must stay fast. A 10s ceiling keeps real slow
 *   points visible — a helper that suddenly takes 30s still fails loudly,
 *   instead of being hidden behind a single global mega-timeout.
 * - integration: reads the developer's real ~/.claude corpus (1GB+, hundreds
 *   of JSONL files), so it needs a generous ceiling. ~/.claude is absent in
 *   CI, where integration.test.ts auto-skips via describe.skip — so this 60s
 *   ceiling only bites locally on a large corpus.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/integration.test.ts"],
          testTimeout: 10000,
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/integration.test.ts"],
          testTimeout: 60000,
        },
      },
    ],
  },
});
