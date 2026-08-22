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
} from "../workspace-paywall.ts";
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

test("billing and settings stay reachable on an unpaid workspace", () => {
  for (const pathname of [
    `/${SLUG}/settings/billing`,
    `/${SLUG}/settings/billing/invoices`,
    `/${SLUG}/settings`,
    `/${SLUG}/payment/plans`,
  ]) {
    assert.deepEqual(
      decidePaywall({ ...base, pathname, subscription: null }),
      { kind: "open" },
      `${pathname} must stay open, or the workspace can never be paid for`,
    );
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
});
