import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONTRACT_TERMS_KEYS,
  canMarkInvoicePaid,
  describeContractTermsChanges,
  draftFromSubscription,
  invoiceConfirmationMatches,
  isInvoiceOverdue,
  parseContractTermsDraft,
  spellMoney,
  termsFromSubscription,
  type ContractTermsValues,
} from "../contract-billing.ts";

const stored = {
  // Effective values present on the DTO must never leak into the draft.
  effectiveContractPriceVnd: 5_000_000,
  effectiveCreditsPerCycle: 900,
  contractPriceVnd: 12_000_000,
  creditsPerCycleOverride: 2_000,
  overageCapCreditsOverride: 500,
  overagePricePerCreditOverride: 7_500,
  invoiceTermsDaysOverride: 30,
  billingContactEmail: "finance@acme.vn",
};

describe("contract terms draft", () => {
  it("covers every key the request carries", () => {
    const sample: Record<keyof ContractTermsValues, true> = {
      creditsPerCycleOverride: true,
      contractPriceVnd: true,
      overageCapCreditsOverride: true,
      overagePricePerCreditOverride: true,
      invoiceTermsDaysOverride: true,
      billingContactEmail: true,
    };
    assert.deepEqual([...CONTRACT_TERMS_KEYS].sort(), Object.keys(sample).sort());
  });

  it("round-trips the stored overrides unchanged, so a no-edit save resets nothing", () => {
    // PUT /contract-terms replaces all six. This is the property that keeps five of them alive
    // when an admin edits the sixth.
    const parsed = parseContractTermsDraft(draftFromSubscription(stored));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok && parsed.terms, {
      creditsPerCycleOverride: 2_000,
      contractPriceVnd: 12_000_000,
      overageCapCreditsOverride: 500,
      overagePricePerCreditOverride: 7_500,
      invoiceTermsDaysOverride: 30,
      billingContactEmail: "finance@acme.vn",
    });
  });

  it("seeds from overrides, never from effective values", () => {
    const source = { effectiveContractPriceVnd: 5_000_000, contractPriceVnd: null };
    const draft = draftFromSubscription(source);
    assert.equal(draft.contractPriceVnd, "");
  });

  it("treats blank as the plan default and a typed zero cap as zero", () => {
    const draft = { ...draftFromSubscription(null), overageCapCreditsOverride: "0" };
    const parsed = parseContractTermsDraft(draft);
    assert.ok(parsed.ok);
    assert.equal(parsed.terms.contractPriceVnd, null);
    assert.equal(parsed.terms.overageCapCreditsOverride, 0);
  });

  it("accepts thousands separators in amounts", () => {
    const parsed = parseContractTermsDraft({ ...draftFromSubscription(null), contractPriceVnd: "12,000,000" });
    assert.ok(parsed.ok);
    assert.equal(parsed.terms.contractPriceVnd, 12_000_000);
  });

  it("refuses what the server refuses", () => {
    const base = draftFromSubscription(null);
    for (const bad of [
      { creditsPerCycleOverride: "0" },
      { creditsPerCycleOverride: "1.5" },
      { contractPriceVnd: "-1" },
      { contractPriceVnd: "100.5" },
      { overageCapCreditsOverride: "-3" },
      { invoiceTermsDaysOverride: "0" },
      { billingContactEmail: "not-an-email" },
      { creditsPerCycleOverride: "100", overageCapCreditsOverride: "101" },
    ]) {
      assert.equal(parseContractTermsDraft({ ...base, ...bad }).ok, false, JSON.stringify(bad));
    }
  });
});

describe("describeContractTermsChanges", () => {
  it("lists only what moves, with VND spelled out", () => {
    const before = termsFromSubscription(stored);
    const after = { ...before, contractPriceVnd: 15_000_000, billingContactEmail: null };
    const changes = describeContractTermsChanges(before, after);
    assert.deepEqual(
      changes.map((change) => [change.key, change.from, change.to]),
      [
        ["contractPriceVnd", "₫12,000,000 (VND)", "₫15,000,000 (VND)"],
        ["billingContactEmail", "finance@acme.vn", "Plan default"],
      ],
    );
  });

  it("is empty when nothing changed", () => {
    const terms = termsFromSubscription(stored);
    assert.deepEqual(describeContractTermsChanges(terms, { ...terms }), []);
  });
});

describe("invoice settlement", () => {
  it("spells the invoice's own currency", () => {
    assert.equal(spellMoney({ amount: 29, currency: "usd" }), "$29.00 (USD)");
    assert.equal(spellMoney({ amount: 13_200_000, currency: "VND" }), "₫13,200,000 (VND)");
  });

  it("offers mark-paid on open invoices only", () => {
    assert.equal(canMarkInvoicePaid({ status: "open" }), true);
    assert.equal(canMarkInvoicePaid({ status: "Open" }), true);
    for (const status of ["paid", "void", "uncollectible", "draft"]) {
      assert.equal(canMarkInvoicePaid({ status }), false, status);
    }
  });

  it("flags an open invoice past due, and nothing else", () => {
    const now = new Date("2026-09-16T00:00:00Z");
    assert.equal(isInvoiceOverdue({ status: "open", dueAt: "2026-09-01T00:00:00Z" }, now), true);
    assert.equal(isInvoiceOverdue({ status: "open", dueAt: "2026-10-01T00:00:00Z" }, now), false);
    assert.equal(isInvoiceOverdue({ status: "paid", dueAt: "2026-09-01T00:00:00Z" }, now), false);
    assert.equal(isInvoiceOverdue({ status: "open", dueAt: null }, now), false);
  });

  it("requires the exact invoice number to confirm", () => {
    const invoice = { invoiceNumber: "INV-20260901-AB12CD34" };
    assert.equal(invoiceConfirmationMatches(invoice, " inv-20260901-ab12cd34 "), true);
    assert.equal(invoiceConfirmationMatches(invoice, "INV-20260901"), false);
    assert.equal(invoiceConfirmationMatches({ invoiceNumber: "" }, ""), false);
  });
});
