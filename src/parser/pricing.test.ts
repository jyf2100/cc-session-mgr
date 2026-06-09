import { describe, it, expect } from "vitest";
import { getPricing, estimateCost } from "./pricing.js";

describe("getPricing", () => {
  it("returns exact match", () => {
    const p = getPricing("claude-sonnet-4-6");
    expect(p.inputPer1M).toBe(3);
    expect(p.outputPer1M).toBe(15);
  });

  it("matches by longest prefix", () => {
    const p = getPricing("claude-sonnet-4-6-20250514");
    expect(p.inputPer1M).toBe(3);
    expect(p.outputPer1M).toBe(15);
  });

  it("returns zero pricing for unknown model", () => {
    const p = getPricing("some-unknown-model-v42");
    expect(p.inputPer1M).toBe(0);
    expect(p.outputPer1M).toBe(0);
  });
});

describe("estimateCost", () => {
  it("calculates cost from tokens and pricing", () => {
    const cost = estimateCost(500_000, 10_000, {
      inputPer1M: 3,
      outputPer1M: 15,
    });
    expect(cost).toBe(1.65);
  });

  it("returns 0 for zero pricing", () => {
    const cost = estimateCost(100_000, 5_000, {
      inputPer1M: 0,
      outputPer1M: 0,
    });
    expect(cost).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    const cost = estimateCost(123_456, 7_890, {
      inputPer1M: 3,
      outputPer1M: 15,
    });
    // Raw: 0.370368 + 0.11835 = 0.488718 → rounds to 0.49
    expect(cost).toBe(0.49);
  });
});
