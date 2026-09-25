/**
 * Contracts for the system-admin feedback report (`~/api/v1/admin/feedback`).
 *
 * Read-only and aggregated. Comments arrive without the person who wrote them: a rating is
 * feedback about the product, and attaching a name to it makes a record about a person instead.
 */

/** Field names as the API sends them, so nothing has to be translated on the way in. */
export type AdminFeedbackDimensionKey =
  | "overallRating"
  | "translationQuality"
  | "audioQuality"
  | "voiceCloneQuality"
  | "aiSummaryQuality";

export interface AdminFeedbackDimensionDto {
  dimension: AdminFeedbackDimensionKey | string;
  /**
   * How many people answered THIS dimension. Four of the five are optional, so an average of 4.8
   * from three people must not be read beside one from three hundred without saying which.
   */
  responseCount: number;
  /** Null when nobody rated it. Not zero — zero out of five is the worst score there is. */
  averageRating: number | null;
  /** Counts for ratings 1..5, index 0 being a rating of 1. */
  distribution: number[];
  // ── WT-694, computed server-side. Optional: absent from a backend that predates it. ──
  /** Respondents who answered this dimension ÷ all respondents; null when nobody responded. */
  responseShare?: number | null;
  /** `none` (nobody answered — "no data", not a score), `low` (thin sample) or `ok`. */
  confidence?: AdminFeedbackConfidence;
  /** Why the confidence is what it is; null when `ok`. */
  confidenceNote?: string | null;
  previousResponseCount?: number;
  /** Same dimension, previous window of equal length. Null when nobody answered then. */
  previousAverageRating?: number | null;
  previousConfidence?: AdminFeedbackConfidence;
  /** Current − previous average; null unless both exist. Never computed client-side. */
  averageDelta?: number | null;
}

export type AdminFeedbackConfidence = "none" | "low" | "ok";

export interface AdminFeedbackSummaryDto {
  from: string;
  to: string;
  responseCount: number;
  ratedMeetings: number;
  /** The denominator. Without it, "4.6 out of 5" reads the same at a 90% and a 2% response rate. */
  endedMeetings: number;
  /** Null when nothing ended in the window — a rate with no denominator is not zero. */
  responseRate: number | null;
  dimensions: AdminFeedbackDimensionDto[];
  // ── WT-694 ──
  previousFrom?: string | null;
  previousTo?: string | null;
  previousResponseCount?: number;
  previousResponseRate?: number | null;
  /** Survey-level confidence; `confidenceNote` says why when not `ok`. */
  confidence?: AdminFeedbackConfidence;
  confidenceNote?: string | null;
  /** Weakest dimension by average, preferring trustworthy samples; null when nothing was rated. */
  lowestDimension?: string | null;
  /** Set when every candidate for `lowestDimension` was a thin sample. */
  lowestDimensionNote?: string | null;
  /** Dimensions nobody answered in the window (e.g. voice clone quality). */
  dimensionsWithoutData?: string[];
  /** The thresholds behind `low`, so the page states them instead of hardcoding them. */
  minResponses?: number;
  minRate?: number;
}

export interface AdminFeedbackCommentDto {
  translationRoomId: string;
  workspaceId: string;
  roomTitle: string;
  overallRating: number;
  comment: string;
  createdAt: string;
}

export interface AdminFeedbackQuery {
  page?: number;
  pageSize?: number;
  workspaceId?: string;
  /** Measured against when the rating was submitted, not when the meeting ran. */
  from?: string;
  to?: string;
  /** Comments only: `recent` (default) or `lowest` — lowest overall rating first (WT-694). */
  sort?: "recent" | "lowest";
  /** Comments only: matched against the comment text and the room title. */
  search?: string;
  /** Comments only: bounds on the overall rating, 1..5 inclusive. */
  minRating?: number;
  maxRating?: number;
}
