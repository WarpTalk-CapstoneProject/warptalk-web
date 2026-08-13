// The owner dashboard's only real claim.
//
// Every other number on that page restates something the server said. "Runs out in 6 days" is
// derived, and an owner acts on it with money: believing it wrongly means buying credit that was
// not needed, and missing it means a meeting that stops translating mid-sentence. The cases that
// matter most here are the ones where the honest answer is "I don't know" — a rate measured over
// the first hour of a cycle looks exactly like a rate measured over three weeks, and only one of
// them is worth showing.

import assert from "node:assert/strict";
import test from "node:test";

import {
  cycleElapsedPercent,
  daysLeftInCycle,
  projectCycle,
  type CycleInput,
} from "../cycle-projection.ts";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 7, 1);
const END = Date.UTC(2026, 7, 31);

function cycle(overrides: Partial<CycleInput> = {}): CycleInput {
  return {
    currentCredits: 1_000,
    creditsUsedThisCycle: 1_000,
    currentPeriodStart: new Date(START).toISOString(),
    currentPeriodEnd: new Date(END).toISOString(),
    ...overrides,
  };
}

test("a cycle barely begun produces no rate at all", () => {
  // Four hours in, one long meeting is the entire sample. Extrapolating it projects a workspace
  // running dry inside a week on the strength of a single morning.
  const result = projectCycle(cycle(), START + 4 * 60 * 60 * 1000);
  assert.equal(result.kind, "unknown");
});

test("a day into the cycle is enough to measure", () => {
  const result = projectCycle(cycle(), START + DAY);
  assert.notEqual(result.kind, "unknown");
});

test("nothing consumed is not a rate of zero", () => {
  // Dividing by it gives "never runs out", which is true until the first meeting and wrong after.
  const result = projectCycle(cycle({ creditsUsedThisCycle: 0 }), START + 10 * DAY);
  assert.equal(result.kind, "unknown");
});

test("a balance that outlasts the cycle says what is left at renewal", () => {
  // 100/day for 10 days, 5,000 left, 20 days to go: 2,000 spent, 3,000 survives.
  const result = projectCycle(
    cycle({ creditsUsedThisCycle: 1_000, currentCredits: 5_000 }),
    START + 10 * DAY,
  );

  assert.equal(result.kind, "lasts");
  if (result.kind !== "lasts") return;
  assert.equal(result.perDay, 100);
  assert.equal(result.creditsLeftAtRenewal, 3_000);
});

test("a balance that does not reach the renewal date names the day it ends", () => {
  // 200/day for 10 days, 1,000 left: empty in 5 days, with 15 days of cycle still to pay for.
  const result = projectCycle(
    cycle({ creditsUsedThisCycle: 2_000, currentCredits: 1_000 }),
    START + 10 * DAY,
  );

  assert.equal(result.kind, "runs-out");
  if (result.kind !== "runs-out") return;
  assert.equal(result.perDay, 200);
  assert.equal(result.daysToEmpty, 5);
  assert.equal(result.onDate.getTime(), START + 15 * DAY);
});

test("exactly reaching the renewal date counts as lasting", () => {
  // The boundary belongs to "lasts": a balance that ends the instant the cycle does has not left
  // anybody without translation, and warning about it would cry wolf every renewal.
  const result = projectCycle(
    cycle({ creditsUsedThisCycle: 1_000, currentCredits: 2_000 }),
    START + 10 * DAY,
  );

  assert.equal(result.kind, "lasts");
  if (result.kind !== "lasts") return;
  assert.equal(result.creditsLeftAtRenewal, 0);
});

test("an empty balance runs out today rather than lasting forever", () => {
  const result = projectCycle(
    cycle({ creditsUsedThisCycle: 2_000, currentCredits: 0 }),
    START + 10 * DAY,
  );

  assert.equal(result.kind, "runs-out");
  if (result.kind !== "runs-out") return;
  assert.equal(result.daysToEmpty, 0);
});

test("a negative balance is treated as empty, not as credit owed back", () => {
  // Consumption is flushed in batches and can overshoot; the balance is allowed to go under zero.
  // "Runs out in -3 days" is not a sentence.
  const result = projectCycle(
    cycle({ creditsUsedThisCycle: 2_000, currentCredits: -500 }),
    START + 10 * DAY,
  );

  assert.equal(result.kind, "runs-out");
  if (result.kind !== "runs-out") return;
  assert.equal(result.daysToEmpty, 0);
});

test("unparseable period dates produce no claim", () => {
  const result = projectCycle(
    cycle({ currentPeriodStart: "not a date", currentPeriodEnd: "also not a date" }),
    START + 10 * DAY,
  );
  assert.equal(result.kind, "unknown");
});

test("a clock past the period end still answers, without a negative cycle remainder", () => {
  // Renewal is a background job; the browser can easily be a few minutes ahead of it.
  const result = projectCycle(cycle({ currentCredits: 500 }), END + DAY);

  assert.equal(result.kind, "lasts");
  if (result.kind !== "lasts") return;
  assert.equal(result.creditsLeftAtRenewal, 500);
});

test("elapsed percent tracks the clock and is clamped at both ends", () => {
  assert.equal(cycleElapsedPercent(cycle(), START), 0);
  assert.equal(cycleElapsedPercent(cycle(), START + 15 * DAY), 50);
  assert.equal(cycleElapsedPercent(cycle(), END), 100);
  assert.equal(cycleElapsedPercent(cycle(), END + 10 * DAY), 100);
  assert.equal(cycleElapsedPercent(cycle(), START - 10 * DAY), 0);
});

test("elapsed percent refuses a cycle with no length", () => {
  assert.equal(
    cycleElapsedPercent(
      cycle({ currentPeriodEnd: new Date(START).toISOString() }),
      START,
    ),
    null,
  );
  assert.equal(cycleElapsedPercent(cycle({ currentPeriodStart: "nope" }), START), null);
});

test("days left never goes negative", () => {
  assert.equal(daysLeftInCycle(cycle(), START), 30);
  assert.equal(daysLeftInCycle(cycle(), END), 0);
  assert.equal(daysLeftInCycle(cycle(), END + 5 * DAY), 0);
});
