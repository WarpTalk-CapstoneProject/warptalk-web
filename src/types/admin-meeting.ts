/**
 * Contracts for the system-admin meeting directory (`~/api/v1/admin/meetings`).
 *
 * METADATA ONLY. There is no description, no settings and no transcript on the wire — what was
 * said in a meeting belongs to the workspace that held it, and the API does not send it.
 */

/** A real room status, or the pseudo-status "live" which spans IN_PROGRESS and PAUSED. */
export type AdminMeetingStatusFilter =
  | "all"
  | "live"
  | "SCHEDULED"
  | "WAITING"
  | "IN_PROGRESS"
  | "PAUSED"
  | "ENDED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type AdminMeetingSort = "recent_desc" | "recent_asc" | "duration_desc";

export interface AdminMeetingSummaryDto {
  id: string;
  workspaceId: string;
  title: string;
  translationRoomCode: string;
  status: string;
  translationRoomType: string;
  sourceLanguage: string;
  targetLanguages: string[];
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  /** Distinct people who were ever in the room — not who is in it now. */
  attendedCount: number;
  createdAt: string;
}

/** Read at one instant server-side, so the two cannot disagree the way two requests would. */
export interface AdminMeetingCountsDto {
  liveNow: number;
  startedToday: number;
}

export interface AdminMeetingDirectoryQuery {
  page?: number;
  pageSize?: number;
  status?: AdminMeetingStatusFilter;
  workspaceId?: string;
  from?: string;
  to?: string;
  sort?: AdminMeetingSort;
}
