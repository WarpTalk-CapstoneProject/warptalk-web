/**
 * Which invoices get a Pay button, and how a payment row reads. Workspace Payments.
 *
 * The server refuses a checkout for a paid, void or uncollectible invoice. Offering the button on
 * one of those hands an owner a click that can only fail, so the client rule is pinned to the
 * server's here.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isInvoicePayable, paymentMethodLabel, paymentStatusOf } from "../invoice-payment.ts";

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
