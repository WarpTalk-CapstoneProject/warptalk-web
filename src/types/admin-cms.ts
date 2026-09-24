/**
 * Contracts for the two admin content-management surfaces, both served by the notification
 * service under the gateway route the portal already has for it (`/admin/notifications/*`).
 *
 * Email templates: `~/api/v1/admin/notifications/email-templates` — the list is the backend's
 * EmailTemplateCatalog (every email a sender composes), not a table scan, so an email with no
 * edits is still listed.
 *
 * Announcements: `~/api/v1/admin/notifications/announcements` (admin) and
 * `~/api/v1/notifications/announcements` (what the signed-in user is shown).
 */

// ── Email templates ─────────────────────────────────────────────────────────────────────────

export interface EmailTemplateVariableDto {
  name: string;
  description: string;
  /** What the preview and the test email put in its place. */
  sample: string;
  /** The template must reference it; the server refuses a save without it. */
  required: boolean;
}

export interface EmailTemplateContentDto {
  subject: string;
  heading: string;
  bodyHtml: string;
}

export type EmailProvider = "Resend" | "SMTP";

export interface EmailTemplateSummaryDto {
  key: string;
  name: string;
  description: string;
  service: string;
  provider: EmailProvider | string;
  trigger: string;
  isLive: boolean;
  dormantReason: string | null;
  variables: EmailTemplateVariableDto[];
  /** An admin-saved version is what senders use now. */
  isCustomized: boolean;
  /** 0 when never saved. */
  version: number;
  /** The subject senders use now, placeholders unfilled. */
  subject: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface EmailTemplateDetailDto {
  template: EmailTemplateSummaryDto;
  current: EmailTemplateContentDto;
  default: EmailTemplateContentDto;
}

export interface SaveEmailTemplateRequest extends EmailTemplateContentDto {
  expectedVersion: number | null;
  note: string | null;
}

export interface EmailTemplateIssueDto {
  field: "subject" | "heading" | "bodyHtml" | string;
  code: string;
  message: string;
}

export interface EmailTemplatePreviewDto {
  subject: string;
  html: string;
  text: string;
  issues: EmailTemplateIssueDto[];
}

export interface EmailTemplateTestSendDto {
  sentTo: string;
  subject: string;
}

export type EmailTemplateVersionAction = "SAVED" | "RESTORED" | "RESET";

export interface EmailTemplateVersionDto {
  version: number;
  action: EmailTemplateVersionAction | string;
  restoredFromVersion: number | null;
  subject: string;
  heading: string;
  bodyHtml: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

// ── Announcements ───────────────────────────────────────────────────────────────────────────

export const ANNOUNCEMENT_CMS_TYPES = ["ANNOUNCEMENT", "FEATURE", "MAINTENANCE", "PROMOTION"] as const;
export type AnnouncementCmsType = (typeof ANNOUNCEMENT_CMS_TYPES)[number];

export const ANNOUNCEMENT_AUDIENCE_MODES = ["ALL", "PLANS", "WORKSPACES"] as const;
export type AnnouncementAudienceMode = (typeof ANNOUNCEMENT_AUDIENCE_MODES)[number];

/** Stored. */
export type AnnouncementStoredStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** What it means right now. SCHEDULED and ENDED are PUBLISHED read against the window. */
export const ANNOUNCEMENT_EFFECTIVE_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "ENDED",
  "ARCHIVED",
] as const;
export type AnnouncementEffectiveStatus = (typeof ANNOUNCEMENT_EFFECTIVE_STATUSES)[number];

export interface AdminAnnouncementCmsDto {
  id: string;
  title: string;
  bodyMarkdown: string;
  type: AnnouncementCmsType | string;
  status: AnnouncementStoredStatus | string;
  effectiveStatus: AnnouncementEffectiveStatus | string;
  audienceMode: AnnouncementAudienceMode | string;
  audiencePlanSlugs: string[];
  audienceWorkspaceIds: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAnnouncementCmsPageDto {
  items: AdminAnnouncementCmsDto[];
  total: number;
  page: number;
  pageSize: number;
  /** Per effective status, under the same search. */
  counts: Partial<Record<AnnouncementEffectiveStatus, number>>;
}

export interface AdminAnnouncementCmsQuery {
  page?: number;
  pageSize?: number;
  status?: AnnouncementEffectiveStatus;
  search?: string;
}

/** Create/edit body. Exactly these fields: the service rejects unknown ones. */
export interface UpsertAnnouncementRequest {
  title: string;
  bodyMarkdown: string;
  type: AnnouncementCmsType;
  audienceMode: AnnouncementAudienceMode;
  audiencePlanSlugs: string[];
  audienceWorkspaceIds: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

/** No startsAt publishes now; a future one schedules. */
export interface PublishAnnouncementRequest {
  startsAt?: string | null;
}

/** An announcement as the people it is for see it. */
export interface ViewerAnnouncementDto {
  id: string;
  title: string;
  bodyMarkdown: string;
  type: AnnouncementCmsType | string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
}
