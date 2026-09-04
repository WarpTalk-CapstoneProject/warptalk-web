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

/**
 * The currency the checkout is denominated in — the other half of `checkoutTotal`.
 *
 * WT-518: a 200 USD plan showed "200 VND" on the success page and on the invoice. Nothing
 * downstream was wrong — both read the currency back off the Stripe session, which had been
 * created with the wrong one. WT-459 had already fixed the visible half (the plan card reads
 * `plan.currency`), but every checkout call site still sent a literal `"vnd"` a few lines away,
 * so the buyer was quoted in one currency and charged in another.
 *
 * It lives beside `checkoutTotal` for the same reason that function exists: an amount and its
 * denomination are one decision, and splitting them across two files is how they drifted.
 *
 * Defaults to VND when there is no plan, which is correct rather than merely safe — the only
 * plan-less purchase is a credit top-up, priced server-side against `credit_value_vnd`.
 *
 * The server has always handled the rest: `StripePaymentService` passes VND through as a
 * zero-decimal currency and multiplies everything else by 100. It was simply never asked to.
 */
export function checkoutCurrency(plan?: PlanDto | null): string {
  return (plan?.currency ?? "vnd").toLowerCase();
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
