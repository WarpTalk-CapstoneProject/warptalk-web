/**
 * Pure formatting for the credit meter on Settings → Billing (WT-878). No `@/` imports, so
 * node:test can run it directly (`npm run test:credit-meter-format`).
 */

/** What the meter prints before "% used": a number (floored to 0.1) or "<1" for a sliver. */
export type UsedPercentLabel = number | "<1";

/**
 * The share of the cycle's credits used, as the meter labels it.
 *
 * Floored to one decimal so the label never overstates usage — but any non-zero use below 1%
 * reads "<1", not "0": 863 of 2,087,377 is spent credit, and "0% used" says nothing was. Exactly
 * zero stays 0. Capped at 100 (an overage cycle has spent more than it held).
 */
export function usedPercentLabel(used: number, total: number): UsedPercentLabel {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0 || used <= 0) return 0;
  const percent = (used / total) * 100;
  if (percent < 1) return "<1";
  return Math.min(100, Math.floor(percent * 10) / 10);
}

export type PaceProjectionMessage =
  | { key: "paceRunsOut"; values: { days: number; early: number } }
  | { key: "paceRunsOutAtEnd"; values: { days: number } }
  | { key: "paceRunsOutWithinDay"; values: { early: number } }
  | { key: "paceRunsOutWithinDayAtEnd"; values: Record<string, never> };

/**
 * Which `settingsBilling.meter` sentence describes a projected run-out.
 *
 * `daysToEmpty` is the projection (fractional days); `daysLeft` is the whole days left in the
 * cycle. Under one day the sentence says "within a day" — "in about 0 days" read as nonsense.
 */
export function paceProjectionMessage(daysToEmpty: number, daysLeft: number): PaceProjectionMessage {
  const days = Math.max(0, Math.floor(daysToEmpty));
  const early = Math.max(0, daysLeft - days);
  if (days < 1) {
    return early > 0
      ? { key: "paceRunsOutWithinDay", values: { early } }
      : { key: "paceRunsOutWithinDayAtEnd", values: {} };
  }
  return early > 0
    ? { key: "paceRunsOut", values: { days, early } }
    : { key: "paceRunsOutAtEnd", values: { days } };
}
