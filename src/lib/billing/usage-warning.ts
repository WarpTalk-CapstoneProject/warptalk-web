/**
 * When to tell a workspace it is about to run out of credits, and what to say. WT-557.
 *
 * WHY THE DECISION IS HERE AND NOT IN THE COMPONENT
 *   A warning banner has three ways to be wrong and only one of them is "it did not appear":
 *   it can shout at a workspace that is fine, it can keep shouting after somebody dismissed it,
 *   and it can stay quiet while things get worse because it was dismissed once at a gentler
 *   level. Those are rules, and rules that decide what a paying customer sees belong somewhere
 *   they can be read and tested rather than spread across a JSX tree.
 */

import type { CreditBalanceDto } from "@/types/billing";

/**
 * The share of the cycle's credits left when the banner appears.
 *
 * The ticket asks for "<= 10%". One threshold, not a ladder — a second, earlier warning at 20%
 * would be dismissed by everyone before the one that matters, which is how warnings stop being
 * read at all.
 */
export const WARN_BELOW_FRACTION = 0.1;

/**
 * The levels a dismissal is remembered AT.
 *
 * Dismissing at 10% must not silence 4%. Each crossing into a worse bucket is new information
 * and gets to speak once; within a bucket, "I have seen this" is respected. Descending, because
 * the first bucket a percentage falls into is the one it belongs to.
 */
export const WARNING_BUCKETS = [10, 5, 1, 0] as const;

/**
 * At or below this, the warning stops being amber and turns red.
 *
 * Here rather than in the component for the same reason the threshold above is: it is a second
 * rule about the same number, and a rule that lives in a `className` ternary is a rule nobody
 * tests and nobody finds when the product decision changes.
 */
export const CRITICAL_AT_OR_BELOW_PERCENT = 1;

export type UsageWarning = {
  /** Whole percent, floored — 4.9% reads "4%", never a rosier number than the truth. */
  percentRemaining: number;
  /** Which bucket this crossing belongs to; the dismissal key is built from it. */
  bucket: number;
  /** Past amber: this workspace is about to stop mid-meeting. */
  isCritical: boolean;
  creditsRemaining: number;
  totalCredits: number;
  /** "every week" · "every month" · "every 10 days" — null when the period makes no sense. */
  cadence: string | null;
  /** ISO instant the cycle rolls over, or null when the server did not give a usable one. */
  resetsAt: string | null;
};

function bucketFor(percentRemaining: number): number {
  for (const bucket of WARNING_BUCKETS) {
    if (percentRemaining <= bucket) continue;
    // percentRemaining sits above this bucket, so the previous one owned it.
    const index = WARNING_BUCKETS.indexOf(bucket as (typeof WARNING_BUCKETS)[number]);
    return WARNING_BUCKETS[Math.max(0, index - 1)];
  }
  return WARNING_BUCKETS[WARNING_BUCKETS.length - 1];
}

/**
 * How often this cycle rolls over, from the period it actually spans.
 *
 * Derived rather than read off the plan, because the plan's billing cycle is a different
 * vocabulary ("monthly"/"yearly" on the web, "month"/"year" in the backend constants — the gap
 * between those two has already produced two money bugs) and this sentence only has to describe
 * the dates in hand.
 */
export function describeCadence(startIso: string, endIso: string): string | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const days = Math.round((end - start) / 86_400_000);
  if (days <= 0) return null;
  if (days === 1) return "every day";
  if (days >= 6 && days <= 8) return "every week";
  if (days >= 13 && days <= 16) return "every 2 weeks";
  if (days >= 28 && days <= 31) return "every month";
  if (days >= 89 && days <= 93) return "every quarter";
  if (days >= 360 && days <= 370) return "every year";
  return `every ${days} days`;
}

/** "Aug 28 at 8:16 PM" — the shape the ticket asks for, in the app's one language. */
export function formatResetMoment(iso: string): string | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const date = new Date(at);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${day} at ${time}`;
}

/**
 * Whether to warn, and with what.
 *
 * Returns null for "say nothing", which is the answer in every ambiguous case:
 *
 *  - NO BALANCE YET. Loading, or the request failed. A banner that appears on a failed read is
 *    a banner that appears during a billing outage, at which point it is alarming a workspace
 *    about a number nobody has.
 *
 *  - NO CEILING. `totalCredits` is remaining + used-this-cycle, so it is 0 only when the
 *    workspace has neither — a brand-new cycle that has spent nothing, or a plan with no credit
 *    allowance at all. A percentage of zero is not 0%, it is undefined, and rendering
 *    "0% usage remaining" at a contract workspace that has never been metered would be a false
 *    alarm nobody can clear.
 *
 *  - ABOVE THE THRESHOLD. The ordinary case.
 */
export function decideUsageWarning(
  balance: CreditBalanceDto | null | undefined,
): UsageWarning | null {
  if (!balance) return null;

  const remaining = Number(balance.currentCredits);
  const total = Number(balance.totalCredits);
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return null;

  // Clamped: a negative balance (overage) is 0% left, not a negative percentage.
  const fraction = Math.max(0, Math.min(1, remaining / total));
  if (fraction > WARN_BELOW_FRACTION) return null;

  const percentRemaining = Math.floor(fraction * 100);

  return {
    percentRemaining,
    bucket: bucketFor(percentRemaining),
    isCritical: percentRemaining <= CRITICAL_AT_OR_BELOW_PERCENT,
    creditsRemaining: Math.max(0, remaining),
    totalCredits: total,
    cadence: describeCadence(balance.currentPeriodStart, balance.currentPeriodEnd),
    resetsAt: Number.isFinite(Date.parse(balance.currentPeriodEnd))
      ? balance.currentPeriodEnd
      : null,
  };
}

/**
 * The key a dismissal is stored under.
 *
 * Carries the workspace AND the bucket, so dismissing one workspace's warning does not silence
 * another's, and falling from 10% to 4% speaks again. Session-scoped by the caller — the ticket
 * asks for "tắt tạm thời … trong phiên làm việc hiện tại", and a dismissal that outlived the
 * session would hide the one warning that mattered on the day the credits actually ran out.
 */
export function dismissalKey(workspaceId: string, bucket: number): string {
  return `warptalk:usage-warning:${workspaceId}:${bucket}`;
}
