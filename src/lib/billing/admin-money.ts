/**
 * Rendering an amount that states its own currency.
 *
 * Extracted because it is a decision with a wrong answer, not a formatting detail. The platform
 * prices in VND and in USD, and the two do not read the same way: "1.900.000,00 ₫" is noise —
 * VND has no minor unit and nobody writes one — while "$29" without its cents looks truncated.
 *
 * Deliberately free of React so `node:test` can exercise it without a renderer.
 */

export interface AdminMoneyLike {
  amount: number;
  currency: string;
}

/**
 * Currencies with no minor unit. VND is the one the platform actually sells in; the rest are here
 * because getting them wrong looks identical and costs nothing to prevent.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(["VND", "JPY", "KRW"]);

/**
 * One amount, formatted for its own currency.
 *
 * Falls back to `123 XYZ` for a currency `Intl` does not recognise rather than throwing: the
 * server owns this vocabulary, and a plan row with an unexpected currency code is still a real
 * subscription that must appear on the page.
 */
export function formatAdminMoney(money: AdminMoneyLike): string {
  const currency = money.currency.toUpperCase();
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(money.amount);
  } catch {
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(money.amount)} ${currency}`;
  }
}

/**
 * The recurring-revenue headline, which is a LIST because the server refuses to add currencies
 * together.
 *
 * An empty list means nothing is being paid for, and says so in words. Returning "0" would be
 * picking a currency to be zero of — the same invention the server declined to make.
 */
export function formatMonthlyRecurring(amounts: readonly AdminMoneyLike[]): string {
  if (amounts.length === 0) return "No paid subscriptions";
  return amounts.map(formatAdminMoney).join(" + ");
}

/**
 * What a single subscription is worth per month.
 *
 * `null` is not zero. A subscription inside its trial will be worth its full price next week, and
 * a cancelled one is worth nothing ever again — printing "0" for both would merge two facts that
 * an administrator reads differently.
 */
export function formatSubscriptionValue(
  money: AdminMoneyLike | null,
  reason: { isTrial: boolean; isCancelled: boolean },
): string {
  if (money) return formatAdminMoney(money);
  if (reason.isTrial) return "In trial";
  if (reason.isCancelled) return "Cancelled";
  // Active, not a trial, not cancelled, and still no value: the plan is priced at zero, which is
  // a real answer and a different one from "not applicable".
  return "—";
}
