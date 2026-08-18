/**
 * Contracts for platform announcements (`~/api/v1/admin/notifications`).
 *
 * Note the envelope: this endpoint predates the shared AdminPagedResult and returns `totalCount`,
 * not `total`. Reusing AdminPagedResult here would silently read undefined and render "0 of 0"
 * over a full list.
 */

export interface AdminAnnouncementSummaryDto {
  id: string;
  title: string;
  type: string;
  status: string;
  /** How the audience was chosen — all users, a plan tier, a specific list. */
  targetAudienceMode: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAnnouncementPageDto {
  items: AdminAnnouncementSummaryDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface AdminAnnouncementQuery {
  page?: number;
  pageSize?: number;
}
