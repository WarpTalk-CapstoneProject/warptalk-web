/**
 * The price a buyer reads and the amount Stripe charges must come from the same arithmetic.
 *
 * Before the workspace-creation gate, one screen owned both numbers and a duplicated `0.79`
 * inside it was harmless. Now the plan grid quotes the price on one route and the create form
 * hands the amount to Stripe on another, so a drift between two copies would mean a buyer
 * confirming one figure and being charged a different one — with nothing failing loudly.
 *
 * These tests pin the exact figures the plans page has always charged, so extracting the rule
 * cannot have moved any price.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  YEARLY_PRICE_MULTIPLIER,
  checkoutTotal,
  monthlyDisplayPrice,
  readBillingInterval,
  selectablePlans,
} from "../plan-pricing.ts";
import type { PlanDto } from "../../../types/billing.ts";

/** Only the fields the pricing rule reads; the DTO has twenty-two columns it does not. */
const plan = (over: Partial<PlanDto> = {}) =>
  ({
    id: "p1",
    name: "Enterprise",
    slug: "enterprise",
    tier: "enterprise",
    price: 1_900_000,
    currency: "VND",
    billingCycle: "monthly",
    sortOrder: 1,
    isActive: true,
    ...over,
  }) as PlanDto;

test("monthly quotes the plan's own price, untouched", () => {
  assert.equal(monthlyDisplayPrice(plan(), "monthly"), 1_900_000);
  assert.equal(checkoutTotal(plan(), "monthly"), 1_900_000);
});

test("yearly charges twelve months at the discount", () => {
  // 1,900,000 x 12 x 0.79 = 18,012,000. The figure the plans page has always sent.
  assert.equal(checkoutTotal(plan(), "yearly"), 1_900_000 * 12 * YEARLY_PRICE_MULTIPLIER);
  assert.equal(checkoutTotal(plan(), "yearly"), 18_012_000);
});

test("the per-month figure on a yearly card is rounded, the charged total is not", () => {
  const p = plan({ price: 333_333 });

  assert.equal(monthlyDisplayPrice(p, "yearly"), Math.round(333_333 * 0.79));
  // Rounding the monthly figure first and multiplying would give a different total. The charge
  // is computed from the plan price, not from the rounded display value.
  assert.notEqual(checkoutTotal(p, "yearly"), monthlyDisplayPrice(p, "yearly") * 12);
});

test("a plan already priced yearly is not discounted a second time", () => {
  const yearly = plan({ billingCycle: "yearly", price: 18_000_000 });

  assert.equal(monthlyDisplayPrice(yearly, "yearly"), 18_000_000);
});

test("an unknown or missing cycle means monthly, never yearly", () => {
  // Defaulting the other way would charge twelve months for a choice nobody made.
  assert.equal(readBillingInterval(new URLSearchParams("")), "monthly");
  assert.equal(readBillingInterval(new URLSearchParams("billingCycle=")), "monthly");
  assert.equal(readBillingInterval(new URLSearchParams("billingCycle=quarterly")), "monthly");
  assert.equal(readBillingInterval(null), "monthly");
  assert.equal(readBillingInterval(new URLSearchParams("billingCycle=YEARLY")), "yearly");
});

test("only active plans are selectable, in the platform's order", () => {
  const plans = [
    plan({ slug: "c", sortOrder: 3 }),
    plan({ slug: "gone", sortOrder: 0, isActive: false }),
    plan({ slug: "a", sortOrder: 1 }),
  ];

  assert.deepEqual(
    selectablePlans(plans).map((p) => p.slug),
    ["a", "c"],
  );
});
