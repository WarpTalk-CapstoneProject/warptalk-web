import type { PlanDto } from "@/types/billing";

/**
 * What a plan costs, for the two places that have to agree about it.
 *
 * The yearly discount used to live as a bare `0.79` written twice inside the plans page — once
 * for the per-month figure on the card, once for the total handed to `createCheckoutSession`.
 * That was survivable while one screen owned both. It stops being survivable the moment a
 * SECOND screen quotes a price and a THIRD hands an amount to Stripe: the number the buyer read
 * and the number they are charged would be computed by different copies of the same arithmetic,
 * and nothing would fail loudly when one of them drifted.
 *
 * So the rule lives here, once, and both the grid and the create-then-pay path import it.
 */

/**
 * The yearly multiplier: pay for a year, pay 79% of twelve months.
 *
 * Deliberately the exact constant the plans page already used, so this refactor cannot move any
 * price. If marketing changes the discount, this is now the only line to change.
 */
export const YEARLY_PRICE_MULTIPLIER = 0.79;

/** The two cycles the UI offers. The API's own vocabulary — see BillingCycleResolver. */
export type BillingInterval = "monthly" | "yearly";

/**
 * The headline figure on a plan card: what this plan costs PER MONTH on the chosen cycle.
 *
 * Rounded, because it is a display figure. Never send this to Stripe — see `checkoutTotal`.
 */
export function monthlyDisplayPrice(plan: PlanDto, interval: BillingInterval): number {
  if (interval !== "yearly") {
    return plan.price;
  }

  // A plan whose own billingCycle is already yearly quotes a yearly price; discounting it again
  // would sell a year for 79% of a figure that was never twelve months to begin with.
  if (plan.billingCycle?.toLowerCase() === "yearly") {
    return plan.price;
  }

  return Math.round(plan.price * YEARLY_PRICE_MULTIPLIER);
}

/**
 * The amount actually charged for one billing period — the number that goes to Stripe.
 *
 * Unrounded on purpose: it is the product of twelve months and the discount, and rounding the
 * monthly figure first then multiplying gives a different total than the plans page has always
 * charged. Matching the existing behaviour matters more here than a tidier number.
 */
export function checkoutTotal(plan: PlanDto, interval: BillingInterval): number {
  return interval === "yearly"
    ? plan.price * 12 * YEARLY_PRICE_MULTIPLIER
    : plan.price;
}

/** The plans a buyer may choose from, in the order the platform wants them shown. */
export function selectablePlans(plans: PlanDto[]): PlanDto[] {
  return plans
    .filter((plan) => plan.isActive !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Read a billing interval off a URL, defaulting to monthly.
 *
 * The cycle travels with the plan slug from the plan grid to the create form, and an unknown or
 * missing value must not become a silent "yearly" — that would charge twelve months for a choice
 * nobody made.
 */
export function readBillingInterval(
  params: Pick<URLSearchParams, "get"> | null | undefined,
): BillingInterval {
  return params?.get("billingCycle")?.trim().toLowerCase() === "yearly" ? "yearly" : "monthly";
}

/**
 * The currency to charge a plan in — the plan's own, never a constant. WT-518.
 *
 * WT-459 fixed the half of this that is visible: the plan CARD reads `plan.currency`, so a plan
 * priced at 200 USD stopped rendering as "200 VND". What it did not touch was the checkout call
 * three lines away, which hardcoded `currency: "vnd"` at all three call sites. The buyer read USD
 * and was charged VND — 200 VND instead of 200 USD, about four orders of magnitude out — and then
 * the success page and the invoice both said "200 VND", because both read the currency back off
 * the Stripe session that was created with the wrong one. Nothing in that chain was lying; every
 * screen faithfully reported the currency the checkout had chosen.
 *
 * Lowercased because that is Stripe's own vocabulary and what `PaymentConstants.Currencies` holds.
 * The server already handles the minor-unit difference — VND is zero-decimal and passes through,
 * everything else is multiplied by 100 (StripePaymentService) — so sending the true currency is
 * the whole fix on this side.
 *
 * Defaults to VND for a purchase with no plan behind it. That is not a guess: the only such
 * purchase is a credit top-up, which the server prices itself against `credit_value_vnd`.
 */
export function checkoutCurrency(plan?: Pick<PlanDto, "currency"> | null): string {
  const currency = plan?.currency?.trim();
  return currency ? currency.toLowerCase() : "vnd";
}
