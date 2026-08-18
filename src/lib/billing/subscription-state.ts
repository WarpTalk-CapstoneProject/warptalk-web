/**
 * What a workspace's subscription actually is right now, in one answer.
 *
 * WT-381 — THE BUG THIS EXISTS TO STOP
 *   After "Cancel renewal", the plans page wrote `null` into the subscription cache. The backend
 *   had done nothing of the sort: `Cancel()` sets `AutoRenew=false` and `Status=cancelled` and
 *   deliberately leaves `IsActive=true`, and `GetActiveSubscriptionAsync` filters on `IsActive`
 *   alone — so the workspace still has Enterprise, and a refetch would say so. The owner was shown
 *   a workspace with no plan, on a plan they had paid for through to the end of the month.
 *
 *   Nulling the cache was only half of it. Two renders asked `status === "active"` and read a
 *   `false` as "no plan": the toolbar summary said "No active plan on this workspace", and the
 *   Cancel-renewal control disappeared. Fixing the cache alone would have moved the same lie from
 *   the cache into the markup, so the question is answered once, here.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   The 15-day export grace and the workspace lock/soft-delete that WT-381 also describes. Neither
 *   exists in the backend: `SubscriptionExpirationWorker` sets `IsActive=false` at the period end
 *   and the row stops being returned at all, which lands here as `none`. Inventing the states now
 *   would have this file describe a lifecycle the product does not implement — the same class of
 *   fiction it was written to remove. They belong with the worker that creates them.
 */

import type { SubscriptionDto } from "@/types/billing";

export type SubscriptionState =
  /** No subscription, or one whose period ended and which the backend has stopped returning. */
  | { kind: "none" }
  /** Paid, renewing. */
  | { kind: "active"; planName: string; renewsOn: Date }
  /** Renewal cancelled; the plan is still fully in force until `endsOn`. */
  | { kind: "cancellation-scheduled"; planName: string; endsOn: Date }
  /**
   * The paid period is over and the row has not been expired yet.
   *
   * `SubscriptionExpirationWorker` runs on a timer, so there is a window in which the API still
   * returns a subscription whose `currentPeriodEnd` is in the past. Without this the page would
   * offer to keep a plan "until 12 August" on the 14th.
   */
  | { kind: "lapsed"; planName: string; endedOn: Date };

/** A `cancelAtPeriodEnd` that is missing or malformed must not read as "still renewing". */
function renewalIsCancelled(subscription: SubscriptionDto): boolean {
  return (
    subscription.cancelAtPeriodEnd === true ||
    subscription.autoRenew === false ||
    subscription.status?.toLowerCase() === "cancelled"
  );
}

export function describeSubscription(
  subscription: SubscriptionDto | null | undefined,
  now: number = Date.now(),
): SubscriptionState {
  if (!subscription) return { kind: "none" };

  const periodEnd = new Date(subscription.currentPeriodEnd);
  // An unparseable date is not a reason to claim the plan has lapsed — that would revoke, on
  // screen, a plan the workspace still holds. Fall back to what the flags say.
  const endsAt = Number.isNaN(periodEnd.getTime()) ? null : periodEnd;
  const planName = subscription.planName || "your plan";

  if (endsAt && endsAt.getTime() <= now) {
    return { kind: "lapsed", planName, endedOn: endsAt };
  }

  if (renewalIsCancelled(subscription)) {
    return {
      kind: "cancellation-scheduled",
      planName,
      endsOn: endsAt ?? new Date(now),
    };
  }

  return { kind: "active", planName, renewsOn: endsAt ?? new Date(now) };
}

/**
 * Whether the workspace is entitled to its paid features right now.
 *
 * A scheduled cancellation is NOT a loss of entitlement — that is the whole point of cancelling at
 * period end, and the backend keeps `IsActive=true` to say so.
 */
export function hasPaidEntitlement(state: SubscriptionState): boolean {
  return state.kind === "active" || state.kind === "cancellation-scheduled";
}

/** Whether "Cancel renewal" is a thing the owner can still do. */
export function canCancelRenewal(state: SubscriptionState): boolean {
  return state.kind === "active";
}
