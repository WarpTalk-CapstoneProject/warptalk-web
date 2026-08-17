/**
 * The shape of a billing cycle's spending, over time, from the transaction ledger.
 *
 * WHY THIS EXISTS
 *   The billing page's only chart was `UsageChart`: consumed-vs-topped-up per MONTH of a calendar
 *   year. On a monthly plan that is one bar for the cycle you are actually in, which cannot answer
 *   the only question an owner opens billing with — "why did we burn through it this time?" A
 *   month's credits are usually spent on a handful of days, and a per-month bar hides exactly the
 *   spike that explains the bill.
 *
 * WHAT IT REFUSES TO DO
 *   It never draws a bucket that has not happened yet. Padding the rest of the cycle with zeroes
 *   makes every workspace look like it fell off a cliff today, and the flat tail reads as measured
 *   silence rather than as the future. The series stops at the bucket containing `now`.
 *
 * THE PACE LINE
 *   `evenPacePerBucket` is the rate at which the cycle's allowance would last exactly to renewal.
 *   It is the reference the bars are read against: a bar above it is a bucket that outran the plan.
 *   Without it a bar chart of credits is just numbers with heights — nothing on it says whether
 *   40,000 in a day was normal or the reason the workspace ran dry.
 */

import type { CreditTransactionDto } from "@/types/billing";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Above this many days, one bar per day stops being a chart and becomes a texture — a yearly plan
 * would draw 365 of them. Longer cycles are bucketed by week instead.
 */
const MAX_DAILY_BUCKETS = 62;

export type BucketSize = "day" | "week";

export interface ActivityBucket {
  /** Local midnight at the start of the bucket. */
  start: Date;
  /** Credits spent in this bucket, as a positive number. */
  consumed: number;
  /** Credits added in this bucket. */
  toppedUp: number;
}

export interface CycleActivity {
  buckets: ActivityBucket[];
  bucketSize: BucketSize;
  /** The per-bucket rate at which the allowance lasts exactly to renewal, or null if unknowable. */
  evenPacePerBucket: number | null;
  /** Sum over the buckets — the cycle to date, not the workspace's lifetime. */
  totalConsumed: number;
  totalToppedUp: number;
  /** The busiest bucket, or null when nothing was spent. Named on the chart as the peak. */
  busiest: ActivityBucket | null;
}

export interface CycleActivityInput {
  transactions: CreditTransactionDto[];
  /** ISO datetimes, straight off `CreditBalanceDto`. */
  currentPeriodStart: string;
  currentPeriodEnd: string;
  /** The cycle's full allowance, used only for the pace line. */
  totalCredits: number;
}

/** Local midnight of the day containing `ms`. */
function startOfLocalDay(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function summariseCycleActivity(
  input: CycleActivityInput,
  now: number,
): CycleActivity | null {
  const start = new Date(input.currentPeriodStart).getTime();
  const end = new Date(input.currentPeriodEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const cycleDays = Math.max(1, Math.round((end - start) / MS_PER_DAY));
  const bucketSize: BucketSize = cycleDays > MAX_DAILY_BUCKETS ? "week" : "day";
  const bucketDays = bucketSize === "week" ? 7 : 1;

  // The first bucket opens on the cycle's first LOCAL day, so a cycle that began at 17:40 does not
  // put its opening top-up in a bucket labelled the day before.
  const firstBucket = startOfLocalDay(start).getTime();

  // Only buckets that have started. `now` before the cycle (a clock skew, or a cycle that renews
  // in the future) yields one bucket rather than none, so the chart has an axis to draw.
  const elapsedBuckets = Math.floor((now - firstBucket) / (bucketDays * MS_PER_DAY)) + 1;
  const totalBuckets = Math.ceil((end - firstBucket) / (bucketDays * MS_PER_DAY));
  const bucketCount = Math.max(1, Math.min(elapsedBuckets, totalBuckets));

  const buckets: ActivityBucket[] = Array.from({ length: bucketCount }, (_, index) => ({
    start: new Date(firstBucket + index * bucketDays * MS_PER_DAY),
    consumed: 0,
    toppedUp: 0,
  }));

  for (const tx of input.transactions) {
    const at = new Date(tx.createdAt).getTime();
    if (!Number.isFinite(at)) continue;

    const index = Math.floor((at - firstBucket) / (bucketDays * MS_PER_DAY));
    const bucket = buckets[index];
    // The array IS the cycle filter, and deliberately the only one. The history endpoint is paged,
    // not cycle-scoped, so a page routinely reaches back past the last renewal; anything before the
    // first bucket indexes negative and anything after the last STARTED bucket indexes past the
    // end, and both land here. An explicit `at < start || at > end` test above read as the
    // mechanism while contributing nothing — deleting it changed no result.
    if (!bucket) continue;

    // Sign, not `type`: an adjustment can go either way, and a refund arrives as a positive
    // consume-shaped row. What moved the balance is the only thing that is always true.
    if (tx.amount < 0) bucket.consumed += -tx.amount;
    else bucket.toppedUp += tx.amount;
  }

  const totalConsumed = buckets.reduce((sum, b) => sum + b.consumed, 0);
  const totalToppedUp = buckets.reduce((sum, b) => sum + b.toppedUp, 0);

  const busiest = buckets.reduce<ActivityBucket | null>(
    (best, b) => (b.consumed > 0 && (!best || b.consumed > best.consumed) ? b : best),
    null,
  );

  const evenPacePerBucket =
    input.totalCredits > 0 ? (input.totalCredits / cycleDays) * bucketDays : null;

  return { buckets, bucketSize, evenPacePerBucket, totalConsumed, totalToppedUp, busiest };
}

/**
 * What one credit bought, per service, this cycle.
 *
 * `usageCount` has been on the wire since the endpoint was written and no surface has ever shown
 * it — the billing page displayed credits alone, which cannot distinguish "translation is
 * expensive" from "we translate a lot". The average is the number that separates the two, and it
 * is the one a workspace acts on.
 */
export interface ServiceUsageRow {
  usageType: string;
  credits: number;
  uses: number;
  /** Credits per use, or null when nothing was used — never 0, which would read as free. */
  creditsPerUse: number | null;
  /** Share of the period's total consumption, 0-100. */
  share: number;
}

export function summariseServiceUsage(
  rows: { usageType: string; totalCreditsConsumed: number; usageCount: number }[],
): ServiceUsageRow[] {
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.totalCreditsConsumed), 0);

  return rows
    .filter((r) => r.totalCreditsConsumed > 0 || r.usageCount > 0)
    .map((r) => ({
      usageType: r.usageType,
      credits: r.totalCreditsConsumed,
      uses: r.usageCount,
      creditsPerUse: r.usageCount > 0 ? r.totalCreditsConsumed / r.usageCount : null,
      share: total > 0 ? (r.totalCreditsConsumed / total) * 100 : 0,
    }))
    .sort((a, b) => b.credits - a.credits);
}
