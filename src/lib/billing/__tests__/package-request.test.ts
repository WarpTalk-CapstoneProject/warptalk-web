import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeDiscount,
  displayCurrency,
  isoToLocalInput,
  localInputToIso,
  priceFor,
  validateAddon,
  validateCoupon,
  validateCreditPack,
} from "../package-request.ts";
import type { AddonRequest, CouponRequest, CreditPackRequest } from "../../../types/admin-packages.ts";

const pack = (over: Partial<CreditPackRequest> = {}): CreditPackRequest => ({
  slug: "starter-pack",
  name: "Starter",
  description: null,
  credits: 10_000,
  bonusCredits: 0,
  priceVnd: 99_000,
  priceUsd: 4.99,
  validityDays: null,
  visibility: "public",
  eligiblePlanIds: [],
  eligibleWorkspaceIds: [],
  maxPerWorkspace: null,
  maxTotal: null,
  availableFrom: null,
  availableUntil: null,
  status: "draft",
  sortOrder: 0,
  ...over,
});

const addon = (over: Partial<AddonRequest> = {}): AddonRequest => ({
  slug: "extra-participants",
  name: "Extra participants",
  description: null,
  unitLabel: "participant",
  entitlementKey: "max_participants",
  unitsPerQuantity: 10,
  priceMonthlyVnd: 50_000,
  priceYearlyVnd: null,
  priceMonthlyUsd: null,
  priceYearlyUsd: null,
  minQuantity: 1,
  maxQuantity: 5,
  eligiblePlanIds: [],
  status: "active",
  sortOrder: 0,
  ...over,
});

const coupon = (over: Partial<CouponRequest> = {}): CouponRequest => ({
  code: "LAUNCH20",
  name: "Launch",
  discountType: "percent",
  percentOff: 20,
  amountOff: null,
  amountOffCurrency: null,
  appliesToTypes: ["credit_pack"],
  appliesToIds: [],
  duration: "once",
  durationInMonths: null,
  maxRedemptions: null,
  perWorkspaceLimit: 1,
  validFrom: null,
  validUntil: null,
  autoApply: false,
  status: "active",
  ...over,
});

describe("credit pack rules (mirror of the server)", () => {
  it("accepts a well-formed pack", () => assert.equal(validateCreditPack(pack()), null));
  it("refuses negative and zero prices", () => {
    assert.equal(validateCreditPack(pack({ priceVnd: -1 }))?.key, "pricePositive");
    assert.equal(validateCreditPack(pack({ priceUsd: 0 }))?.key, "pricePositive");
  });
  it("holds each currency to its own precision and Stripe's minimum", () => {
    assert.equal(validateCreditPack(pack({ priceVnd: 99_000.5 }))?.key, "priceWholeDong");
    assert.equal(validateCreditPack(pack({ priceUsd: 4.999 }))?.key, "priceTwoDecimals");
    assert.equal(validateCreditPack(pack({ priceUsd: 0.49 }))?.key, "priceBelowStripeMinimum");
  });
  it("needs at least one price and the list its visibility reads", () => {
    assert.equal(validateCreditPack(pack({ priceVnd: null, priceUsd: null }))?.key, "priceRequired");
    assert.equal(validateCreditPack(pack({ visibility: "plans" }))?.key, "visibilityPlans");
    assert.equal(validateCreditPack(pack({ visibility: "workspaces" }))?.key, "visibilityWorkspaces");
  });
  it("orders limits and the window", () => {
    assert.equal(validateCreditPack(pack({ maxPerWorkspace: 5, maxTotal: 2 }))?.key, "limitOrder");
    assert.equal(
      validateCreditPack(pack({ availableFrom: "2026-10-01T00:00:00Z", availableUntil: "2026-09-01T00:00:00Z" }))?.key,
      "window",
    );
  });
});

describe("add-on rules", () => {
  it("only sells enforced entitlements", () => {
    assert.equal(validateAddon(addon()), null);
    assert.equal(validateAddon(addon({ entitlementKey: "storage_gb" }))?.key, "entitlement");
  });
  it("sells a capability once, one unit", () => {
    assert.equal(validateAddon(addon({ entitlementKey: "voice_clone", unitsPerQuantity: 1, maxQuantity: 1 })), null);
    assert.equal(validateAddon(addon({ entitlementKey: "voice_clone", unitsPerQuantity: 1, maxQuantity: 3 }))?.key, "capabilityOnce");
  });
  it("orders quantities", () => assert.equal(validateAddon(addon({ minQuantity: 3, maxQuantity: 2 }))?.key, "quantities"));
});

describe("coupon rules", () => {
  it("needs a code or auto-apply", () => {
    assert.equal(validateCoupon(coupon()), null);
    assert.equal(validateCoupon(coupon({ code: null }))?.key, "codeOrAuto");
    assert.equal(validateCoupon(coupon({ code: null, autoApply: true })), null);
  });
  it("bounds the discount", () => {
    assert.equal(validateCoupon(coupon({ percentOff: 101 }))?.key, "percent");
    assert.equal(validateCoupon(coupon({ discountType: "fixed", percentOff: null, amountOff: 5 }))?.key, "fixedCurrency");
    assert.equal(
      validateCoupon(coupon({ discountType: "fixed", percentOff: null, amountOff: 5.5, amountOffCurrency: "vnd" }))?.key,
      "priceWholeDong",
    );
  });
  it("gives months only to a repeating coupon", () => {
    assert.equal(validateCoupon(coupon({ duration: "repeating" }))?.key, "months");
    assert.equal(validateCoupon(coupon({ duration: "repeating", durationInMonths: 3 })), null);
  });
});

describe("catalog helpers", () => {
  const prices = [
    { currency: "vnd", billingCycle: "monthly" as const, amount: 50_000, discountedAmount: null, autoCouponName: null },
    { currency: "usd", billingCycle: "yearly" as const, amount: 20, discountedAmount: 16, autoCouponName: "Fall" },
  ];
  it("finds a price by currency and cycle", () => {
    assert.equal(priceFor(prices, "USD", "yearly")?.amount, 20);
    assert.equal(priceFor(prices, "usd", "monthly"), null);
  });
  it("shows the workspace currency when the item is priced in it, never converting", () => {
    assert.equal(displayCurrency(prices, "vnd"), "vnd");
    assert.equal(displayCurrency([prices[1]], "vnd"), "usd");
    assert.equal(displayCurrency([], "vnd"), null);
  });
  it("describes a discount as a customer reads it", () => {
    assert.equal(describeDiscount({ discountType: "percent", percentOff: 15, amountOff: null, amountOffCurrency: null }), "15%");
    assert.equal(describeDiscount({ discountType: "fixed", percentOff: null, amountOff: 50_000, amountOffCurrency: "vnd" }), "50,000 VND");
  });
  it("round-trips a datetime-local value", () => {
    const iso = localInputToIso("2026-09-25T10:30");
    assert.ok(iso);
    assert.equal(isoToLocalInput(iso), "2026-09-25T10:30");
    assert.equal(localInputToIso(""), null);
  });
});
