/**
 * Whether a workspace's credits reach the end of the billing cycle.
 *
 * This is the only arithmetic on the owner dashboard that produces a claim rather than a
 * restatement. "Credits: 1,240" cannot be wrong; "runs out in 6 days" can, and an owner who
 * believes it will either buy credit they did not need or skip credit they did. So the rules for
 * refusing to answer are as much the subject here as the division is.
 *
 * IT REFUSES WHEN THE SAMPLE IS TOO SHORT
 *   A rate measured over four hours of a thirty-day cycle is an artefact of when somebody
 *   happened to open the page: one long meeting on the first morning projects a workspace running
 *   dry in a week. Under a day of elapsed cycle, there is no rate.
 *
 * IT REFUSES WHEN NOTHING HAS HAPPENED
 *   Zero used over five days is a real measurement of zero, and dividing a balance by it gives
 *   "never runs out" — technically true, useless as a claim, and wrong the moment the workspace
 *   holds its first meeting.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Under this much elapsed cycle, a burn rate says more about the observer than the workspace. */
const MIN_DAYS_FOR_A_RATE = 1;

export type CycleProjection =
  /** No claim, and the reason why — shown instead of a number. */
  | { kind: "unknown"; reason: string }
  /** The balance outlives the cycle; this is what should be left when it renews. */
  | { kind: "lasts"; creditsLeftAtRenewal: number; perDay: number }
  /** The balance runs out first, on this date. */
  | { kind: "runs-out"; daysToEmpty: number; onDate: Date; perDay: number };

export interface CycleInput {
  currentCredits: number;
  creditsUsedThisCycle: number;
  /** ISO datetimes, straight off `CreditBalanceDto`. */
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export function projectCycle(credits: CycleInput, now: number): CycleProjection {
  const start = new Date(credits.currentPeriodStart).getTime();
  const end = new Date(credits.currentPeriodEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { kind: "unknown", reason: "This cycle has no dates on it." };
  }

  const daysElapsed = (now - start) / MS_PER_DAY;
  if (daysElapsed < MIN_DAYS_FOR_A_RATE) {
    return { kind: "unknown", reason: "Too early in the cycle to project a rate." };
  }

  const used = Math.max(0, credits.creditsUsedThisCycle);
  if (used === 0) {
    return { kind: "unknown", reason: "Nothing used yet this cycle." };
  }

  const perDay = used / daysElapsed;
  const remaining = Math.max(0, credits.currentCredits);
  const daysToEmpty = remaining / perDay;
  const daysLeftInCycle = Math.max(0, (end - now) / MS_PER_DAY);

  if (daysToEmpty >= daysLeftInCycle) {
    return {
      kind: "lasts",
      creditsLeftAtRenewal: Math.max(0, Math.round(remaining - perDay * daysLeftInCycle)),
      perDay,
    };
  }

  return {
    kind: "runs-out",
    daysToEmpty,
    onDate: new Date(now + daysToEmpty * MS_PER_DAY),
    perDay,
  };
}

/**
 * How far through the cycle the clock is, as a percentage, or null if the dates cannot say.
 *
 * Drawn against the share of credits used: 40% used at 40% elapsed is a workspace that is fine,
 * and 40% used at 10% elapsed is one that will be empty with three weeks still to pay for. The
 * comparison is what turns a progress bar into a warning.
 */
export function cycleElapsedPercent(
  credits: Pick<CycleInput, "currentPeriodStart" | "currentPeriodEnd">,
  now: number,
): number | null {
  const start = new Date(credits.currentPeriodStart).getTime();
  const end = new Date(credits.currentPeriodEnd).getTime();
  const length = end - start;
  if (!Number.isFinite(length) || length <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(((now - start) / length) * 100)));
}

/** Whole days from now to the end of the cycle, floored at zero. */
export function daysLeftInCycle(
  credits: Pick<CycleInput, "currentPeriodEnd">,
  now: number,
): number {
  const end = new Date(credits.currentPeriodEnd).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / MS_PER_DAY));
}
