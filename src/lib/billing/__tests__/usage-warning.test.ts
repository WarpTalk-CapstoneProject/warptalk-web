import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideUsageWarning,
  describeCadence,
  dismissalKey,
  formatResetMoment,
} from "../usage-warning.ts";
import type { CreditBalanceDto } from "../../../types/billing.ts";

function balance(overrides: Partial<CreditBalanceDto> = {}): CreditBalanceDto {
  return {
    workspaceId: "019f0d00-0de0-7000-9000-0000000000aa",
    currentCredits: 400,
    creditsUsedThisCycle: 9_600,
    totalCredits: 10_000,
    status: "active",
    currentPeriodStart: "2026-08-21T13:16:00.000Z",
    currentPeriodEnd: "2026-08-28T13:16:00.000Z",
    ...overrides,
  };
}

// ── when it speaks ───────────────────────────────────────────────────────────

test("a workspace under the threshold is warned", () => {
  const warning = decideUsageWarning(balance());
  assert.ok(warning);
  assert.equal(warning.percentRemaining, 4);
});

test("a workspace with room to spare is not", () => {
  assert.equal(decideUsageWarning(balance({ currentCredits: 5_000, creditsUsedThisCycle: 5_000, totalCredits: 10_000 })), null);
});

test("the boundary is inclusive — exactly 10% left is a warning", () => {
  const warning = decideUsageWarning(
    balance({ currentCredits: 1_000, creditsUsedThisCycle: 9_000, totalCredits: 10_000 }),
  );
  assert.ok(warning);
  assert.equal(warning.percentRemaining, 10);
});

test("just above the boundary says nothing", () => {
  assert.equal(
    decideUsageWarning(balance({ currentCredits: 1_001, creditsUsedThisCycle: 8_999, totalCredits: 10_000 })),
    null,
  );
});

// ── when it must stay quiet ──────────────────────────────────────────────────

test("no balance is not a warning: a failed read must not alarm anybody", () => {
  assert.equal(decideUsageWarning(null), null);
  assert.equal(decideUsageWarning(undefined), null);
});

test("a workspace with no ceiling is not at 0% — it is unmeasured", () => {
  // remaining + used = 0. A contract workspace that has never been metered, or a cycle that has
  // just rolled. "0% usage remaining" here would be a false alarm nobody can clear.
  assert.equal(
    decideUsageWarning(balance({ currentCredits: 0, creditsUsedThisCycle: 0, totalCredits: 0 })),
    null,
  );
});

test("a non-numeric balance is not a warning", () => {
  assert.equal(
    decideUsageWarning(balance({ currentCredits: Number.NaN, totalCredits: 10_000 })),
    null,
  );
});

// ── the numbers it reports ───────────────────────────────────────────────────

test("the percentage is floored, never rounded up into something rosier", () => {
  // 4.99% must not read as 5%.
  const warning = decideUsageWarning(
    balance({ currentCredits: 499, creditsUsedThisCycle: 9_501, totalCredits: 10_000 }),
  );
  assert.equal(warning?.percentRemaining, 4);
});

test("an overdrawn workspace reads 0%, not a negative percentage", () => {
  const warning = decideUsageWarning(
    balance({ currentCredits: -250, creditsUsedThisCycle: 10_250, totalCredits: 10_000 }),
  );
  assert.equal(warning?.percentRemaining, 0);
  assert.equal(warning?.creditsRemaining, 0);
});

// ── dismissal buckets ────────────────────────────────────────────────────────

test("dismissing at 10% does not silence 4%", () => {
  const gentle = decideUsageWarning(
    balance({ currentCredits: 1_000, creditsUsedThisCycle: 9_000, totalCredits: 10_000 }),
  );
  const dire = decideUsageWarning(balance());

  assert.notEqual(
    dismissalKey("ws", gentle!.bucket),
    dismissalKey("ws", dire!.bucket),
    "a worsening situation must be allowed to speak again",
  );
});

test("two readings inside the same bucket share one dismissal", () => {
  const a = decideUsageWarning(balance({ currentCredits: 400, creditsUsedThisCycle: 9_600, totalCredits: 10_000 }));
  const b = decideUsageWarning(balance({ currentCredits: 300, creditsUsedThisCycle: 9_700, totalCredits: 10_000 }));

  assert.equal(dismissalKey("ws", a!.bucket), dismissalKey("ws", b!.bucket));
});

test("one workspace's dismissal never silences another's", () => {
  const warning = decideUsageWarning(balance())!;
  assert.notEqual(dismissalKey("ws-a", warning.bucket), dismissalKey("ws-b", warning.bucket));
});

test("1% or less is critical; more than that is not", () => {
  const critical = decideUsageWarning(
    balance({ currentCredits: 100, creditsUsedThisCycle: 9_900, totalCredits: 10_000 }),
  );
  const merelyLow = decideUsageWarning(
    balance({ currentCredits: 400, creditsUsedThisCycle: 9_600, totalCredits: 10_000 }),
  );

  assert.equal(critical?.isCritical, true);
  assert.equal(merelyLow?.isCritical, false);
});

// ── the sentence under the title ─────────────────────────────────────────────

test("a seven-day period reads as a week", () => {
  assert.equal(describeCadence("2026-08-21T13:16:00Z", "2026-08-28T13:16:00Z"), "every week");
});

test("a calendar month reads as a month, whichever month it is", () => {
  assert.equal(describeCadence("2026-02-01T00:00:00Z", "2026-03-01T00:00:00Z"), "every month");
  assert.equal(describeCadence("2026-07-01T00:00:00Z", "2026-08-01T00:00:00Z"), "every month");
});

test("a year reads as a year", () => {
  assert.equal(describeCadence("2026-08-21T00:00:00Z", "2027-08-21T00:00:00Z"), "every year");
});

test("an odd period is described in days rather than guessed at", () => {
  assert.equal(describeCadence("2026-08-01T00:00:00Z", "2026-08-11T00:00:00Z"), "every 10 days");
});

test("a period that makes no sense is described not at all", () => {
  assert.equal(describeCadence("2026-08-28T00:00:00Z", "2026-08-21T00:00:00Z"), null);
  assert.equal(describeCadence("not-a-date", "2026-08-21T00:00:00Z"), null);
});

test("the reset moment names a day and a time", () => {
  // Asserted on shape rather than an exact string: this renders in the reader's own zone, and
  // pinning a literal would make the test pass only in the zone it was written in.
  const formatted = formatResetMoment("2026-08-28T13:16:00.000Z");
  assert.match(formatted ?? "", /^[A-Z][a-z]{2} \d{1,2} at \d{1,2}:\d{2} (AM|PM)$/);
});

test("an unparseable reset instant is formatted not at all", () => {
  assert.equal(formatResetMoment("nonsense"), null);
});
