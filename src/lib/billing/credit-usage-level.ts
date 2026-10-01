/**
 * How worried the Billing page should look about a workspace's credit balance. WT-878.
 *
 * ONE RULE FOR BAR, NUMBER, LABEL AND BANNER
 *   The "running low" threshold used to live in three places that disagreed (15% on the Billing
 *   tile, 15% on the dashboard, 10% in the layout banner). This wraps the banner's constants from
 *   ./usage-warning so the meter on the Billing page can never turn amber at a different moment
 *   than the banner appears. It deliberately mirrors `decideUsageWarning`'s arithmetic step for
 *   step (fraction clamped to 0..1, the same floor for the critical cut) and the parity test pins
 *   that: `level` is neither "ok" nor "unknown" exactly when the banner would speak.
 *
 * WHAT "UNKNOWN" IS FOR
 *   A workspace whose ceiling is 0 (a plan with no allowance, a brand-new cycle) has no percentage:
 *   0 / 0 is undefined, not 0%. The level says so and the caller draws no bar, instead of a red
 *   "0% left" that nobody can clear or a NaN in the DOM.
 *
 * Pure, and importing only siblings by relative path, so node's test runner can load it.
 */

import { CRITICAL_AT_OR_BELOW_PERCENT, WARN_BELOW_FRACTION } from "./usage-warning.ts";

export type CreditUsageLevel = "ok" | "warn" | "critical" | "full" | "unknown";

export interface CreditUsageLevelResult {
  level: CreditUsageLevel;
  /** 0..1 of the allowance still available; null when the level is "unknown". */
  remainingFraction: number | null;
  /** Whole percent, floored (4.9% reads 4) — null when the level is "unknown". */
  remainingPercent: number | null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function creditUsageLevel(input: {
  currentCredits: number | null | undefined;
  totalCredits: number | null | undefined;
}): CreditUsageLevelResult {
  const remaining = finiteNumber(input.currentCredits);
  const total = finiteNumber(input.totalCredits);
  if (remaining === null || total === null || total <= 0) {
    return { level: "unknown", remainingFraction: null, remainingPercent: null };
  }

  // Clamped: a negative balance (overage) is 0% left, not a negative percentage.
  const remainingFraction = Math.max(0, Math.min(1, remaining / total));
  const remainingPercent = Math.floor(remainingFraction * 100);

  let level: CreditUsageLevel;
  if (remainingFraction <= 0) level = "full";
  else if (remainingPercent <= CRITICAL_AT_OR_BELOW_PERCENT) level = "critical";
  else if (remainingFraction <= WARN_BELOW_FRACTION) level = "warn";
  else level = "ok";

  return { level, remainingFraction, remainingPercent };
}
