# Workspace Billing: plans pages and renewal

Short notes for the plan-purchase surfaces around Settings → Billing (WT-878). The Billing page
itself lives in `src/app/(app)/[workspaceSlug]/settings/billing/**`.

## Pages

| Route | File | Notes |
| --- | --- | --- |
| `/{slug}/payment/plans` | `src/app/(app)/[workspaceSlug]/payment/plans/page.tsx` | Plan picker + "Cancel renewal" with a reason picker. |
| `/workspace/payment/plans` | `src/app/workspace/payment/plans/page.tsx` | Production Stripe cancel URL (`Stripe__CancelUrl`). Never move, rename or delete it; see its header comment and `test:production-billing`. |
| Activation landing | `src/components/workspace/workspace-activation-landing.tsx` | Plans shown to a workspace with no plan. |

## Yearly saving

Every "Yearly · save N%" label reads `yearlySavingPercent()` from `src/lib/billing/plan-pricing.ts`
(derived from `YEARLY_PRICE_MULTIPLIER`), never a literal. This includes the activation landing
(fixed in WT-878 t7).

## Cancelling renewal

Both plans pages cancel with `billingService.setAutoRenew(workspaceId, false)` (`PUT /auto-renew`),
the same call as the Manage modal (`settings/billing/components/manage-subscription-modal.tsx`)
and the Auto-renew row:

- The plan runs to its period end; Stripe's `cancel_at_period_end` follows. The subscription DTO's
  `cancelAtPeriodEnd` is `!autoRenew`, so the pages' "scheduled to cancel" notices still apply.
- Toasts come from `settingsBilling.autoRenew`: `turnedOff` (with the period end date),
  `requiresCheckout` on `BILLING_AUTO_RENEW_REQUIRES_CHECKOUT`, `toggleFailed` otherwise.
- Queries `["subscription", workspaceId]` and `["billing"]` are invalidated.
- The legacy `billingService.cancelSubscription` (`DELETE /subscriptions/workspace/{id}`) is no
  longer called from these pages; it ended entitlements mid-period. The method itself is kept.
- `/{slug}/payment/plans` keeps its cancel-reason picker; `PUT /auto-renew` takes no reason, so the
  choice is only logged to the browser console.
