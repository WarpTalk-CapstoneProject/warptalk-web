/**
 * WT-381 — what the plans page is allowed to say about a cancelled-at-period-end subscription.
 *
 * The reported behaviour: cancel the renewal, and the workspace is shown as having no plan at all.
 * The backend disagrees. `Cancel()` sets `AutoRenew=false` and `Status=cancelled` and leaves
 * `IsActive=true` on purpose, and `GetActiveSubscriptionAsync` filters on `IsActive` — the row is
 * still returned, still Enterprise, still paid for until the period ends.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SubscriptionDto } from "../../../types/billing.ts";
import {
  canCancelRenewal,
  describeSubscription,
  hasPaidEntitlement,
} from "../subscription-state.ts";

const NOW = Date.parse("2026-08-14T10:00:00Z");
const PERIOD_END = "2026-09-14T00:00:00Z";

function subscription(overrides: Partial<SubscriptionDto> = {}): SubscriptionDto {
  return {
    id: "s1",
    userId: null,
    workspaceId: "w1",
    planId: "p1",
    planName: "Enterprise",
    price: 1_900_000,
    status: "active",
    creditsRemaining: 1000,
    creditsUsedThisCycle: 0,
    currentPeriodStart: "2026-08-14T00:00:00Z",
    currentPeriodEnd: PERIOD_END,
    autoRenew: true,
    cancelAtPeriodEnd: false,
    createdAt: "2026-08-14T00:00:00Z",
    cancelledAt: null,
    ...overrides,
  };
}

/** Exactly what the backend leaves behind after DELETE /subscriptions/workspace/{id}. */
const afterCancel = subscription({
  status: "cancelled",
  autoRenew: false,
  cancelAtPeriodEnd: true,
});

test("a cancelled renewal is still a plan the workspace holds", () => {
  const state = describeSubscription(afterCancel, NOW);

  assert.equal(state.kind, "cancellation-scheduled");
  assert.equal(hasPaidEntitlement(state), true);
});

test("it carries the date the plan actually ends, not the date it was cancelled", () => {
  const state = describeSubscription(afterCancel, NOW);
  assert.equal(state.kind, "cancellation-scheduled");
  if (state.kind !== "cancellation-scheduled") return;

  assert.equal(state.endsOn.getTime(), Date.parse(PERIOD_END));
});

test("renewal cannot be cancelled twice", () => {
  // The control has to disappear once it has been used, or the owner presses it again, the
  // request succeeds, and nothing on the page changes — which reads as the first one not working.
  assert.equal(canCancelRenewal(describeSubscription(afterCancel, NOW)), false);
  assert.equal(canCancelRenewal(describeSubscription(subscription(), NOW)), true);
});

test("no subscription is the only thing that means no plan", () => {
  assert.equal(describeSubscription(null, NOW).kind, "none");
  assert.equal(describeSubscription(undefined, NOW).kind, "none");
  assert.equal(hasPaidEntitlement({ kind: "none" }), false);
});

test("any one of the three cancellation signals is enough", () => {
  // The DTO carries all three (`cancelAtPeriodEnd` is literally `!AutoRenew` on the wire), and a
  // reader that required agreement would report "renewing" whenever one of them went missing —
  // failing open into the exact bug being fixed.
  for (const shape of [
    { cancelAtPeriodEnd: true, autoRenew: true, status: "active" },
    { cancelAtPeriodEnd: false, autoRenew: false, status: "active" },
    { cancelAtPeriodEnd: false, autoRenew: true, status: "cancelled" },
  ]) {
    const state = describeSubscription(subscription(shape), NOW);
    assert.equal(
      state.kind,
      "cancellation-scheduled",
      `${JSON.stringify(shape)} was read as still renewing`,
    );
  }
});

test("status is matched case-insensitively", () => {
  const state = describeSubscription(subscription({ status: "Cancelled" }), NOW);
  assert.equal(state.kind, "cancellation-scheduled");
});

test("a period that has already ended is not offered as a future date", () => {
  // SubscriptionExpirationWorker runs on a timer, so the API keeps returning the row for a while
  // after its period end. Without this the page promises the plan "until 12 August" on the 14th.
  const state = describeSubscription(
    subscription({ currentPeriodEnd: "2026-08-12T00:00:00Z", status: "cancelled", autoRenew: false }),
    NOW,
  );

  assert.equal(state.kind, "lapsed");
  assert.equal(hasPaidEntitlement(state), false);
});

test("an unparseable period end does not revoke a plan on screen", () => {
  // Losing the date is a reason to stop quoting it, not a reason to tell a paying customer their
  // plan is over.
  const state = describeSubscription(subscription({ currentPeriodEnd: "not-a-date" }), NOW);

  assert.equal(state.kind, "active");
  assert.equal(hasPaidEntitlement(state), true);
});

// ── The wiring. Everything above passes on a module nothing imports. ─────────────────────────

/**
 * Comments are stripped before the source checks below run. Both files now carry a note naming the
 * dead route and the bad comparison in order to explain why they are gone — and a check that
 * cannot tell an explanation from a call would force the explanation out, leaving the next person
 * who reaches for `change-plan` nothing to tell them it is a dead end.
 */
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const plansPage = readFileSync(
  new URL("../../../app/(app)/[workspaceSlug]/payment/plans/page.tsx", import.meta.url),
  "utf8",
);

test("the plans page refetches the subscription after cancelling instead of nulling it", () => {
  assert.match(plansPage, /invalidateQueries\(\{\s*queryKey: \["subscription", activeWorkspaceId\]/);
  assert.doesNotMatch(
    executable(plansPage),
    /setQueryData\(\s*\[\s*"subscription",\s*activeWorkspaceId\s*\],\s*null/,
    "the post-cancel cache is being set to null again",
  );
});

test("the plans page asks this module rather than re-deriving the state inline", () => {
  assert.match(plansPage, /describeSubscription/);
  // `status === "active"` is the comparison that produced the bug: it reads a scheduled
  // cancellation as no plan at all.
  assert.doesNotMatch(executable(plansPage), /subscription\??\.status === "active"/);
});

test("nothing calls the change-plan route, which does not exist in the billing service", () => {
  const billingService = readFileSync(
    new URL("../../../services/billing.service.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(executable(billingService), /change-plan/);
  assert.doesNotMatch(executable(billingService), /changeSubscription/);
  assert.doesNotMatch(executable(plansPage), /changeSubscription/);
});

test("the Stripe cancel-URL page does not call it either", () => {
  // It is a second, unslugged copy of this page — Stripe's configured cancel URL. Nothing in the
  // app links to it, which is exactly why it kept a dead call and a fabricated workspace id long
  // after both were fixed on the page people actually reach.
  const stripeReturnPage = readFileSync(
    new URL("../../../app/workspace/payment/plans/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(executable(stripeReturnPage), /changeSubscription/);
  // WT-370: the checkout metadata must carry a workspace id, never the buyer's own user id.
  assert.doesNotMatch(executable(stripeReturnPage), /workspaceId: user\.id/);
  assert.doesNotMatch(executable(stripeReturnPage), /const workspaceId = user\?\.id/);
  // The payment type the backend has no handler for: charged, invoiced, no credits granted.
  assert.doesNotMatch(executable(stripeReturnPage), /"CreditTopUp"/);
});
