/**
 * What WarpBot is told about the workspace Billing page the owner has open.
 *
 * Same mechanism as the Insights tabs (see insights/assistant-snapshot.ts): the page has already
 * read the balance, the subscription, the overage setting, the kept credits and the renewal status
 * with the owner's own token, so what it prints is handed to WarpBot as page context instead of
 * behind a tool.
 *
 * THE RULES IT KEEPS
 *   - A source that did not answer (`undefined`) has no key, so WarpBot says it does not know
 *     rather than reading a missing figure as 0 or "off". `null` is an answer: no plan.
 *   - Facts about the account only. No card brand or digits, no Stripe ids, no failure text from the
 *     payment provider: whether a card exists and whether a charge failed is all WarpBot needs.
 *   - No comma inside a value, and none of the keys the widget's pill reads (see snapshot-text.ts).
 */

import type {
  CreditBalanceDto,
  FrozenCreditsDto,
  PlanDto,
  RecurringBillingStatusDto,
  SubscriptionDto,
  WorkspaceOverageSettingDto,
} from "../../types/billing.ts";
import { creditsRemainingView } from "./insights/overview-metrics.ts";
import { dayOf, plain, projectionText, whole } from "./insights/snapshot-text.ts";

export interface BillingSnapshotInput {
  /** `null` = the workspace has no plan; `undefined` = not read. */
  balance: CreditBalanceDto | null | undefined;
  subscription: SubscriptionDto | null | undefined;
  /** The plan the subscription is on, when the plan list could place it. */
  plan: Pick<PlanDto, "currency" | "maxParticipants" | "maxLanguages"> | null | undefined;
  /** How it is billed, from the page's own reading of the period length. */
  interval: "monthly" | "yearly" | null;
  overage: WorkspaceOverageSettingDto | undefined;
  frozen: FrozenCreditsDto | undefined;
  recurring: RecurringBillingStatusDto | undefined;
  canBuyExtraCredits: boolean;
  nowMs: number;
}

const money = (amount: number, currency: string | null | undefined) =>
  `${Math.round(amount * 100) / 100}${currency ? ` ${plain(currency)}` : ""}`;

export function billingAssistantSnapshot(input: BillingSnapshotInput): Record<string, string> {
  const { balance, subscription, plan, overage, frozen, recurring } = input;
  const out: Record<string, string> = {};

  if (subscription === null || (subscription === undefined && balance === null)) {
    out.plan = "no plan";
  } else if (subscription) {
    const ends = dayOf(subscription.currentPeriodEnd);
    out.plan = `${plain(subscription.planName)}; ${subscription.cancelAtPeriodEnd ? "ends" : "renews"}${ends ? ` ${ends}` : ""}`;
    const currency = subscription.planCurrency ?? plan?.currency;
    out.plan_price = `${money(subscription.price, currency)} per ${input.interval === "yearly" ? "year" : input.interval === "monthly" ? "month" : "billing cycle"}`;
    if (plan) out.plan_limits = `up to ${plan.maxParticipants} participants and ${plan.maxLanguages} languages per meeting`;
    out.auto_renew = subscription.autoRenew && !subscription.cancelAtPeriodEnd ? "on" : "off";
    out.can_buy_extra_credits = input.canBuyExtraCredits ? "yes" : "no: it needs a live plan";
  }

  if (balance) {
    const view = creditsRemainingView(balance);
    out.credits_remaining =
      view.percentLeft === null ? String(view.remaining) : `${view.remaining} of ${view.available} (${view.percentLeft}% left)`;
    out.credits_used_this_cycle = whole(balance.creditsUsedThisCycle);
    out.credits_projection = projectionText(balance, input.nowMs);
    const cycle = `${dayOf(balance.currentPeriodStart) ?? "?"} to ${dayOf(balance.currentPeriodEnd) ?? "?"}`;
    out.billing_cycle = cycle;
  }

  if (overage) {
    out.overages = overage.enabled
      ? `on; cap ${whole(overage.effectiveCapCredits)} credits; ${whole(overage.overageCreditsThisCycle)} used this cycle`
      : `off; the plan allows up to ${whole(overage.planCapCredits)} credits if turned on`;
  }

  if (frozen && frozen.frozenCredits > 0) {
    out.credits_kept_from_previous_plan = whole(frozen.frozenCredits);
  }
  if (subscription === null && frozen?.lastPlanName) {
    const ended = dayOf(frozen.lastEndedAt);
    out.last_plan = `${plain(frozen.lastPlanName)}${ended ? `; ended ${ended}` : ""}`;
  }

  if (recurring) {
    // The renewal row on the page reads this query, so it wins over the subscription row.
    if (subscription) out.auto_renew = recurring.autoRenew ? "on" : "off";
    out.renewal_mode = recurring.renewalMode === "stripe" ? "card charged automatically" : recurring.renewalMode === "invoice" ? "invoice" : "none";
    out.card_on_file = recurring.card ? "yes" : "no";
    const next = dayOf(recurring.nextChargeAt);
    if (next && recurring.nextChargeAmount !== null) {
      out.next_charge = `${money(recurring.nextChargeAmount, recurring.nextChargeCurrency)} on ${next}`;
    }
    if (recurring.paymentFailed) {
      const failed = dayOf(recurring.paymentFailedAt);
      const grace = dayOf(recurring.paymentGraceEndsAt);
      out.payment_failed = `yes${failed ? ` on ${failed}` : ""}${grace ? `; the plan keeps running until ${grace}` : ""}`;
    } else {
      out.payment_failed = "no";
    }
  }

  return out;
}
