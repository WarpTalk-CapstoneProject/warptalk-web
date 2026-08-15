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
}

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
}
