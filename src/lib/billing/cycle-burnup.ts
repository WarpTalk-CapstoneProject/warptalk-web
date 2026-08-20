/**
 * The cycle as a burn-up: credits spent so far, read against the credits available to spend.
 *
 * WHY NOT THE BAR CHART
 *   `summariseCycleActivity` answers "which day was expensive". That is a real question, but it
 *   is not the one Usage is opened with, and it degrades badly on real data: the demo workspace
 *   spent 2,100,998 of its 2,106,183 credits on one day, which draws one bar, six bars of zero
 *   height, and an even-pace line pinned to the axis. A cumulative series absorbs that day as a
 *   step and keeps its scale.
 *
 * THE CEILING IS DERIVED, NOT FETCHED
 *   No endpoint returns "credits available per day". It does not need one: every transaction
 *   carries `balanceAfter`, and at any instant `available = spent so far + balance`. So the last
 *   transaction in each bucket gives that bucket's ceiling exactly — including the step a top-up
 *   puts in it — and buckets with no transaction inherit the previous value, because nothing but
 *   a transaction can move either term.
 *
 * CROSSING THE CEILING IS NOT RUNNING OUT
 *   `Subscription.OverageStartedAt` and the `billing.overage_started` notification say what
 *   actually happens: the workspace keeps working and the excess is billed at the end of the
 *   cycle. Nothing here is named "runs out", and the chart draws the spend line straight through
 *   the ceiling rather than stopping at it.
 */

import type { CreditTransactionDto } from "@/types/billing";

import {
  summariseCycleActivity,
  type BucketSize,
  type CycleActivityInput,
} from "./cycle-activity.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Under this much elapsed cycle, a rate says more about when the page was opened. */
const MIN_DAYS_FOR_A_RATE = 1;

export interface BurnUpPoint {
  /** Local midnight at the start of the bucket. */
  start: Date;
  /** Credits consumed inside this bucket alone. */
  spentInBucket: number;
  /** Credits consumed from the start of the cycle through the end of this bucket. */
  spent: number;
  /** Credits available to spend as at the end of this bucket — plan, rollover and top-ups. */
  available: number;
}

export interface CycleBurnUp {
  /** Measured buckets only. Never padded into the future — see `bucketsInCycle`. */
  points: BurnUpPoint[];
  bucketSize: BucketSize;
  /** Buckets the whole cycle will contain, measured and not yet measured. The x axis. */
  bucketsInCycle: number;
  /** Credits available now — the ceiling the spend line is read against. */
  available: number;
  /** Credits consumed to date. */
  spent: number;
  /** Consumption per elapsed bucket, or null when the sample is too short to have a rate. */
  perBucket: number | null;
  /**
   * Where the spend line meets the ceiling, as a (possibly fractional) index on the cycle axis:
   * measured if it already happened, projected if it has not, and null when it does not happen
   * inside this cycle or cannot be projected.
   */
  overageAt: number | null;
  /** True when `overageAt` is a measurement rather than a forecast. */
  overageIsMeasured: boolean;
  /** The rate at which the whole allowance would last exactly to renewal. */
  evenPacePerBucket: number | null;
}

export interface CycleBurnUpInput extends CycleActivityInput {
  /** `CreditBalanceDto.currentCredits` — the fallback ceiling when the ledger is empty. */
  currentCredits: number;
}

/** The last balance the ledger reports inside each bucket, or null where it reports none. */
function lastBalancePerBucket(
  transactions: CreditTransactionDto[],
  firstBucketMs: number,
  bucketDays: number,
  bucketCount: number,
): (number | null)[] {
  const balances: (number | null)[] = new Array(bucketCount).fill(null);

  // Sorted, because "the last transaction in the bucket" is a claim about time and the history
  // endpoint returns newest-first. Reading them in wire order would record the OLDEST balance in
  // each bucket, which is the balance before that bucket's spending rather than after it.
  const ordered = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const tx of ordered) {
    const at = new Date(tx.createdAt).getTime();
    if (!Number.isFinite(at)) continue;
    const index = Math.floor((at - firstBucketMs) / (bucketDays * MS_PER_DAY));
    if (index < 0 || index >= bucketCount) continue;
    balances[index] = tx.balanceAfter;
  }

  return balances;
}

export function summariseCycleBurnUp(
  input: CycleBurnUpInput,
  now: number,
): CycleBurnUp | null {
  const activity = summariseCycleActivity(input, now);
  if (!activity) return null;

  const bucketDays = activity.bucketSize === "week" ? 7 : 1;
  const firstBucketMs = activity.buckets[0].start.getTime();
  const balances = lastBalancePerBucket(
    input.transactions,
    firstBucketMs,
    bucketDays,
    activity.buckets.length,
  );

  const start = new Date(input.currentPeriodStart).getTime();
  const end = new Date(input.currentPeriodEnd).getTime();
  const bucketsInCycle = Math.max(
    activity.buckets.length,
    Math.ceil((end - firstBucketMs) / (bucketDays * MS_PER_DAY)),
  );

  let running = 0;
  const points: BurnUpPoint[] = activity.buckets.map((bucket, index) => {
    running += bucket.consumed;
    const balance = balances[index];
    return {
      start: bucket.start,
      spentInBucket: bucket.consumed,
      spent: running,
      // NaN marks "the ledger said nothing here"; the two passes below replace every one of them.
      available: balance === null ? Number.NaN : running + balance,
    };
  });

  // Carry a known ceiling forward over silent buckets, then back-fill the silent buckets before
  // the first transaction. Both directions are exact: available only moves when a transaction
  // moves it, so a bucket with no transaction has the same ceiling as its neighbour.
  let lastKnown = Number.NaN;
  for (const point of points) {
    if (Number.isNaN(point.available)) point.available = lastKnown;
    else lastKnown = point.available;
  }
  const firstKnown = points.find((p) => !Number.isNaN(p.available))?.available;
  const fallback = firstKnown ?? input.currentCredits + running;
  for (const point of points) {
    if (Number.isNaN(point.available)) point.available = fallback;
  }

  const latest = points[points.length - 1];
  const spent = latest.spent;
  const available = latest.available;

  const daysElapsed = (now - start) / MS_PER_DAY;
  const perBucket =
    daysElapsed >= MIN_DAYS_FOR_A_RATE && spent > 0
      ? spent / Math.max(1, daysElapsed / bucketDays)
      : null;

  let overageAt: number | null = null;
  let overageIsMeasured = false;

  const crossed = points.findIndex((p) => p.spent >= p.available && p.available > 0);
  if (crossed >= 0) {
    overageAt = crossed;
    overageIsMeasured = true;
  } else if (perBucket !== null && perBucket > 0) {
    // The forecast is deliberately flat: today's rate, carried forward, against today's ceiling.
    // A workspace that tops up changes both terms, and it will see the change on its next visit —
    // which is more honest than a curve that models a purchase nobody has made.
    const bucketsToCeiling = (available - spent) / perBucket;
    const at = points.length - 1 + bucketsToCeiling;
    if (at <= bucketsInCycle - 1) overageAt = at;
  }

  return {
    points,
    bucketSize: activity.bucketSize,
    bucketsInCycle,
    available,
    spent,
    perBucket,
    overageAt,
    overageIsMeasured,
    evenPacePerBucket: activity.evenPacePerBucket,
  };
}
