import assert from "node:assert/strict";
import test from "node:test";
import {
  YEARLY_DISCOUNT_MULTIPLIER,
  getPlanPricing,
  isYearlyPricedPlan,
  monthlyPriceOf,
  yearlyTotalOf,
} from "../plan-pricing.ts";

const MONTHLY_PLAN = { price: 1_900_000, billingCycle: "monthly" };
const YEARLY_PLAN = { price: 18_000_000, billingCycle: "yearly" };
const FREE_PLAN = { price: 0, billingCycle: "monthly" };

test("a monthly plan is charged for the month it is priced in", () => {
  const pricing = getPlanPricing(MONTHLY_PLAN, "monthly");
  assert.equal(pricing.displayPricePerMonth, 1_900_000);
  assert.equal(pricing.checkoutTotal, 1_900_000);
  assert.equal(pricing.isYearlyPriced, false);
});

test("a monthly plan bought yearly is twelve months less the advertised discount", () => {
  const pricing = getPlanPricing(MONTHLY_PLAN, "yearly");
  assert.equal(pricing.checkoutTotal, Math.round(1_900_000 * 12 * 0.79));
  // The headline stays per month so the two interval tabs compare like with like.
  assert.equal(pricing.displayPricePerMonth, Math.round(pricing.checkoutTotal / 12));
  assert.ok(pricing.displayPricePerMonth < 1_900_000, "yearly must be the cheaper rate");
});

test("a yearly-priced plan is never discounted twice, nor multiplied by twelve", () => {
  // The regression this module exists for. Treating an annual price as monthly sent
  // price * 12 * 0.79 to checkout — about 9.5x the real figure.
  const pricing = getPlanPricing(YEARLY_PLAN, "yearly");
  assert.equal(pricing.checkoutTotal, 18_000_000);
  assert.equal(pricing.displayPricePerMonth, 1_500_000);
  assert.equal(pricing.isYearlyPriced, true);

  const wrong = Math.round(18_000_000 * 12 * YEARLY_DISCOUNT_MULTIPLIER);
  assert.notEqual(pricing.checkoutTotal, wrong);
  assert.ok(pricing.checkoutTotal < wrong / 9, "must not be an order of magnitude out");
});

test("a yearly-priced plan viewed monthly divides down rather than charging the year", () => {
  const pricing = getPlanPricing(YEARLY_PLAN, "monthly");
  assert.equal(pricing.displayPricePerMonth, 1_500_000);
  assert.equal(pricing.checkoutTotal, 1_500_000);
});

test("a free plan stays free on both intervals", () => {
  for (const interval of ["monthly", "yearly"] as const) {
    const pricing = getPlanPricing(FREE_PLAN, interval);
    assert.equal(pricing.displayPricePerMonth, 0);
    assert.equal(pricing.checkoutTotal, 0);
  }
});

test("an absent plan prices at zero rather than throwing", () => {
  // The page renders before the plans query resolves.
  for (const plan of [null, undefined]) {
    const pricing = getPlanPricing(plan, "yearly");
    assert.equal(pricing.checkoutTotal, 0);
    assert.equal(pricing.displayPricePerMonth, 0);
  }
});

test("the billing cycle is read case-insensitively, and absent means monthly", () => {
  assert.equal(isYearlyPricedPlan({ price: 10, billingCycle: "YEARLY" }), true);
  assert.equal(isYearlyPricedPlan({ price: 10, billingCycle: "Yearly" }), true);
  assert.equal(isYearlyPricedPlan({ price: 10, billingCycle: "monthly" }), false);
  // Older rows and partial fixtures carry no cycle; monthly is the safe reading, because
  // treating a monthly price as annual would UNDERcharge by a factor of twelve.
  assert.equal(isYearlyPricedPlan({ price: 10 }), false);
  assert.equal(isYearlyPricedPlan({ price: 10, billingCycle: null }), false);
});

test("the per-month and per-year helpers agree with each other", () => {
  for (const plan of [MONTHLY_PLAN, YEARLY_PLAN, FREE_PLAN]) {
    const monthly = monthlyPriceOf(plan);
    const yearly = yearlyTotalOf(plan);
    // A year never costs more than twelve months at the monthly rate.
    assert.ok(yearly <= monthly * 12 + 12, `${plan.billingCycle}: yearly exceeds 12x monthly`);
  }
});
