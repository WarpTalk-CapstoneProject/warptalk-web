import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatPlanPrice, priceWithVat } from "../plan-display.ts";

describe("plan card prices", () => {
  test("a whole price has no .00 (3 Oct 2026)", () => {
    assert.equal(formatPlanPrice(500, "usd"), "500 USD");
    assert.equal(formatPlanPrice(1900000, "VND"), "1,900,000 VND");
  });

  test("a price with cents keeps both digits", () => {
    assert.equal(formatPlanPrice(79.6, "USD"), "79.60 USD");
    assert.equal(formatPlanPrice(0.5, "USD"), "0.50 USD");
  });

  test("VAT is added on top and rounded to the currency's unit", () => {
    assert.equal(priceWithVat(500, 10, "USD"), 550);
    assert.equal(priceWithVat(79.6, 10, "USD"), 87.56);
    assert.equal(priceWithVat(99000, 8, "VND"), 106920);
  });

  test("no VAT leaves the price alone", () => {
    assert.equal(priceWithVat(500, 0, "USD"), 500);
  });
});
