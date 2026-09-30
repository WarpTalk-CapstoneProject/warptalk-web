/**
 * Which invoices can be paid from the app, and how a payment row reads. Workspace Payments.
 *
 * Kept as plain functions so the rules run under the node test runner without a browser. Payments
 * was merged into Invoices on 2026-09-17, so there is one screen asking now — the Pay button, the
 * payment-attempts list and the period column all read from here.
 *
 * THE PAYABLE RULE MIRRORS THE SERVER, IT DOES NOT REPLACE IT
 *   InvoiceService.CreateInvoiceCheckoutSessionAsync refuses a paid, void or uncollectible
 *   invoice, and refuses anyone who is not an Owner of the invoice's workspace. The button follows
 *   the same rule so an owner is never offered a click the API will answer with a 400; the API
 *   stays the authority.
 */

/** The invoice fields this rule reads. `InvoiceDto` satisfies it. */
export type PayableInvoiceLike = {
  status?: string | null;
  paidAt: string | null;
  total: number;
};

/** Statuses the server will not open a checkout for, besides paid. */
const NOT_OWED = new Set(["void", "uncollectible"]);

/**
 * True when an invoice is still owed and has something to pay.
 *
 * `paidAt` wins over `status`: the webhook stamps both, but a row repaired by hand has been seen
 * with one and not the other, and a paid invoice offered for payment again is the worse mistake.
 * A zero total is not payable either — Stripe rejects a zero-amount checkout.
 */
export function isInvoicePayable(invoice: PayableInvoiceLike): boolean {
  if (invoice.paidAt) return false;
  const status = (invoice.status ?? "").trim().toLowerCase();
  if (status === "paid" || NOT_OWED.has(status)) return false;
  return invoice.total > 0;
}

export type PaymentTone = "paid" | "pending" | "failed" | "refunded" | "other";

/**
 * A payment's status as a label and a tone.
 *
 * The server's vocabulary is `pending | paid | failed | cancelled | refunded | disputed |
 * subscription_updated` (PaymentConstants.PaymentStatuses). Anything unrecognised is shown as the
 * server wrote it, capitalised, rather than guessed into one of the known buckets.
 */
export function paymentStatusOf(status: string | null | undefined): {
  label: string;
  tone: PaymentTone;
} {
  const value = (status ?? "").trim().toLowerCase();
  switch (value) {
    case "paid":
      return { label: "Paid", tone: "paid" };
    case "pending":
      return { label: "Pending", tone: "pending" };
    case "failed":
      return { label: "Failed", tone: "failed" };
    case "cancelled":
      return { label: "Cancelled", tone: "other" };
    case "refunded":
      return { label: "Refunded", tone: "refunded" };
    case "disputed":
      return { label: "Disputed", tone: "failed" };
    case "subscription_updated":
      return { label: "Plan change", tone: "other" };
    case "":
      return { label: "Unknown", tone: "other" };
    default:
      return {
        label: value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " "),
        tone: "other",
      };
  }
}

/**
 * How a payment was made, for the secondary line. `internal_invoice` is the invoice rail (money
 * owed, not yet collected); everything else is the provider's own name.
 */
export function paymentMethodLabel(provider: string | null | undefined, method: string | null | undefined): string {
  const p = (provider ?? "").trim().toLowerCase();
  const m = (method ?? "").trim().toLowerCase();
  if (p === "internal_invoice" || m === "invoice") return "Invoice";
  if (p === "stripe") return m === "card" ? "Card via Stripe" : "Stripe";
  if (m) return m.charAt(0).toUpperCase() + m.slice(1);
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : "—";
}

/**
 * True for a payment that did NOT go through: pending, failed, cancelled, refunded, disputed, or a
 * status the client does not know. The Invoices page lists only these, because a paid payment is
 * already visible as the invoice it settled.
 *
 * `subscription_updated` is excluded although its tone is not "paid": it is the row the Stripe
 * webhook writes when a plan changes (StripeWebhookService, customer.subscription.updated) — a
 * record of a change, not an attempt at a charge that failed.
 */
export function isUnsuccessfulPayment(status: string | null | undefined): boolean {
  const value = (status ?? "").trim().toLowerCase();
  if (value === "subscription_updated") return false;
  return paymentStatusOf(value).tone !== "paid";
}

/** The service period an invoice covers, as ISO strings. */
export type InvoicePeriod = { start: string; end: string };

const START_KEYS = ["periodStart", "period_start", "servicePeriodStart", "service_period_start"];
const END_KEYS = ["periodEnd", "period_end", "servicePeriodEnd", "service_period_end"];

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function periodIn(node: unknown): InvoicePeriod | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const record = node as Record<string, unknown>;
  const nested = record.period;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
    const start = validDate(inner.start);
    const end = validDate(inner.end);
    if (start && end) return { start, end };
  }
  const start = START_KEYS.map((key) => validDate(record[key])).find(Boolean) ?? null;
  const end = END_KEYS.map((key) => validDate(record[key])).find(Boolean) ?? null;
  return start && end ? { start, end } : null;
}

/**
 * The period an invoice's `lineItems` states, or null.
 *
 * `lineItems` is a JSON-encoded string. What the backend writes today carries NO period:
 *   - Stripe checkout invoices (InvoiceMapper.CreateStripeInvoice): `"[]"`.
 *   - Billing-cycle invoices (InvoiceMapper.CreateBillingCycleLineItems): an array of
 *     `{type: "subscription"|"overage", description, quantity, unitPrice, amount}` followed by
 *     `{type: "usage_breakdown", chargeType, unit, quantity, creditsConsumed}` rows.
 *   - The phase-3 demo seed: `[{name, amount}, {name, quantity, unit_price, amount}]`.
 * So this returns null for every invoice in production, and the page shows "—". It reads the
 * obvious spellings (an object or any array element with `periodStart`/`periodEnd`, snake_case,
 * or `period: {start, end}`) so the column fills the day the server starts writing one, and it
 * never throws on malformed input. The period is not guessed from `issuedAt`: a closing invoice
 * is issued at the END of the cycle it bills, and a checkout invoice at the START of the one it
 * buys, so any single guess is wrong for one of them.
 */
export function invoicePeriodOf(lineItems: string | null | undefined): InvoicePeriod | null {
  if (typeof lineItems !== "string" || lineItems.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(lineItems);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const period = periodIn(item);
      if (period) return period;
    }
    return null;
  }
  return periodIn(parsed);
}
