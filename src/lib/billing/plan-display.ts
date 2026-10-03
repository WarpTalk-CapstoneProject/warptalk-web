/**
 * How a plan's price is written on a plan card, and what it costs once VAT is added.
 *
 * A plan card is not an invoice. `formatMoney` always prints cents ("500.00 USD") because a ledger
 * line must; on the homepage and the plan ladder that read as noise, and the owner asked for it gone
 * (3 Oct 2026). A whole price prints whole ("500 USD"); a price that has cents keeps both digits
 * ("79.60 USD"), never "79.6".
 *
 * VAT (owner decision, 3 Oct 2026): prices are stored WITHOUT VAT and one platform-wide rate is added
 * at Stripe checkout. The rate comes from GET /plans/tax so a card prints the number checkout will
 * actually charge.
 */
import { DEFAULT_CURRENCY, formatAmount } from "../format/currency.ts";

const ZERO_DECIMAL_CURRENCIES = new Set(["VND", "JPY", "KRW"]);

function minorDigits(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

export function formatPlanPrice(amount: number, currency?: string | null): string {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  const whole = Number.isFinite(amount) && Math.round(amount * 100) % 100 === 0;
  return `${formatAmount(amount, whole ? 0 : minorDigits(code))} ${code}`;
}

/** The amount Stripe charges for `amount` with an exclusive VAT of `vatPercent`, rounded as Stripe does. */
export function priceWithVat(amount: number, vatPercent: number, currency?: string | null): number {
  if (!Number.isFinite(amount) || !Number.isFinite(vatPercent) || vatPercent <= 0) return amount;
  const factor = 10 ** minorDigits((currency || DEFAULT_CURRENCY).toUpperCase());
  return Math.round(amount * (1 + vatPercent / 100) * factor) / factor;
}
