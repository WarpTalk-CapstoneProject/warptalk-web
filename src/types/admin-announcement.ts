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
  /** When the last delivery chunk was counted (backend#406). Null while Pending, and absent from
   *  notification builds older than that. */
  sentAt?: string | null;
  /** How many recipient rows were written. Absent from builds older than backend#406. */
  deliveredCount?: number | null;
}

/**
 * `AdminNotificationDetailDto` — `GET ~/api/v1/admin/notifications/{id}`.
 *
 * `targetAudienceData` and `payload` are JSON serialized into strings by the server
 * (`AdminNotificationMapper.ToEntity`), not nested objects; parse them before reading.
 * `sentAt` and `deliveredCount` arrived with backend#406 and are optional for older builds.
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
  sentAt?: string | null;
  deliveredCount?: number | null;
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
