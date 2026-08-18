/**
 * The plan a guest picked has to survive signing up. WT-491.
 *
 * `handleChoosePlan` pushed the plain get-started href, so the plan clicked on the landing page
 * was dropped at the first redirect. The visitor signed up, landed in an empty workspace, and had
 * nothing on screen connecting them to the purchase they had started.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHECKOUT_PLAN_PARAM,
  checkoutContinuationPath,
  readCheckoutIntent,
  withCheckoutIntent,
} from "../checkout-intent.ts";
import { getLandingGetStartedHref } from "../../auth/landing-redirect.ts";

const params = (query: string) => new URLSearchParams(query);

test("a chosen plan is attached to the path", () => {
  assert.equal(withCheckoutIntent("/workspace", "business"), "/workspace?planSlug=business");
});

test("no plan leaves the path exactly as it was", () => {
  // The visitor who pressed "Get started" rather than a plan card must not be sent to checkout.
  assert.equal(withCheckoutIntent("/workspace", null), "/workspace");
  assert.equal(withCheckoutIntent("/workspace", undefined), "/workspace");
  assert.equal(withCheckoutIntent("/workspace", "   "), "/workspace");
});

test("an existing query string is kept", () => {
  assert.equal(
    withCheckoutIntent("/login?callbackUrl=%2Fworkspace", "pro"),
    "/login?callbackUrl=%2Fworkspace&planSlug=pro",
  );
});

test("a slug with characters that need escaping survives the round trip", () => {
  const path = withCheckoutIntent("/workspace", "team plus");
  assert.equal(readCheckoutIntent(params(path.split("?")[1])), "team plus");
});

test("a blank planSlug reads as no intent, not as an empty plan", () => {
  // A half-built link leaving `?planSlug=` behind would otherwise read as "mid-purchase" and open
  // checkout for a plan that does not exist.
  assert.equal(readCheckoutIntent(params("planSlug=")), null);
  assert.equal(readCheckoutIntent(params("planSlug=%20%20")), null);
  assert.equal(readCheckoutIntent(params("")), null);
  assert.equal(readCheckoutIntent(null), null);
});

test("a signed-out visitor carries the plan INSIDE the callback url", () => {
  // It has to survive /login, a possible detour through /register and email verification, and a
  // return to a different tab. As a sibling parameter of /login nothing would forward it.
  const href = getLandingGetStartedHref({
    isAuthenticated: false,
    user: null,
    planSlug: "business",
  });

  assert.equal(href, `/login?callbackUrl=${encodeURIComponent("/workspace?planSlug=business")}`);

  const callback = decodeURIComponent(href.split("callbackUrl=")[1]);
  assert.equal(readCheckoutIntent(params(callback.split("?")[1])), "business");
});

test("a signed-in visitor carries the plan on the destination itself", () => {
  const href = getLandingGetStartedHref({
    isAuthenticated: true,
    user: { id: "u1" },
    activeWorkspaceSlug: "acme",
    planSlug: "pro",
  });

  assert.equal(href, "/acme/home?planSlug=pro");
});

test("the get-started path is unchanged for a visitor who chose no plan", () => {
  // Guards the existing behaviour: this function has one other caller and one other button.
  assert.equal(
    getLandingGetStartedHref({ isAuthenticated: false, user: null }),
    `/login?callbackUrl=${encodeURIComponent("/workspace")}`,
  );
  assert.equal(
    getLandingGetStartedHref({ isAuthenticated: true, user: { id: "u1" }, activeWorkspaceSlug: "acme" }),
    "/acme/home",
  );
});

test("after the workspace exists the buyer continues at its plan grid", () => {
  // The grid, not a checkout session: creating one needs an amount and currency only the grid has
  // resolved, and it is the last moment the buyer can see what they are about to be charged.
  assert.equal(
    checkoutContinuationPath("acme", "business"),
    `/acme/payment/plans?${CHECKOUT_PLAN_PARAM}=business`,
  );
});

test("someone who created a workspace without buying is not sent to the plan grid", () => {
  assert.equal(checkoutContinuationPath("acme", null), "/acme/payment/plans");
});
