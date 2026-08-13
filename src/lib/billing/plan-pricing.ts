/**
 * What a plan costs, per interval — the one place the arithmetic lives.
 *
 * This was inline in the plans page and has been wrong twice. `plan.price` is a price for one
 * `plan.billingCycle`, and migration 047 constrains that column to ('monthly','yearly'), so
 * both shapes are storable and the cycle has to be read. A rewrite that assumed every price
 * was monthly showed an annual plan at `price * 0.79` labelled "/mo" and sent
 * `price * 12 * 0.79` to Stripe Checkout — roughly 9.5x the real price.
 *
 * Two numbers come out of here and they are not interchangeable:
 *   - `displayPricePerMonth` is what the big number shows. Always per month, so switching the
 *     interval tab compares like with like.
 *   - `checkoutTotal` is what is actually charged, once, for the chosen interval.
 */

/** 21% off, the figure the interval tab advertises. One constant so the two cannot drift. */
export const YEARLY_DISCOUNT_MULTIPLIER = 0.79;

export type BillingInterval = "monthly" | "yearly";

/** Only the fields the arithmetic reads, so callers can pass a PlanDto or a fixture. */
export interface PlanPricingInput {
  price: number;
  billingCycle?: string | null;
}

export interface PlanPricing {
  /** Headline figure, per month, for the chosen interval. */
  displayPricePerMonth: number;
  /** The amount to charge now for the chosen interval. */
  checkoutTotal: number;
  /** True when `plan.price` is already an annual figure. */
  isYearlyPriced: boolean;
}

export function isYearlyPricedPlan(plan: PlanPricingInput): boolean {
  return plan.billingCycle?.toLowerCase() === "yearly";
}

/**
 * A plan's price for one month, whatever cycle it is stored in.
 *
 * A yearly-priced plan divides down rather than being treated as a monthly figure, which is
 * the substitution that produced the 12x.
 */
export function monthlyPriceOf(plan: PlanPricingInput): number {
  return isYearlyPricedPlan(plan) ? Math.round(plan.price / 12) : plan.price;
}

/**
 * A plan's price for one year.
 *
 * A yearly-priced plan is already that number and must NOT be discounted again — its stored
 * price is the negotiated annual price, not a monthly rate awaiting the 21% off.
 */
export function yearlyTotalOf(plan: PlanPricingInput): number {
  return isYearlyPricedPlan(plan)
    ? plan.price
    : Math.round(plan.price * 12 * YEARLY_DISCOUNT_MULTIPLIER);
}

export function getPlanPricing(
  plan: PlanPricingInput | null | undefined,
  interval: BillingInterval,
): PlanPricing {
  if (!plan) {
    return { displayPricePerMonth: 0, checkoutTotal: 0, isYearlyPriced: false };
  }

  const isYearlyPriced = isYearlyPricedPlan(plan);
  if (interval === "yearly") {
    const total = yearlyTotalOf(plan);
    return {
      displayPricePerMonth: Math.round(total / 12),
      checkoutTotal: total,
      isYearlyPriced,
    };
  }

  const monthly = monthlyPriceOf(plan);
  return {
    displayPricePerMonth: monthly,
    checkoutTotal: monthly,
    isYearlyPriced,
  };
}
