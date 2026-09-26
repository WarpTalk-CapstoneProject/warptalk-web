/**
 * backend#467: extra credits are sold only on top of a live plan. The page must hide every
 * purchase entry point in exactly the cases the server refuses, so these pin the web's copy of
 * the server's liveness rule (Subscription.GrantsPlanEntitlements) and the refusal's code.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PURCHASE_REQUIRES_SUBSCRIPTION_CODE,
  balanceAllowsExtraCredits,
  canBuyExtraCredits,
  isPurchaseRequiresSubscription,
} from "../extra-credits.ts";

const NOW = Date.parse("2026-09-26T00:00:00Z");

test("a live plan may buy extra credits", () => {
  assert.equal(canBuyExtraCredits({ status: "active", currentPeriodEnd: "2026-10-01T00:00:00Z" }, NOW), true);
  assert.equal(canBuyExtraCredits({ status: "Active", currentPeriodEnd: "2026-10-01T00:00:00Z" }, NOW), true);
});

test("no plan, an expired plan, or a period already over may not", () => {
  assert.equal(canBuyExtraCredits(null, NOW), false);
  assert.equal(canBuyExtraCredits(undefined, NOW), false);
  assert.equal(canBuyExtraCredits({ status: "expired", currentPeriodEnd: "2026-10-01T00:00:00Z" }, NOW), false);
  assert.equal(canBuyExtraCredits({ status: "active", currentPeriodEnd: "2026-09-25T00:00:00Z" }, NOW), false);
});

test("a cancelled status is not live, even inside its period — the server refuses it too", () => {
  // Three prod workspaces carry exactly this row (status cancelled, is_active true, period in 2027).
  assert.equal(canBuyExtraCredits({ status: "cancelled", currentPeriodEnd: "2027-09-01T00:00:00Z" }, NOW), false);
  assert.equal(canBuyExtraCredits({ status: "suspended", currentPeriodEnd: "2027-09-01T00:00:00Z" }, NOW), false);
});

test("the balance answers the same question the same way", () => {
  assert.equal(balanceAllowsExtraCredits({ status: "active", currentPeriodEnd: "2026-10-01T00:00:00Z" }, NOW), true);
  assert.equal(balanceAllowsExtraCredits({ status: "active", currentPeriodEnd: "2026-09-01T00:00:00Z" }, NOW), false);
  assert.equal(balanceAllowsExtraCredits(null, NOW), false);
});

test("the server's refusal is recognised by its code, not its status", () => {
  assert.equal(
    isPurchaseRequiresSubscription({ response: { status: 409, data: { code: PURCHASE_REQUIRES_SUBSCRIPTION_CODE } } }),
    true,
  );
  assert.equal(isPurchaseRequiresSubscription({ response: { status: 409, data: { code: "OTHER" } } }), false);
  assert.equal(isPurchaseRequiresSubscription(new Error("boom")), false);
  assert.equal(isPurchaseRequiresSubscription(null), false);
});
