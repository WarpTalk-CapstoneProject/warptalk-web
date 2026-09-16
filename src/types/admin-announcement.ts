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

/**
 * `AdminNotificationDetailDto` — `GET ~/api/v1/admin/notifications/{id}`.
 *
 * `targetAudienceData` and `payload` are JSON serialized into strings by the server
 * (`AdminNotificationMapper.ToEntity`), not nested objects; parse them before reading.
 * There is no sent-at timestamp and no delivery count on this record.
 */
export interface AdminAnnouncementDetailDto {
  id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  targetAudienceMode: string;
  /** JSON string: `{ segmentId?: string, userIds?: string[] }`. */
  targetAudienceData: string;
  /** JSON string: `{ imageUrl?, ctaLink?, discountCode?, severity?, actionRequired?, downtimeStart?, downtimeEnd? }`. */
  payload: string;
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
