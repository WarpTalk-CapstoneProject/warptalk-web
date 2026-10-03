/**
 * The one way money is rendered.
 *
 * Two things this exists to prevent, both of which were live in the billing screens:
 *
 *  1. **Vietnamese output in an English UI.** Amounts were formatted with an explicit
 *     "vi-VN" locale and suffixed with "đ", so an English invoice read "90.000đ".
 *
 *  2. **An ambient locale deciding what a number means.** `Number.toLocaleString()` with no
 *     locale argument follows whatever locale the runtime happens to be in. Under vi-VN the
 *     group separator is "." and the decimal separator is ",", so the same amount renders
 *     "90.000" here and "90,000" there — and 0.006575 renders "0,006575", which an English
 *     reader parses as a completely different number. The locale is pinned here so the
 *     rendering never depends on the machine.
 *
 * Precision is preserved rather than rounded to a currency's usual minor units: a fractional
 * amount keeps its digits instead of being rounded away to "0". Per-credit rates really are
 * sub-cent values (a credit is worth about $0.00015).
 *
 * USD is the accounting currency (since 2 Oct 2026) and the default when none is named. VND is
 * still a currency things can be sold in and old payments were taken in; it has no minor unit.
 */

/** Pinned so output never depends on the host's locale. */
const MONEY_LOCALE = "en-US";

/** Enough for a per-credit rate like 0.006575 without inventing digits on whole amounts. */
const MAX_FRACTION_DIGITS = 6;

/** The accounting currency: what an amount is in when nothing says otherwise. */
export const DEFAULT_CURRENCY = "USD";

/** Currencies with no minor unit: whole numbers print with no decimals. */
const ZERO_DECIMAL_CURRENCIES = new Set(["VND", "JPY", "KRW"]);

export function formatAmount(amount: number, minimumFractionDigits = 0): string {
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits,
    maximumFractionDigits: Math.max(
      minimumFractionDigits,
      Number.isInteger(amount) ? 0 : MAX_FRACTION_DIGITS,
    ),
  }).format(amount);
}

/**
 * An amount with its currency code, e.g. `29.00 USD`, `90,000 VND`, `0.000152 USD`.
 *
 * The code is always spelled out rather than shown as a symbol: "đ" is Vietnamese, and a
 * bare symbol next to an English amount is exactly the mix this replaced. A currency with cents
 * always shows them ("79.60", not "79.6"), and keeps more digits only when the amount has them.
 */
export function formatMoney(amount: number, currency?: string | null): string {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  const cents = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  return `${formatAmount(amount, cents)} ${code}`;
}
