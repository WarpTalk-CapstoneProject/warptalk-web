import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatAdminMoney,
  formatMonthlyRecurring,
  formatSubscriptionValue,
} from "../admin-money.ts";

describe("formatAdminMoney", () => {
  it("prints VND without a minor unit", () => {
    // "₫1,900,000.00" is noise — VND has no minor unit and nobody writes one.
    assert.equal(formatAdminMoney({ amount: 1_900_000, currency: "VND" }), "₫1,900,000");
  });

  it("prints USD with its cents", () => {
    // The mirror of the case above: "$29" without cents reads as truncated.
    assert.equal(formatAdminMoney({ amount: 29, currency: "USD" }), "$29.00");
  });

  it("accepts a lowercase currency code", () => {
    assert.equal(formatAdminMoney({ amount: 29, currency: "usd" }), "$29.00");
  });

  it("uses an unrecognised but well-formed code as its own symbol", () => {
    // Intl does NOT throw here: any three alphabetic characters are a valid currency code to it,
    // and it prints the code where a symbol would go. So a plan row in a currency this build has
    // never heard of still renders sensibly.
    //
    // The separator is a NON-BREAKING space (U+00A0), which is what Intl emits between a currency
    // code and its number. Written as an escape rather than pasted, because an assertion that
    // hinges on an invisible character is one nobody can debug by reading it.
    assert.equal(formatAdminMoney({ amount: 5, currency: "ZZZ" }), `ZZZ\u00A05.00`);
  });

  it("falls back rather than throwing on a malformed currency code", () => {
    // This is the path the try/catch actually exists for — Intl throws RangeError on anything
    // that is not three letters. A corrupt plans.currency must not take the whole page down: the
    // server owns this vocabulary and the row is still a real subscription.
    assert.equal(formatAdminMoney({ amount: 5, currency: "US" }), "5.00 US");
  });
});

describe("formatMonthlyRecurring", () => {
  it("keeps currencies apart instead of adding them", () => {
    // 1,900,000 VND + 29 USD is 1,900,029 of nothing. The server refuses to add them and so
    // does this.
    assert.equal(
      formatMonthlyRecurring([
        { amount: 1_900_000, currency: "VND" },
        { amount: 29, currency: "USD" },
      ]),
      "₫1,900,000 + $29.00",
    );
  });

  it("says so in words when nothing is being paid for", () => {
    // "0" would be picking a currency to be zero of — the same invention the server declined.
    assert.equal(formatMonthlyRecurring([]), "No paid subscriptions");
  });
});

describe("formatSubscriptionValue", () => {
  it("prints the amount when there is one", () => {
    assert.equal(
      formatSubscriptionValue({ amount: 500_000, currency: "VND" }, {
        isTrial: false,
        isCancelled: false,
      }),
      "₫500,000",
    );
  });

  it("names a trial rather than printing zero", () => {
    // A trial is worth its full price next week. "0" would say it is worth nothing.
    assert.equal(
      formatSubscriptionValue(null, { isTrial: true, isCancelled: false }),
      "In trial",
    );
  });

  it("names a cancellation rather than printing zero", () => {
    assert.equal(
      formatSubscriptionValue(null, { isTrial: false, isCancelled: true }),
      "Cancelled",
    );
  });

  it("distinguishes a genuinely unpriced row from both", () => {
    assert.equal(formatSubscriptionValue(null, { isTrial: false, isCancelled: false }), "—");
  });
});
