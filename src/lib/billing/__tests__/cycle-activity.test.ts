// The billing chart's arithmetic.
//
// A bar chart is believed on sight — nobody checks a height — so the failures that matter are the
// ones that still LOOK like a chart: a flat tail of unstarted days that reads as measured silence,
// a top-up counted as spend because it arrived under a type string nobody matched, 365 bars for a
// yearly plan. Each of those renders perfectly and says something false.

import assert from "node:assert/strict";
import test from "node:test";

import {
  summariseCycleActivity,
  summariseServiceUsage,
  type CycleActivityInput,
} from "../cycle-activity.ts";
import type { CreditTransactionDto } from "../../../types/billing.ts";

const DAY = 24 * 60 * 60 * 1000;

/** Local midnight on the first of the month, so bucket boundaries match the runner's zone. */
const START = new Date(2026, 7, 1, 0, 0, 0).getTime();
const END = new Date(2026, 7, 31, 0, 0, 0).getTime();

function tx(at: number, amount: number): CreditTransactionDto {
  return {
    id: `tx-${at}-${amount}`,
    workspaceId: "w1",
    userId: "u1",
    amount,
    type: amount < 0 ? "consume" : "top_up",
    balanceAfter: 0,
    createdAt: new Date(at).toISOString(),
  };
}

function input(overrides: Partial<CycleActivityInput> = {}): CycleActivityInput {
  return {
    transactions: [],
    currentPeriodStart: new Date(START).toISOString(),
    currentPeriodEnd: new Date(END).toISOString(),
    totalCredits: 30_000,
    ...overrides,
  };
}

test("the series stops at today rather than padding the rest of the cycle with zeroes", () => {
  // Ten days into a thirty-day cycle. Twenty zero bars after the last real one would read as
  // twenty days of measured silence, which is the opposite of what they are.
  const result = summariseCycleActivity(input(), START + 9.5 * DAY);

  assert.ok(result);
  assert.equal(result.buckets.length, 10);
});

test("a spend lands in the day it happened", () => {
  const result = summariseCycleActivity(
    input({ transactions: [tx(START + 2 * DAY + 3 * 60 * 60 * 1000, -500)] }),
    START + 5 * DAY,
  );

  assert.ok(result);
  assert.equal(result.buckets[2].consumed, 500);
  assert.equal(result.buckets[1].consumed, 0);
  assert.equal(result.buckets[3].consumed, 0);
});

test("a top-up is never counted as spend", () => {
  // The consume/top_up strings have been wrong on this wire before — `types/billing.ts` carries a
  // comment about "consumption" never matching anything the API sent. The SIGN is the fact.
  const result = summariseCycleActivity(
    input({ transactions: [tx(START + DAY, 30_000), tx(START + DAY, -200)] }),
    START + 5 * DAY,
  );

  assert.ok(result);
  assert.equal(result.totalToppedUp, 30_000);
  assert.equal(result.totalConsumed, 200);
});

test("an adjustment is read by its sign, in both directions", () => {
  // The two cases where `type` and sign disagree, and the reason the code keys on the sign. An
  // admin's clawback is spelled "adjustment" with a negative amount; a reversal arrives positive
  // under a type that is not "top_up". Trusting `type` books the clawback as a top-up and the
  // reversal as spend — a chart that moves the wrong way on the only rows anyone disputes.
  const clawback: CreditTransactionDto = { ...tx(START + DAY, -300), type: "adjustment" };
  const reversal: CreditTransactionDto = { ...tx(START + 2 * DAY, 200), type: "consume" };

  const result = summariseCycleActivity(
    input({ transactions: [clawback, reversal] }),
    START + 5 * DAY,
  );

  assert.ok(result);
  assert.equal(result.totalConsumed, 300, "the negative adjustment was not counted as spend");
  assert.equal(result.totalToppedUp, 200, "the positive reversal was not counted as credit back");
});

test("transactions from before the cycle do not leak into it", () => {
  // The history endpoint is paged, not cycle-scoped. A page that reaches back past the renewal
  // would otherwise inflate this cycle with the previous one's spending.
  const result = summariseCycleActivity(
    input({ transactions: [tx(START - 3 * DAY, -9_000), tx(START + DAY, -100)] }),
    START + 5 * DAY,
  );

  assert.ok(result);
  assert.equal(result.totalConsumed, 100);
});

test("a yearly cycle is bucketed by week instead of drawing a bar per day", () => {
  const yearEnd = new Date(2027, 7, 1, 0, 0, 0).getTime();
  const result = summariseCycleActivity(
    input({ currentPeriodEnd: new Date(yearEnd).toISOString() }),
    START + 30 * DAY,
  );

  assert.ok(result);
  assert.equal(result.bucketSize, "week");
  assert.ok(result.buckets.length <= 6, `drew ${result.buckets.length} buckets for one month`);
});

test("the pace line is the rate that lasts exactly to renewal", () => {
  // 30,000 credits over 30 days.
  const result = summariseCycleActivity(input(), START + 5 * DAY);

  assert.ok(result);
  assert.equal(result.evenPacePerBucket, 1_000);
});

test("no allowance means no pace line rather than a line at zero", () => {
  // A line pinned to zero would put every bar above it and paint a healthy workspace as overspent.
  const result = summariseCycleActivity(input({ totalCredits: 0 }), START + 5 * DAY);

  assert.ok(result);
  assert.equal(result.evenPacePerBucket, null);
});

test("a cycle with unusable dates yields no chart at all", () => {
  assert.equal(summariseCycleActivity(input({ currentPeriodStart: "" }), START), null);
  assert.equal(
    summariseCycleActivity(
      input({ currentPeriodEnd: new Date(START - DAY).toISOString() }),
      START,
    ),
    null,
  );
});

test("the busiest day is the one with the most spend, and is null when there is none", () => {
  const busy = summariseCycleActivity(
    input({ transactions: [tx(START + DAY, -100), tx(START + 3 * DAY, -900)] }),
    START + 5 * DAY,
  );
  assert.ok(busy);
  assert.equal(busy.busiest?.consumed, 900);

  const quiet = summariseCycleActivity(input({ transactions: [tx(START + DAY, 5_000)] }), START + 5 * DAY);
  assert.ok(quiet);
  assert.equal(quiet.busiest, null);
});

// ── Per-service ────────────────────────────────────────────────────────────────────────────────

test("credits per use is null, not zero, for a service with no uses recorded", () => {
  // Zero would render as "0.0 cr / use" — a claim that the service is free, next to a bill for it.
  const [row] = summariseServiceUsage([
    { usageType: "voice_cloning", totalCreditsConsumed: 400, usageCount: 0 },
  ]);

  assert.equal(row.creditsPerUse, null);
});

test("services are ranked by credits and shares add up to the whole", () => {
  const rows = summariseServiceUsage([
    { usageType: "summary", totalCreditsConsumed: 250, usageCount: 5 },
    { usageType: "voice_translation", totalCreditsConsumed: 750, usageCount: 30 },
  ]);

  assert.deepEqual(
    rows.map((r) => r.usageType),
    ["voice_translation", "summary"],
  );
  assert.equal(rows[0].share, 75);
  assert.equal(rows[0].creditsPerUse, 25);
});

test("a service that consumed nothing and was never used is dropped", () => {
  const rows = summariseServiceUsage([
    { usageType: "chat", totalCreditsConsumed: 0, usageCount: 0 },
    { usageType: "summary", totalCreditsConsumed: 10, usageCount: 1 },
  ]);

  assert.deepEqual(
    rows.map((r) => r.usageType),
    ["summary"],
  );
});
