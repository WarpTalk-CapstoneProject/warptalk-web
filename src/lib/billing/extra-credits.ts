/**
 * Extra credits — a top-up or a credit pack — are sold only on top of a live plan (backend#467).
 *
 * WHY
 *   Credits live on a subscription: every consumption path decrements the live subscription's
 *   balance, and a workspace with no plan cannot start a meeting at all (WT-515). Selling credits
 *   to a workspace with no live plan took the money and gave nothing usable for it — the payment
 *   handlers looked for the active subscription only after Stripe had charged the card.
 *
 *   The server now refuses the checkout with a 409 and PURCHASE_REQUIRES_SUBSCRIPTION_CODE before
 *   any Stripe session exists. This file is the web's half: the same liveness rule, so every
 *   purchase entry point is hidden in exactly the cases the server would refuse — a button that
 *   is shown and then refused is a worse screen than no button.
 *
 * THE RULE is the server's `Subscription.GrantsPlanEntitlements`: status active AND the period not
 * over. (Its third fact, `IsActive`, is implied — the endpoints these DTOs come from only ever
 * return the active row, and 404 otherwise.) It is deliberately stricter than
 * `hasPaidEntitlement`, which reads a status of "cancelled" as a plan running out its period:
 * the server does not sell credits on that row, so neither does the page.
 */

// A type-only import is erased, so the path alias is safe here even under node --test.
import type { CreditBalanceDto, SubscriptionDto } from "@/types/billing";

/** The server's code for "subscribe to a plan first" (409 on POST /payments/checkout). */
export const PURCHASE_REQUIRES_SUBSCRIPTION_CODE = "BILLING_PURCHASE_REQUIRES_SUBSCRIPTION";

function isLive(status: string | null | undefined, periodEnd: string | null | undefined, now: number): boolean {
  if (status?.toLowerCase() !== "active") return false;
  const end = periodEnd ? Date.parse(periodEnd) : Number.NaN;
  // An unparseable end is not evidence the plan has ended; the server has the final word.
  return Number.isNaN(end) || end >= now;
}

/** Whether this workspace may buy a top-up or a credit pack, from its active subscription. */
export function canBuyExtraCredits(
  subscription: Pick<SubscriptionDto, "status" | "currentPeriodEnd"> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!subscription) return false;
  return isLive(subscription.status, subscription.currentPeriodEnd, now);
}

/** The same question, answered from the balance endpoint (which also only serves the active row). */
export function balanceAllowsExtraCredits(
  balance: Pick<CreditBalanceDto, "status" | "currentPeriodEnd"> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!balance) return false;
  return isLive(balance.status, balance.currentPeriodEnd, now);
}

/** True when a failed checkout was refused because the workspace has no live plan. */
export function isPurchaseRequiresSubscription(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const data = (error as { response?: { data?: { code?: unknown; Code?: unknown } } }).response?.data;
  const code = data?.code ?? data?.Code;
  return code === PURCHASE_REQUIRES_SUBSCRIPTION_CODE;
}
