import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCreditRateCard,
  marginLabel,
  marginTone,
  parseProviderCostUsd,
  providerCostEffect,
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

  it("derives a margin from the price in credits times the credit value", () => {
    // 120 credits × $0.00015 = $0.018 against a $0.006 cost.
    const margin = resolveRateCardMargin(card({ unitPrice: 120 }), 0.00015);

    assert.equal(margin.source, "derived");
    assert.ok(Math.abs(margin.value! - 3) < 1e-9);
  });

  it("refuses to divide credits by dollars when the credit value is unknown", () => {
    // The whole reason this module exists. The obvious calculation produces a number that looks
    // like a margin, is off by the credit value, and would be believed.
    const margin = resolveRateCardMargin(card({ unitPrice: 120 }));

    assert.equal(margin.value, null);
    assert.equal(margin.source, "unavailable");
    assert.equal(margin.reason, "no-credit-value");
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

  it("does not care what the currency label says: the price is credits on every card", () => {
    for (const currency of ["usd", "CRD", "VND"]) {
      assert.equal(resolveRateCardMargin(card({ currency, unitPrice: 120 }), 0.00015).source, "derived");
    }
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
      marginTone({ value: null, source: "unavailable", reason: "no-credit-value" }),
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
      marginLabel({ value: null, source: "unavailable", reason: "no-credit-value" }),
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

describe("isCreditRateCard", () => {
  it("recognises the credit-unit cards billing_worker settles on", () => {
    assert.equal(isCreditRateCard({ currency: "CRD" }), true);
    // The database column is char(3); a padded or lowercase value is still a credit card.
    assert.equal(isCreditRateCard({ currency: "crd " }), true);
  });

  it("leaves VND and USD cards to the full editor", () => {
    assert.equal(isCreditRateCard({ currency: "VND" }), false);
    assert.equal(isCreditRateCard({ currency: "USD" }), false);
  });
});

describe("providerCostEffect", () => {
  it("backfills a card that never had a cost, so settled usage becomes costable", () => {
    assert.equal(providerCostEffect({ providerUnitCostUsd: null }, 0.00049), "backfill");
  });

  it("supersedes a card whose cost changes, so settled usage keeps the old cost", () => {
    assert.equal(providerCostEffect({ providerUnitCostUsd: 0.00049 }, 0.0006), "supersede");
  });

  it("does nothing when the cost is the same", () => {
    assert.equal(providerCostEffect({ providerUnitCostUsd: 0.00049 }, 0.00049), "unchanged");
  });
});

describe("parseProviderCostUsd", () => {
  it("reads a small positive USD amount exactly as typed", () => {
    assert.equal(parseProviderCostUsd("0.00049"), 0.00049);
    assert.equal(parseProviderCostUsd(" 0.000735 "), 0.000735);
    assert.equal(parseProviderCostUsd("4.9e-4"), 0.00049);
  });

  it("refuses zero, negatives, blanks and text rather than guessing", () => {
    for (const value of ["0", "0.0", "-0.0001", "", "  ", "abc", "1,5", "$0.001"]) {
      assert.equal(parseProviderCostUsd(value), null, value);
    }
  });
});

