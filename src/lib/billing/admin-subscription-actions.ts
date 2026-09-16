/**
 * Which lifecycle button a row in the admin subscription directory offers.
 *
 * THE BUG THIS EXISTS TO STOP
 *   The row offered "Resume" whenever `cancelledAt` was set, and that button called `/resume`.
 *   Both halves were wrong:
 *
 *   - `/resume` lifts an AI-service SUSPENSION (`ServiceState = suspended`). On a subscription
 *     whose renewal was cancelled it answers "AI service is not suspended" — true, and not what
 *     anyone asked. Undoing a cancellation is `/reactivate`.
 *   - A paid cancellation (`Cancel()`) sets `AutoRenew=false` and `Status=cancelled` and leaves
 *     `CancelledAt` NULL and `IsActive` true. `CancelledAt` is only stamped where the row stops
 *     being live: a trial ended through `CancelImmediately`, or a row superseded by a new plan.
 *     So `cancelledAt != null` picked exactly the rows `/reactivate` refuses, while the rows it
 *     accepts were shown "Cancel" — which then refused as "already cancelled".
 *
 * The rules below mirror `SubscriptionService`: Cancel needs a renewing live row; Reactivate needs
 * a live row with renewal off whose paid period has not ended. Everything else gets no button,
 * because the endpoint would refuse it.
 *
 * Suspension is a separate axis and is NOT decided here. A row can be cancelled and suspended at
 * once; "Resume service" belongs to the workspace Billing tab.
 */

import type { AdminSubscriptionSummaryDto } from "@/types/admin-subscription";

export type AdminSubscriptionRowAction = "cancel" | "reactivate" | null;

type RowFields = Pick<
  AdminSubscriptionSummaryDto,
  "status" | "autoRenew" | "cancelledAt" | "currentPeriodEnd"
>;

/** No longer the workspace's live subscription: expired, trial ended, or superseded. */
export function isEndedSubscription(row: RowFields): boolean {
  return row.status === "expired" || row.cancelledAt != null;
}

/** Renewal switched off on a live row — the paid period still runs. */
export function isRenewalCancelled(row: RowFields): boolean {
  return !isEndedSubscription(row) && (!row.autoRenew || row.status === "cancelled");
}

export function adminSubscriptionRowAction(
  row: RowFields,
  now: number = Date.now(),
): AdminSubscriptionRowAction {
  if (isEndedSubscription(row)) return null;

  if (isRenewalCancelled(row)) {
    const periodEnd = Date.parse(row.currentPeriodEnd);
    // The server refuses once the period is over ("choose a plan" is a checkout, not a toggle).
    // An unparseable date is left to the server to judge rather than hiding the only way back.
    if (!Number.isNaN(periodEnd) && periodEnd <= now) return null;
    return "reactivate";
  }

  return "cancel";
}
