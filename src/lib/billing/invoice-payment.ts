/**
 * Which invoices can be paid from the app, and how a payment row reads. Workspace Payments.
 *
 * Kept as plain functions so the two screens that ask — Invoices (the Pay button) and Payments
 * (the status column) — cannot drift into two opinions, and so the rules run under the node test
 * runner without a browser.
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
