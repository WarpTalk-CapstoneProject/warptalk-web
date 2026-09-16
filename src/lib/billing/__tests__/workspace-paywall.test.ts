/**
 * A paywall can be wrong in three directions, and only one of them is the bug it fixes.
 *
 * Letting an unpaid workspace through is the reported defect. The other two are worse in
 * production: locking a paying workspace out because billing is briefly unreachable, and covering
 * the Billing page itself so the workspace can never be paid for. All three are pinned here.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NO_SUBSCRIPTION_CODE,
  decidePaywall,
  isPaywallExemptPath,
  paywallRedirectPath,
} from "../workspace-paywall.ts";
import { isWorkspaceActivationPath } from "../../workspace/workspace-routes.ts";
import type { SubscriptionDto } from "../../../types/billing.ts";

const NOW = Date.parse("2026-08-18T00:00:00Z");
const SLUG = "acme";

function subscription(overrides: Partial<SubscriptionDto> = {}): SubscriptionDto {
  return {
    id: "sub-1",
    userId: null,
    workspaceId: "ws-1",
    planId: "plan-1",
    planName: "Enterprise",
    price: 200,
    status: "active",
    creditsRemaining: 100,
    creditsUsedThisCycle: 0,
    currentPeriodStart: "2026-08-01T00:00:00Z",
    currentPeriodEnd: "2026-09-01T00:00:00Z",
    autoRenew: true,
    cancelAtPeriodEnd: false,
    createdAt: "2026-08-01T00:00:00Z",
    cancelledAt: null,
    ...overrides,
  };
}

const base = {
  pathname: `/${SLUG}/rooms`,
  workspaceSlug: SLUG,
  isLoading: false,
  now: NOW,
};

// ── The defect ───────────────────────────────────────────────────────────────

test("a workspace that never completed checkout is blocked", () => {
  assert.deepEqual(
    decidePaywall({ ...base, subscription: null, error: { code: NO_SUBSCRIPTION_CODE } }),
    { kind: "blocked" },
  );
});

test("no subscription row at all is blocked, error or not", () => {
  assert.deepEqual(decidePaywall({ ...base, subscription: null }), { kind: "blocked" });
});

test("a lapsed subscription is blocked — paid once is not paid now", () => {
  assert.deepEqual(
    decidePaywall({
      ...base,
      subscription: subscription({ currentPeriodEnd: "2026-08-01T00:00:00Z" }),
    }),
    { kind: "blocked" },
  );
});

// ── Must not lock out a paying workspace ─────────────────────────────────────

test("an active subscription is let through", () => {
  assert.deepEqual(decidePaywall({ ...base, subscription: subscription() }), { kind: "open" });
});

test("a scheduled cancellation still has its plan until the period ends", () => {
  // The backend keeps IsActive=true precisely so this is not a loss of entitlement. A paywall
  // that disagreed with the billing screens here would revoke a plan the workspace still holds.
  assert.deepEqual(
    decidePaywall({
      ...base,
      subscription: subscription({ cancelAtPeriodEnd: true, status: "cancelled" }),
    }),
    { kind: "open" },
  );
});

test("a billing outage is not an answer, and must not paywall anybody", () => {
  for (const code of ["INTERNAL_ERROR", "UNAUTHORIZED", null, undefined]) {
    assert.deepEqual(
      decidePaywall({ ...base, subscription: undefined, error: { code } }),
      { kind: "open" },
      `error code ${String(code)} must read as unknown, not unpaid`,
    );
  }
});

test("nothing is decided while the answer is still in flight", () => {
  assert.deepEqual(
    decidePaywall({ ...base, isLoading: true, subscription: undefined }),
    { kind: "checking" },
  );
});

// ── Must not cover the page that unlocks it ──────────────────────────────────

test("the activation landing stays reachable on an unpaid workspace", () => {
  // The one page that must never be covered, because it is the page that uncovers everything
  // else. It is also where paywallRedirectPath sends everybody, so if this ever stopped being
  // exempt the redirect would target a blocked route and loop.
  assert.deepEqual(
    decidePaywall({ ...base, pathname: `/${SLUG}/activate`, subscription: null }),
    { kind: "open" },
    "the activation landing must stay open, or the workspace can never be paid for",
  );
});

test("the redirect target is itself exempt, so the hold cannot loop", () => {
  assert.equal(isPaywallExemptPath(paywallRedirectPath(SLUG), SLUG), true);
});

test("the in-portal plans page is NOT the escape hatch any more", () => {
  // Reversed from WT-570, and this is the whole point of the landing. `payment/plans` lives in
  // the (app) route group, so holding an unpaid buyer there drew the entire portal around them —
  // sidebar, tabs, header, every destination bouncing back. It is the plan-MANAGEMENT screen for
  // a workspace that already pays; an unpaid one is redirected to /activate like any other page.
  for (const pathname of [`/${SLUG}/payment/plans`, `/${SLUG}/payment`]) {
    assert.equal(isPaywallExemptPath(pathname, SLUG), false, `${pathname} must be gated`);
  }
});

test("settings is gated too — the unpaid workspace has exactly one page", () => {
  // Deliberately reversed from WT-515, where settings was exempt so the "Choose a plan" button
  // had somewhere to go. The buyer is now put ON the landing instead of being handed a link to
  // it, so an open Settings would just be somewhere to wander unpaid.
  for (const pathname of [
    `/${SLUG}/settings`,
    `/${SLUG}/settings/billing`,
    `/${SLUG}/settings/account/profile`,
  ]) {
    assert.equal(isPaywallExemptPath(pathname, SLUG), false, `${pathname} must be gated`);
  }
});

test("the product itself is not exempt", () => {
  for (const pathname of [`/${SLUG}/home`, `/${SLUG}/rooms`, `/${SLUG}/documents`, `/${SLUG}/knowledge`]) {
    assert.equal(isPaywallExemptPath(pathname, SLUG), false, `${pathname} must be gated`);
  }
});

test("a path outside this workspace is none of the paywall's business", () => {
  // The gate lives in the [workspaceSlug] layout, but a stale pathname during navigation must not
  // make it judge a route it does not govern.
  assert.equal(isPaywallExemptPath("/workspace", SLUG), true);
  assert.equal(isPaywallExemptPath("/other-workspace/rooms", SLUG), true);
});

test("a settings-like prefix on another segment is not exempt", () => {
  // Matched on the whole segment, not as a prefix, so /settingsomething cannot slip through.
  assert.equal(isPaywallExemptPath(`/${SLUG}/settingsomething`, SLUG), false);
  assert.equal(isPaywallExemptPath(`/${SLUG}/activated`, SLUG), false);
});

test("the landing the paywall redirects to is the one the shell renders bare", () => {
  // Two separate rules, in two files, that must name the same route: this one decides what stays
  // open, and isWorkspaceActivationPath decides what the app shell draws no portal around. If
  // they ever disagree, the paywall redirects into the portal — which is the bug this replaced.
  assert.equal(isWorkspaceActivationPath(paywallRedirectPath(SLUG)), true);
});
