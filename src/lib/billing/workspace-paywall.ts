/**
 * Whether a workspace may be used at all. WT-515.
 *
 * WHAT WENT WRONG
 *   A workspace is created BEFORE Stripe opens — it has to be, `Subscription.WorkspaceId` is
 *   non-nullable and there is nothing to attach a subscription to until the row exists. WT-491
 *   made that ordering deliberate: plan grid, then name, then checkout, in one uninterrupted
 *   action. What nobody closed is what happens when the buyer presses Back on Stripe. They land
 *   in a finished, fully working workspace that has never been paid for, and every feature runs.
 *   Pressing Back was, in effect, the free tier.
 *
 * WHY A RULE AND NOT AN `if` IN THE LAYOUT
 *   A paywall has to get three separate things right, and the failure mode of each is severe in a
 *   different direction:
 *
 *     1. It must not lock the buyer out of the one page that can UNLOCK it. A paywall that also
 *        covers Billing is a workspace nobody can ever pay for.
 *     2. It must not fire while the answer is still unknown. Flashing a paywall over a paid
 *        workspace on every page load is worse than the bug it fixes.
 *     3. It must not fire because the BILLING SERVICE is down. "We cannot reach billing" and
 *        "this workspace has not paid" are different facts, and only one of them should stop
 *        anybody working. This is the same shape the server-side gate uses, where only a snapshot
 *        that POSITIVELY reports no live subscription denies (WorkspaceDirectoryService).
 *
 *   Three conditions with opposite failure directions is exactly the thing to state once, in a
 *   file that can be tested, rather than to assemble inline from a query's flags.
 */

// Relative, not "@/…": these are VALUE imports, and the contract tests run under node --test,
// which does not resolve the tsconfig path alias. A type-only alias import would be erased and
// would work; this one would not, and the failure is at test time rather than build time.
import { describeSubscription, hasPaidEntitlement } from "./subscription-state.ts";
import type { SubscriptionDto } from "@/types/billing";

/**
 * The server's code for "this workspace has no subscription".
 *
 * It arrives as a 400, not a 404, which is why the status alone cannot be read as the answer —
 * a 400 from a malformed request would look identical.
 */
export const NO_SUBSCRIPTION_CODE = "BILLING_SUBSCRIPTION_NOT_FOUND";

/**
 * Routes that stay open on an unpaid workspace, as path SEGMENTS after the slug.
 *
 * ONLY the payment flow. WT-570 narrowed this from `["settings", "payment"]`: the owner's
 * instruction is that creating a workspace stays allowed and an unpaid one is HELD ON THE PAYMENT
 * PAGE, and "held" is not true if the whole of Settings — account, profile, preferences,
 * member-roles — is browsable on the way there. `payment` alone is the smallest set that still
 * lets the workspace be paid for, because `/payment/plans` IS the checkout: it lists the plans and
 * opens the Stripe session itself, so nothing on the billing screens is needed to buy.
 */
const OPEN_SEGMENTS = ["payment"] as const;

/**
 * Where a buyer with no plan is sent, and kept. WT-570.
 *
 * Exported rather than written inline at the call site so that the page which must stay open
 * (OPEN_SEGMENTS) and the page we redirect TO cannot drift apart into a loop: this path's first
 * segment is `payment`, which the rule above holds exempt.
 */
export function paywallRedirectPath(workspaceSlug: string): string {
  return `/${workspaceSlug}/payment/plans`;
}

/** True when this path must remain reachable even with no plan. */
export function isPaywallExemptPath(pathname: string, workspaceSlug: string): boolean {
  const prefix = `/${workspaceSlug}/`;
  if (!pathname.startsWith(prefix)) return true;

  const rest = pathname.slice(prefix.length);
  const segment = rest.split("/")[0] ?? "";
  return (OPEN_SEGMENTS as readonly string[]).includes(segment);
}

export type PaywallDecision =
  /** The answer is not in yet. Render nothing rather than guessing in either direction. */
  | { kind: "checking" }
  /** Paid, or exempt, or unknowable — either way, get out of the way. */
  | { kind: "open" }
  /** Positively unpaid. */
  | { kind: "blocked" };

export function decidePaywall(input: {
  pathname: string;
  workspaceSlug: string;
  isLoading: boolean;
  subscription: SubscriptionDto | null | undefined;
  /**
   * The failure, if the subscription request failed. `code` is the server's error code — see
   * NO_SUBSCRIPTION_CODE, which is the only value that means "unpaid" rather than "unknown".
   */
  error?: { code?: string | null } | null;
  now?: number;
}): PaywallDecision {
  if (isPaywallExemptPath(input.pathname, input.workspaceSlug)) return { kind: "open" };
  if (input.isLoading) return { kind: "checking" };

  if (input.error) {
    // The ONLY error that is an answer. Everything else — a 500, a timeout, an expired token, a
    // billing service that is redeploying — is the absence of one, and must not lock a paying
    // workspace out of its own product.
    return input.error.code === NO_SUBSCRIPTION_CODE ? { kind: "blocked" } : { kind: "open" };
  }

  // No row at all reads the same as the error above: the workspace has never bought anything.
  if (!input.subscription) return { kind: "blocked" };

  // A scheduled cancellation is NOT unpaid — the plan is in force until the period ends, which is
  // the whole point of cancelling at period end. `hasPaidEntitlement` already draws that line and
  // is the same one the billing screens use, so the paywall cannot disagree with them.
  return hasPaidEntitlement(describeSubscription(input.subscription, input.now))
    ? { kind: "open" }
    : { kind: "blocked" };
}
