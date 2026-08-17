/**
 * Presentation rules for the admin feedback report.
 *
 * Pure, and separate from the page, because every rule here is a decision about not overstating
 * a number: which averages are printable, when a sample is too thin to read, and what a missing
 * denominator means. Those are the parts worth pinning with tests.
 */

import type { AdminFeedbackDimensionDto } from "@/types/admin-feedback";

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
