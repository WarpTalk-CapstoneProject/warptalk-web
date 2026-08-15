import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  marginLabel,
  marginTone,
  resolveRateCardMargin,
  type RateCardLike,
} from "../rate-card-margin.ts";

const card = (overrides: Partial<RateCardLike> = {}): RateCardLike => ({
  unitPrice: 0.018,
  currency: "USD",
  providerUnitCostUsd: 0.006,
  markupMultiplier: null,
  ...overrides,
});

describe("resolveRateCardMargin", () => {
  it("reports the stored multiplier when there is one", () => {
    const margin = resolveRateCardMargin(card({ markupMultiplier: 3 }));

    assert.equal(margin.value, 3);
    assert.equal(margin.source, "recorded");
  });

  it("prefers the stored multiplier over one it could compute", () => {
    // The stored value is what pricing decided. Silently recomputing it would report a second
    // opinion as fact — here the arithmetic says 3.0 and the column says 2.5, and the column wins.
    const margin = resolveRateCardMargin(card({ markupMultiplier: 2.5 }));

    assert.equal(margin.value, 2.5);
    assert.equal(margin.source, "recorded");
  });

  it("derives a margin when price and cost are both in USD", () => {
    const margin = resolveRateCardMargin(card());

    assert.equal(margin.source, "derived");
    assert.ok(Math.abs(margin.value! - 3) < 1e-9);
  });

  it("refuses to divide a VND price by a USD cost", () => {
    // The whole reason this module exists. The obvious calculation produces a number that looks
    // like a margin, is off by the exchange rate, and would be believed.
    const margin = resolveRateCardMargin(card({ currency: "VND", unitPrice: 474 }));

    assert.equal(margin.value, null);
    assert.equal(margin.source, "unavailable");
    assert.equal(margin.reason, "currency-mismatch");
  });

  it("says so when no provider cost was recorded", () => {
    const margin = resolveRateCardMargin(card({ providerUnitCostUsd: null }));

    assert.equal(margin.value, null);
    assert.equal(margin.reason, "no-cost-recorded");
  });

  it("treats a zero cost as no cost rather than dividing by it", () => {
    // A recorded 0 is not a free provider; it is a row nobody filled in. Dividing would be
    // Infinity, which renders as "∞×" and reads like the best margin on the page.
    const margin = resolveRateCardMargin(card({ providerUnitCostUsd: 0 }));

    assert.equal(margin.value, null);
    assert.equal(margin.reason, "no-cost-recorded");
  });

  it("accepts a lowercase currency code when deciding comparability", () => {
    const margin = resolveRateCardMargin(card({ currency: "usd" }));

    assert.equal(margin.source, "derived");
  });
});

describe("marginTone", () => {
  it("calls anything under 1 a loss", () => {
    // Selling below cost. The bands are set where a decision changes, not at round numbers.
    assert.equal(marginTone({ value: 0.9, source: "recorded" }), "loss");
  });

  it("calls anything under 1.5 thin", () => {
    // Close enough that a provider price rise erases it.
    assert.equal(marginTone({ value: 1.2, source: "recorded" }), "thin");
  });

  it("calls 1.5 and above healthy", () => {
    assert.equal(marginTone({ value: 1.5, source: "recorded" }), "healthy");
    assert.equal(marginTone({ value: 3, source: "recorded" }), "healthy");
  });

  it("does not colour a margin it does not have", () => {
    assert.equal(
      marginTone({ value: null, source: "unavailable", reason: "currency-mismatch" }),
      "unknown",
    );
  });
});

describe("marginLabel", () => {
  it("prints one decimal place", () => {
    assert.equal(marginLabel({ value: 3.14, source: "recorded" }), "3.1×");
  });

  it("rounds an exact midpoint down, which is toFixed's real behaviour", () => {
    // 3.05 is not representable in binary floating point — the nearest double is a hair BELOW it,
    // so toFixed(1) yields "3.0" rather than "3.1". Pinned rather than corrected: this is a
    // margin badge, a tenth either way changes no decision, and adding half-up rounding here
    // would be machinery guarding nothing. The test exists so nobody later reads "3.0" as a bug.
    assert.equal(marginLabel({ value: 3.05, source: "recorded" }), "3.0×");
  });

  it("explains a currency mismatch instead of printing a dash alone", () => {
    // A bare dash reads as "zero margin". Naming the reason is what stops that.
    assert.equal(
      marginLabel({ value: null, source: "unavailable", reason: "currency-mismatch" }),
      "not comparable",
    );
  });

  it("distinguishes a missing cost from an incomparable one", () => {
    assert.equal(
      marginLabel({ value: null, source: "unavailable", reason: "no-cost-recorded" }),
      "no cost recorded",
    );
  });
});
