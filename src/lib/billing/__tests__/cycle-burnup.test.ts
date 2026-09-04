// The burn-up's arithmetic.
//
// Every failure here draws a chart that looks right. A ceiling read from the wrong transaction in
// a bucket is a smooth line at the wrong height; a ceiling that forgets a top-up puts a workspace
// in overage on screen while its balance is fine; a forecast that keeps extrapolating past the
// end of the cycle prints a number the chart never draws. None of them look like bugs.

import assert from "node:assert/strict";
import test from "node:test";

import { summariseCycleBurnUp, type CycleBurnUpInput } from "../cycle-burnup.ts";
import type { CreditTransactionDto } from "../../../types/billing.ts";

const DAY = 24 * 60 * 60 * 1000;

/** Local midnight, so bucket boundaries match the runner's zone. */
const START = new Date(2026, 7, 1, 0, 0, 0).getTime();
const END = new Date(2026, 7, 31, 0, 0, 0).getTime();

function tx(at: number, amount: number, balanceAfter: number): CreditTransactionDto {
  return {
    id: `tx-${at}-${amount}`,
    workspaceId: "w1",
    userId: "u1",
    amount,
    type: amount < 0 ? "consume" : "top_up",
    balanceAfter,
    createdAt: new Date(at).toISOString(),
  };
}

function input(overrides: Partial<CycleBurnUpInput> = {}): CycleBurnUpInput {
  return {
    transactions: [],
    currentPeriodStart: new Date(START).toISOString(),
    currentPeriodEnd: new Date(END).toISOString(),
    totalCredits: 30_000,
    currentCredits: 30_000,
    ...overrides,
  };
}

test("spend accumulates across buckets rather than resetting per bucket", () => {
  const result = summariseCycleBurnUp(
    input({
      transactions: [
        tx(START + 0.5 * DAY, -1_000, 29_000),
        tx(START + 1.5 * DAY, -2_000, 27_000),
        tx(START + 2.5 * DAY, -3_000, 24_000),
      ],
    }),
    START + 2.9 * DAY,
  );

  assert.ok(result);
  assert.deepEqual(
    result.points.map((p) => p.spent),
    [1_000, 3_000, 6_000],
  );
  assert.deepEqual(
    result.points.map((p) => p.spentInBucket),
    [1_000, 2_000, 3_000],
  );
  assert.equal(result.spent, 6_000);
});

test("the ceiling comes from the LAST balance in a bucket, not the first", () => {
  // Two spends on the same day. Reading the first would put the ceiling 2,000 too high for the
  // rest of the cycle, because every later bucket inherits it.
  const result = summariseCycleBurnUp(
    input({
      transactions: [
        tx(START + 0.2 * DAY, -1_000, 29_000),
        tx(START + 0.8 * DAY, -2_000, 27_000),
      ],
    }),
    START + 1.2 * DAY,
  );

  assert.ok(result);
  assert.equal(result.points[0].available, 30_000);
});

test("wire order does not decide the ceiling — the history endpoint returns newest first", () => {
  const newestFirst = [
    tx(START + 0.8 * DAY, -2_000, 27_000),
    tx(START + 0.2 * DAY, -1_000, 29_000),
  ];

  const result = summariseCycleBurnUp(input({ transactions: newestFirst }), START + 1.2 * DAY);

  assert.ok(result);
  assert.equal(result.points[0].available, 30_000);
});

test("a top-up raises the ceiling from the bucket it lands in", () => {
  const result = summariseCycleBurnUp(
    input({
      transactions: [
        tx(START + 0.5 * DAY, -5_000, 25_000),
        tx(START + 1.5 * DAY, 20_000, 45_000),
        tx(START + 2.5 * DAY, -5_000, 40_000),
      ],
    }),
    START + 2.9 * DAY,
  );

  assert.ok(result);
  assert.deepEqual(
    result.points.map((p) => p.available),
    [30_000, 50_000, 50_000],
  );
});

test("buckets with no transaction inherit the ceiling instead of dropping to zero", () => {
  const result = summariseCycleBurnUp(
    input({
      transactions: [
        tx(START + 0.5 * DAY, -1_000, 29_000),
        tx(START + 3.5 * DAY, -1_000, 28_000),
      ],
    }),
    START + 3.9 * DAY,
  );

  assert.ok(result);
  assert.deepEqual(
    result.points.map((p) => p.available),
    [30_000, 30_000, 30_000, 30_000],
  );
});

test("silent buckets before the first transaction are back-filled, not left at zero", () => {
  const result = summariseCycleBurnUp(
    input({ transactions: [tx(START + 2.5 * DAY, -1_000, 29_000)] }),
    START + 2.9 * DAY,
  );

  assert.ok(result);
  assert.deepEqual(
    result.points.map((p) => p.available),
    [30_000, 30_000, 30_000],
  );
});

test("an empty ledger falls back to the balance rather than a ceiling of zero", () => {
  const result = summariseCycleBurnUp(
    input({ transactions: [], currentCredits: 12_345 }),
    START + 2 * DAY,
  );

  assert.ok(result);
  assert.equal(result.available, 12_345);
  assert.equal(result.spent, 0);
});

test("no rate under a day of cycle, and none when nothing has been spent", () => {
  const tooEarly = summariseCycleBurnUp(
    input({ transactions: [tx(START + 0.1 * DAY, -1_000, 29_000)] }),
    START + 0.4 * DAY,
  );
  assert.ok(tooEarly);
  assert.equal(tooEarly.perBucket, null);
  assert.equal(tooEarly.overageAt, null);

  const nothingSpent = summariseCycleBurnUp(input({ transactions: [] }), START + 5 * DAY);
  assert.ok(nothingSpent);
  assert.equal(nothingSpent.perBucket, null);
  assert.equal(nothingSpent.overageAt, null);
});

test("overage already reached is reported as measured, at the bucket it happened in", () => {
  const result = summariseCycleBurnUp(
    input({
      transactions: [
        tx(START + 0.5 * DAY, -10_000, 20_000),
        tx(START + 1.5 * DAY, -20_000, 0),
      ],
    }),
    START + 1.9 * DAY,
  );

  assert.ok(result);
  assert.equal(result.overageIsMeasured, true);
  assert.equal(result.overageAt, 1);
});

test("a forecast that lands past the end of the cycle is refused, not clamped", () => {
  // 100 credits a day against a 30,000 ceiling reaches it long after this 30-day cycle ends.
  const result = summariseCycleBurnUp(
    input({
      transactions: [
        tx(START + 0.5 * DAY, -100, 29_900),
        tx(START + 1.5 * DAY, -100, 29_800),
      ],
    }),
    START + 2 * DAY,
  );

  assert.ok(result);
  assert.equal(result.overageIsMeasured, false);
  assert.equal(result.overageAt, null);
});

test("a forecast inside the cycle is returned as a position on the cycle axis", () => {
  const result = summariseCycleBurnUp(
    input({
      transactions: [
        tx(START + 0.5 * DAY, -5_000, 25_000),
        tx(START + 1.5 * DAY, -5_000, 20_000),
      ],
    }),
    START + 2 * DAY,
  );

  assert.ok(result);
  assert.equal(result.overageIsMeasured, false);
  assert.ok(result.overageAt !== null);
  // 10,000 spent over 2 days is 5,000/day, so the remaining 20,000 lasts 4 more days. The
  // forecast is anchored to the last MEASURED bucket — index 2, today — not to the last bucket
  // that happened to contain a transaction, which is index 1 here.
  assert.equal(result.points.length, 3);
  assert.ok(Math.abs(result.overageAt - 6) < 0.001);
});

test("the axis covers the whole cycle even though the points stop at today", () => {
  const result = summariseCycleBurnUp(
    input({ transactions: [tx(START + 0.5 * DAY, -1_000, 29_000)] }),
    START + 2 * DAY,
  );

  assert.ok(result);
  assert.equal(result.points.length, 3);
  assert.equal(result.bucketsInCycle, 30);
});
