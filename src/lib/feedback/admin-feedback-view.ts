/**
 * Presentation rules for the admin feedback report.
 *
 * Pure, and separate from the page, because every rule here is a decision about not overstating
 * a number: which averages are printable, when a sample is too thin to read, and what a missing
 * denominator means. Those are the parts worth pinning with tests.
 */

import type {
  AdminFeedbackConfidence,
  AdminFeedbackDimensionDto,
} from "@/types/admin-feedback";

export const DIMENSION_LABELS: Record<string, string> = {
  overallRating: "Overall",
  translationQuality: "Translation quality",
  audioQuality: "Audio quality",
  voiceCloneQuality: "Voice clone quality",
  aiSummaryQuality: "AI summary quality",
};

export function dimensionLabel(key: string): string {
  return DIMENSION_LABELS[key] ?? key;
}

/**
 * Below this, an average is shown but marked as a thin sample.
 *
 * Not a hard hide: a 1.0 from four people is worth seeing. It is the confident-looking "4.8" from
 * four people that misleads, and a label costs nothing.
 */
export const THIN_SAMPLE_THRESHOLD = 10;

export function isThinSample(dimension: AdminFeedbackDimensionDto): boolean {
  return dimension.responseCount > 0 && dimension.responseCount < THIN_SAMPLE_THRESHOLD;
}

/**
 * One decimal, or an em dash when nobody answered.
 *
 * Never "0.0". Zero out of five is the worst score the scale has, and nobody answering is not a
 * score at all.
 */
export function formatAverage(average: number | null): string {
  if (average == null) return "—";
  return average.toFixed(1);
}

/**
 * A whole-percent response rate, or an em dash when there is no denominator.
 *
 * Null means no meeting ended in the window, so no meeting could have been rated. Printing 0%
 * would say every eligible meeting went unrated when none was eligible.
 */
export function formatResponseRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

/**
 * The share of this dimension's responses that sat at each rating, 1..5.
 *
 * Returns zeroes when nobody answered rather than dividing by zero — the bar simply renders
 * empty, which is the honest picture of no data.
 */
export function distributionShares(dimension: AdminFeedbackDimensionDto): number[] {
  const total = dimension.distribution.reduce((sum, count) => sum + count, 0);
  if (total === 0) return dimension.distribution.map(() => 0);
  return dimension.distribution.map((count) => count / total);
}

/**
 * Rating 1..5 → the tone the bar segment is painted in. Low is bad, high is good; the middle is
 * neutral rather than amber, because a 3 is not a warning.
 */
export function ratingTone(rating: number): "bad" | "neutral" | "good" {
  if (rating <= 2) return "bad";
  if (rating === 3) return "neutral";
  return "good";
}

/**
 * WT-694: how far to trust a dimension. The server decides (n, response rate, share of
 * respondents); a backend that predates the field falls back to the old thin-sample rule, and
 * nobody answering is always `none` — "no data", never a score.
 */
export function confidenceOf(dimension: AdminFeedbackDimensionDto): AdminFeedbackConfidence {
  if (dimension.responseCount === 0) return "none";
  if (dimension.confidence) return dimension.confidence;
  return isThinSample(dimension) ? "low" : "ok";
}

/**
 * The trend against the previous window, as the server computed it: "+0.3", "−0.2", "±0.0", or
 * null when either side had no answers (a trend from nothing is not a trend).
 */
export function formatAverageDelta(delta: number | null | undefined): string | null {
  if (delta == null) return null;
  // Rounded on the magnitude, so −0.25 and +0.25 round the same way (Math.round is not symmetric).
  const magnitude = Math.round(Math.abs(delta) * 10) / 10;
  if (magnitude === 0) return "±0.0";
  return `${delta > 0 ? "+" : "−"}${magnitude.toFixed(1)}`;
}

/** Up is good for every rating dimension. A move under 0.1 is flat, not a signal. */
export function deltaTone(delta: number | null | undefined): "good" | "bad" | "flat" | null {
  if (delta == null) return null;
  if (Math.abs(delta) < 0.1) return "flat";
  return delta > 0 ? "good" : "bad";
}

/** A 0..1 share as a whole percent, or an em dash when there is none. */
export function formatShare(share: number | null | undefined): string {
  if (share == null) return "—";
  return `${Math.round(share * 100)}%`;
}
