import assert from "node:assert/strict";
import test from "node:test";
import { formatAmount, formatMoney } from "../currency.ts";

test("a VND amount renders in English, not Vietnamese", () => {
  // Before: `amount.toLocaleString("vi-VN") + "đ"` produced "90.000đ".
  assert.equal(formatMoney(90_000, "VND"), "90,000 VND");
  assert.equal(formatMoney(212_500, "VND"), "212,500 VND");
  assert.equal(formatMoney(400_000, "VND"), "400,000 VND");
});

test("the numeric value is identical before and after — only the separators move", () => {
  // The guard against the real risk in this change: the digits must be the same number.
  for (const amount of [0, 1, 999, 1_000, 90_000, 212_500, 400_000, 12_345_678]) {
    const before = amount.toLocaleString("vi-VN"); // "90.000"
    const after = formatAmount(amount); // "90,000"
    assert.equal(
      before.replace(/\./g, ""),
      after.replace(/,/g, ""),
      `digits changed for ${amount}`,
    );
  }
});

test("a sub-unit rate keeps every digit instead of rounding to zero", () => {
  // The 0.006575 case: under vi-VN this rendered "0,006575", which reads as 6575 to an
  // English eye. Rounding it to VND's zero minor units would have shown "0".
  assert.equal(formatAmount(0.006575), "0.006575");
  assert.equal(formatMoney(0.006575, "VND"), "0.006575 VND");
  assert.equal(formatMoney(49.99, "USD"), "49.99 USD");
});

test("whole amounts do not grow invented decimals", () => {
  assert.equal(formatAmount(90_000), "90,000");
  assert.equal(formatMoney(0, "VND"), "0 VND");
});

test("the currency code is spelled out and upper-cased, defaulting to VND", () => {
  assert.equal(formatMoney(1_000, "vnd"), "1,000 VND");
  assert.equal(formatMoney(1_000, "usd"), "1,000 USD");
  assert.equal(formatMoney(1_000, undefined), "1,000 VND");
  assert.equal(formatMoney(1_000, null), "1,000 VND");
  assert.equal(formatMoney(1_000, ""), "1,000 VND");
});

test("the locale is pinned, not ambient", () => {
  // formatAmount must not follow the host locale. Whatever the runtime default is, the
  // output uses "," for groups and "." for decimals.
  assert.equal(formatAmount(1_234_567.5), "1,234,567.5");
  assert.ok(!formatAmount(1_234_567).includes("."));
});

test("a non-finite amount degrades to 0 rather than printing NaN at a user", () => {
  assert.equal(formatAmount(Number.NaN), "0");
  assert.equal(formatMoney(Number.POSITIVE_INFINITY, "VND"), "0 VND");
});

test("the exact rendered string, for a large whole amount and a small fractional one", () => {
  // Standing in for a browser: these two assert the literal output, because the risk in
  // this change is the separators moving, not the arithmetic. A large whole amount must
  // group with commas and grow no decimals; a small fractional amount must use a dot and
  // keep every digit.
  assert.equal(formatMoney(1_900_000, "VND"), "1,900,000 VND"); // the real Enterprise price
  assert.equal(formatMoney(0.006575, "VND"), "0.006575 VND"); // the rate that once became 6575

  // And the separators are genuinely swapped versus the old vi-VN rendering, rather than
  // coincidentally equal because the host happens to be in a en-US locale.
  assert.equal((1_900_000).toLocaleString("vi-VN"), "1.900.000");
  assert.notEqual(formatAmount(1_900_000), (1_900_000).toLocaleString("vi-VN"));

  // The old path also *rounded a sub-unit rate away* — this is the regression that would
  // have shipped silently.
  assert.equal((0.006575).toLocaleString("vi-VN"), "0,007");
  assert.equal(formatAmount(0.006575), "0.006575");
});
