/**
 * Which invoices get a Pay button, how a payment row reads, which payments the Invoices page
 * lists as attempts that did not go through, and the period an invoice's line items state.
 *
 * The server refuses a checkout for a paid, void or uncollectible invoice. Offering the button on
 * one of those hands an owner a click that can only fail, so the client rule is pinned to the
 * server's here.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  invoicePeriodOf,
  isInvoicePayable,
  isUnsuccessfulPayment,
  paymentMethodLabel,
  paymentStatusOf,
} from "../invoice-payment.ts";

const invoice = (overrides: Partial<{ status: string | null; paidAt: string | null; total: number }>) => ({
  status: "open",
  paidAt: null,
  total: 120,
  ...overrides,
});

test("an open or issued invoice with a balance is payable", () => {
  assert.equal(isInvoicePayable(invoice({ status: "open" })), true);
  assert.equal(isInvoicePayable(invoice({ status: "issued" })), true);
  assert.equal(isInvoicePayable(invoice({ status: null })), true);
});

test("a paid invoice is not payable, whichever field says so", () => {
  assert.equal(isInvoicePayable(invoice({ status: "paid" })), false);
  assert.equal(isInvoicePayable(invoice({ status: "open", paidAt: "2026-09-01T00:00:00Z" })), false);
});

test("void and uncollectible invoices are not owed", () => {
  assert.equal(isInvoicePayable(invoice({ status: "void" })), false);
  assert.equal(isInvoicePayable(invoice({ status: " Uncollectible " })), false);
});

test("a zero total has nothing to pay", () => {
  assert.equal(isInvoicePayable(invoice({ total: 0 })), false);
});

test("payment statuses map to the server vocabulary, unknowns pass through", () => {
  assert.deepEqual(paymentStatusOf("paid"), { label: "Paid", tone: "paid" });
  assert.deepEqual(paymentStatusOf("PENDING"), { label: "Pending", tone: "pending" });
  assert.deepEqual(paymentStatusOf("failed"), { label: "Failed", tone: "failed" });
  assert.deepEqual(paymentStatusOf("refunded"), { label: "Refunded", tone: "refunded" });
  assert.deepEqual(paymentStatusOf("subscription_updated"), { label: "Plan change", tone: "other" });
  assert.deepEqual(paymentStatusOf("partially_captured"), { label: "Partially captured", tone: "other" });
  assert.deepEqual(paymentStatusOf(null), { label: "Unknown", tone: "other" });
});

test("payment method reads the invoice rail and Stripe distinctly", () => {
  assert.equal(paymentMethodLabel("internal_invoice", "invoice"), "Invoice");
  assert.equal(paymentMethodLabel("stripe", "card"), "Card via Stripe");
  assert.equal(paymentMethodLabel("stripe", ""), "Stripe");
  assert.equal(paymentMethodLabel("", ""), "—");
});

test("only payments that did not go through are payment attempts", () => {
  assert.equal(isUnsuccessfulPayment("paid"), false);
  assert.equal(isUnsuccessfulPayment(" PAID "), false);
  for (const status of ["pending", "failed", "cancelled", "refunded", "disputed", "partially_captured"]) {
    assert.equal(isUnsuccessfulPayment(status), true, status);
  }
  // A plan change the webhook recorded is not a charge that failed.
  assert.equal(isUnsuccessfulPayment("subscription_updated"), false);
});

test("the line items the backend writes today carry no period", () => {
  // InvoiceMapper.CreateStripeInvoice
  assert.equal(invoicePeriodOf("[]"), null);
  // InvoiceMapper.CreateBillingCycleLineItems
  assert.equal(
    invoicePeriodOf(
      JSON.stringify([
        { type: "subscription", description: "Enterprise", quantity: 1, unitPrice: null, amount: 1900000 },
        { type: "overage", description: "Usage over committed credits", quantity: 0, unitPrice: 4, amount: 0 },
        { type: "usage_breakdown", chargeType: "STT", unit: "second", quantity: 60, creditsConsumed: 12 },
      ]),
    ),
    null,
  );
  // The phase-3 demo seed
  assert.equal(invoicePeriodOf('[{"name":"Contract base","amount":1000000}]'), null);
});

test("a stated period is read, and malformed input never throws", () => {
  const start = "2026-08-20T00:00:00Z";
  const end = "2026-09-20T00:00:00Z";
  assert.deepEqual(invoicePeriodOf(JSON.stringify([{ type: "subscription", periodStart: start, periodEnd: end }])), { start, end });
  assert.deepEqual(invoicePeriodOf(JSON.stringify([{ period_start: start, period_end: end }])), { start, end });
  assert.deepEqual(invoicePeriodOf(JSON.stringify({ period: { start, end } })), { start, end });
  assert.equal(invoicePeriodOf(JSON.stringify([{ periodStart: start }])), null);
  assert.equal(invoicePeriodOf(JSON.stringify([{ periodStart: "not a date", periodEnd: end }])), null);
  assert.equal(invoicePeriodOf("{not json"), null);
  assert.equal(invoicePeriodOf(""), null);
  assert.equal(invoicePeriodOf(null), null);
  assert.equal(invoicePeriodOf("null"), null);
  assert.equal(invoicePeriodOf("42"), null);
});
