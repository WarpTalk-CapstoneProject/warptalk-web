import assert from "node:assert/strict";
import { test } from "node:test";

import { creditUsageLevel } from "../credit-usage-level.ts";
import { decideUsageWarning } from "../usage-warning.ts";
import type { CreditBalanceDto } from "../../../types/billing.ts";

const TOTAL = 10_000;
const level = (currentCredits: number, totalCredits = TOTAL) =>
  creditUsageLevel({ currentCredits, totalCredits }).level;

test("plenty left is ok", () => {
  assert.equal(level(9_000), "ok");
  assert.equal(level(TOTAL), "ok");
});

test("exactly 10% left is the first warning, 11% is not", () => {
  assert.equal(level(1_000), "warn");
  assert.equal(level(1_100), "ok");
});

test("1% left is critical, 2% is only a warning", () => {
  assert.equal(level(100), "critical");
  assert.equal(level(200), "warn");
});

test("4.9% floors to 4 and stays a warning", () => {
  const r = creditUsageLevel({ currentCredits: 490, totalCredits: TOTAL });
  assert.equal(r.level, "warn");
  assert.equal(r.remainingPercent, 4);
});

test("just under 2% floors to 1 and is critical, like the banner", () => {
  assert.equal(level(199), "critical");
});

test("nothing remaining is full", () => {
  const r = creditUsageLevel({ currentCredits: 0, totalCredits: TOTAL });
  assert.equal(r.level, "full");
  assert.equal(r.remainingFraction, 0);
  assert.equal(r.remainingPercent, 0);
});

test("a negative balance (overage) is full, never a negative percentage", () => {
  const r = creditUsageLevel({ currentCredits: -500, totalCredits: TOTAL });
  assert.equal(r.level, "full");
  assert.equal(r.remainingPercent, 0);
});

test("more than the total clamps to 100%", () => {
  const r = creditUsageLevel({ currentCredits: 20_000, totalCredits: TOTAL });
  assert.equal(r.level, "ok");
  assert.equal(r.remainingFraction, 1);
  assert.equal(r.remainingPercent, 100);
});

test("no ceiling is unknown, with no number to divide by", () => {
  for (const total of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
    const r = creditUsageLevel({ currentCredits: 100, totalCredits: total });
    assert.deepEqual(r, { level: "unknown", remainingFraction: null, remainingPercent: null });
  }
});

test("a balance that is not a number is unknown, never NaN", () => {
  for (const current of [Number.NaN, undefined, null, Number.POSITIVE_INFINITY]) {
    const r = creditUsageLevel({ currentCredits: current, totalCredits: TOTAL });
    assert.equal(r.level, "unknown");
    assert.equal(r.remainingFraction, null);
  }
});

test("parity with decideUsageWarning: the meter is non-ok exactly when the banner speaks", () => {
  const balance = (currentCredits: number, totalCredits: number): CreditBalanceDto => ({
    workspaceId: "w",
    currentCredits,
    creditsUsedThisCycle: Math.max(0, totalCredits - currentCredits),
    totalCredits,
    status: "active",
    currentPeriodStart: "2026-08-21T13:16:00.000Z",
    currentPeriodEnd: "2026-08-28T13:16:00.000Z",
  });

  for (const total of [0, 1, 7, 100, 10_000, 2_087_377]) {
    const step = Math.max(1, Math.floor(total / 400));
    for (let current = -50; current <= total + 50; current += step) {
      const { level: l } = creditUsageLevel({ currentCredits: current, totalCredits: total });
      const warned = decideUsageWarning(balance(current, total)) !== null;
      assert.equal(l !== "ok" && l !== "unknown", warned, `current=${current} total=${total}`);
    }
  }
  // The exact boundaries, where a sweep could step over.
  for (const current of [999, 1_000, 1_001, 100, 101, 199, 200, 0]) {
    const { level: l } = creditUsageLevel({ currentCredits: current, totalCredits: TOTAL });
    assert.equal(l !== "ok", decideUsageWarning(balance(current, TOTAL)) !== null, `current=${current}`);
  }
});

test("critical agrees with the banner's isCritical flag", () => {
  for (let current = 0; current <= 1_000; current += 1) {
    const b: CreditBalanceDto = {
      workspaceId: "w",
      currentCredits: current,
      creditsUsedThisCycle: TOTAL - current,
      totalCredits: TOTAL,
      status: "active",
      currentPeriodStart: "2026-08-21T13:16:00.000Z",
      currentPeriodEnd: "2026-08-28T13:16:00.000Z",
    };
    const w = decideUsageWarning(b);
    const l = level(current);
    assert.equal(l === "critical" || l === "full", w?.isCritical === true, `current=${current}`);
  }
});
