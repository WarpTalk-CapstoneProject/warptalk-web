/**
 * Contracts for the two admin content-management surfaces (CMS v2), both served by the
 * notification service under the gateway route the portal already has for it.
 *
 * Email: `~/api/v1/admin/notifications/email-templates` (content: every catalog email, per locale,
 * with a draft side and a published side) and `~/api/v1/admin/notifications/email-blocks`
 * (templates: layouts and reusable blocks). Senders read only published content.
 *
 * Announcements: `~/api/v1/admin/notifications/announcements` (admin) and
 * `~/api/v1/notifications/announcements` (what the signed-in user is shown, and their events).
 */

// ── Shared ──────────────────────────────────────────────────────────────────────────────────

export interface BulkItemResultDto {
  id: string;
  succeeded: boolean;
  error: string | null;
}

export interface BulkResultDto {
  items: BulkItemResultDto[];
  succeeded: number;
  failed: number;
}

// ── Email content ───────────────────────────────────────────────────────────────────────────

export const EMAIL_LOCALES = ["en", "vi", "ja"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export interface EmailTemplateVariableDto {
  name: string;
  description: string;
  sample: string;
  /** The template must reference it; publishing is refused without it. */
  required: boolean;
  multiline: boolean;
}

export interface EmailContentFieldsDto {
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  /** Null derives the plain text from the HTML. */
  textBody: string | null;
  /** Null uses the default layout. */
  layoutId: string | null;
}

export interface EmailVariantSummaryDto {
  id: string;
  locale: EmailLocale | string;
  status: "ACTIVE" | "ARCHIVED" | string;
  publishedVersion: number;
  hasDraftChanges: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string;
  draftUpdatedBy: string;
}

export interface EmailDeliveryTotalsDto {
  sent: number;
  failed: number;
}

export type EmailProvider = "Resend" | "SMTP";

export interface EmailTemplateListItemDto {
  key: string;
  name: string;
  description: string;
  service: string;
  provider: EmailProvider | string;
  trigger: string;
  isLive: boolean;
  dormantReason: string | null;
  variables: EmailTemplateVariableDto[];
  /** The English subject senders use now, placeholders unfilled. */
  subject: string;
  /** The layout English uses now; null is the built-in layout. */
  layoutName: string | null;
  variants: EmailVariantSummaryDto[];
  hasDraftChanges: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  last30Days: EmailDeliveryTotalsDto;
}

export interface EmailVariantDto {
  id: string;
  locale: EmailLocale | string;
  status: "ACTIVE" | "ARCHIVED" | string;
  draft: EmailContentFieldsDto;
  published: EmailContentFieldsDto | null;
  publishedVersion: number;
  hasDraftChanges: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string;
  draftUpdatedBy: string;
  archivedAt: string | null;
}

export interface EmailSampleDataSetDto {
  /** The all-zero GUID for the built-in set. */
  id: string;
  name: string;
  values: Record<string, string>;
  builtIn: boolean;
  updatedAt: string | null;
}

export interface EmailTemplateDetailDto {
  template: EmailTemplateListItemDto;
  default: EmailContentFieldsDto;
  variants: EmailVariantDto[];
  sampleSets: EmailSampleDataSetDto[];
  supportedLocales: string[];
}

export interface SaveEmailDraftRequest {
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  textBody: string | null;
  layoutId: string | null;
  expectedDraftUpdatedAt: string | null;
}

export interface PublishEmailRequest {
  note: string | null;
  expectedPublishedVersion: number | null;
}

export interface EmailTemplateIssueDto {
  field: string;
  code: string;
  message: string;
}

export interface EmailPreviewRequest {
  locale: string;
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  textBody: string | null;
  layoutId: string | null;
  sampleSetId: string | null;
  values: Record<string, string> | null;
  dark: boolean;
}

export interface EmailPreviewDto {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  issues: EmailTemplateIssueDto[];
  layoutName: string;
}

export interface EmailTestSendRequest {
  locale: string;
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  textBody: string | null;
  layoutId: string | null;
  recipients: string[];
  sampleSetId: string | null;
  values: Record<string, string> | null;
}

export interface EmailTestSendDto {
  sentTo: string[];
  failed: string[];
  subject: string;
}

/** A published version; `fields` is the snapshot, compared field by field in the diff view. */
export interface EmailCmsVersionDto {
  version: number;
  action: string;
  fields: Record<string, string | null>;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SaveSampleDataSetRequest {
  name: string;
  values: Record<string, string>;
}

export interface EmailStatsDto {
  days: number;
  totals: EmailDeliveryTotalsDto;
  daily: { day: string; sent: number; failed: number }[];
  byLocale: { locale: string; sent: number; failed: number }[];
}

export type EmailBulkAction = "publish" | "discard" | "archive" | "duplicate";

export interface EmailBulkRequest {
  action: EmailBulkAction;
  keys: string[];
  locale: string | null;
  targetLocale: string | null;
}

// ── Email templates (layouts and blocks) ────────────────────────────────────────────────────

export type EmailBlockKind = "LAYOUT" | "PARTIAL";

export interface EmailBlockFieldsDto {
  html: string;
  text: string | null;
  darkCss: string | null;
}

export interface EmailBlockDto {
  id: string;
  kind: EmailBlockKind | string;
  key: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED" | string;
  isDefault: boolean;
  draft: EmailBlockFieldsDto;
  published: EmailBlockFieldsDto | null;
  publishedVersion: number;
  hasDraftChanges: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string;
  draftUpdatedBy: string;
  archivedAt: string | null;
  createdAt: string;
  /** What a publish would change: "auth.verify-email (vi)", "layout: Brand". */
  usedBy: string[];
}

export interface CreateEmailBlockRequest {
  kind: EmailBlockKind;
  key: string;
  name: string;
  description: string | null;
  html: string;
  text: string | null;
  darkCss: string | null;
}

export interface SaveEmailBlockDraftRequest {
  name: string;
  description: string | null;
  html: string;
  text: string | null;
  darkCss: string | null;
  expectedDraftUpdatedAt: string | null;
}

export interface EmailBlockPreviewRequest {
  html: string;
  text: string | null;
  darkCss: string | null;
  templateKey: string | null;
  locale: string | null;
  dark: boolean;
}

export type EmailBlockBulkAction = "publish" | "archive" | "delete" | "duplicate";

// ── Announcements ───────────────────────────────────────────────────────────────────────────

export const ANNOUNCEMENT_CMS_TYPES = ["ANNOUNCEMENT", "FEATURE", "MAINTENANCE", "PROMOTION"] as const;
export type AnnouncementCmsType = (typeof ANNOUNCEMENT_CMS_TYPES)[number];

export const ANNOUNCEMENT_AUDIENCE_MODES = ["ALL", "PLANS", "WORKSPACES"] as const;
export type AnnouncementAudienceMode = (typeof ANNOUNCEMENT_AUDIENCE_MODES)[number];

export const ANNOUNCEMENT_PLACEMENTS = [
  "TOP_BANNER",
  "MODAL",
  "TOAST",
  "NOTIFICATION_CENTER",
  "DASHBOARD_CARD",
] as const;
export type AnnouncementPlacement = (typeof ANNOUNCEMENT_PLACEMENTS)[number];

export const ANNOUNCEMENT_VARIANTS = ["SUBTLE", "SOLID", "OUTLINE"] as const;
export type AnnouncementVariant = (typeof ANNOUNCEMENT_VARIANTS)[number];

export const ANNOUNCEMENT_COLORS = ["BRAND", "BLUE", "GREEN", "AMBER", "RED", "VIOLET", "NEUTRAL"] as const;
export type AnnouncementColor = (typeof ANNOUNCEMENT_COLORS)[number];

export const ANNOUNCEMENT_FREQUENCIES = ["UNTIL_DISMISSED", "ONCE", "EVERY_SESSION", "DAILY"] as const;
export type AnnouncementFrequency = (typeof ANNOUNCEMENT_FREQUENCIES)[number];

export const ANNOUNCEMENT_ROLES = ["Owner", "Admin", "Member"] as const;
export const ANNOUNCEMENT_LOCALES = ["en", "vi", "ja"] as const;

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
  placement: AnnouncementPlacement | string;
  variant: AnnouncementVariant | string;
  accentColor: AnnouncementColor | string;
  icon: string | null;
  imageUrl: string | null;
  priority: number;
  dismissible: boolean;
  frequency: AnnouncementFrequency | string;
  audienceMode: AnnouncementAudienceMode | string;
  audiencePlanSlugs: string[];
  audienceWorkspaceIds: string[];
  targetRoles: string[];
  targetLocales: string[];
  newUsersWithinDays: number | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaUrl: string | null;
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
  /** Per effective status, under the same search and filters. */
  counts: Partial<Record<AnnouncementEffectiveStatus, number>>;
}

export type AnnouncementSort = "updated" | "created" | "priority" | "title" | "starts";

export interface AdminAnnouncementCmsQuery {
  page?: number;
  pageSize?: number;
  status?: AnnouncementEffectiveStatus;
  search?: string;
  type?: AnnouncementCmsType;
  placement?: AnnouncementPlacement;
  sort?: AnnouncementSort;
  order?: "asc" | "desc";
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
  placement: AnnouncementPlacement;
  variant: AnnouncementVariant;
  accentColor: AnnouncementColor;
  icon: string | null;
  imageUrl: string | null;
  priority: number;
  dismissible: boolean;
  frequency: AnnouncementFrequency;
  targetRoles: string[];
  targetLocales: string[];
  newUsersWithinDays: number | null;
  secondaryCtaLabel: string | null;
  secondaryCtaUrl: string | null;
}

/** No startsAt publishes now; a future one schedules. */
export interface PublishAnnouncementRequest {
  startsAt?: string | null;
}

export type AnnouncementBulkAction = "publish" | "archive" | "delete" | "duplicate";

export interface AnnouncementAnalyticsDto {
  days: number;
  totals: {
    uniqueViewers: number;
    impressions: number;
    dismissals: number;
    uniqueCtaClickers: number;
    ctaClicks: number;
    secondaryClicks: number;
    clickThroughRate: number;
    dismissRate: number;
  };
  daily: { day: string; impressions: number; dismissals: number; ctaClicks: number; secondaryClicks: number }[];
}

export interface AnnouncementAssetDto {
  id: string;
  /** Server-relative path ("/api/v1/notifications/announcements/assets/{id}"). */
  url: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** An announcement as the people it is for see it. */
export interface ViewerAnnouncementDto {
  id: string;
  title: string;
  bodyMarkdown: string;
  type: AnnouncementCmsType | string;
  placement: AnnouncementPlacement | string;
  variant: AnnouncementVariant | string;
  accentColor: AnnouncementColor | string;
  icon: string | null;
  imageUrl: string | null;
  priority: number;
  dismissible: boolean;
  frequency: AnnouncementFrequency | string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
}

export type AnnouncementEventType = "IMPRESSION" | "DISMISS" | "CTA_CLICK" | "SECONDARY_CLICK";

// ── Audit trail (History tabs) ──────────────────────────────────────────────────────────────

/**
 * One entry of the platform audit log, as the History tabs read it — the shape of
 * AdminAuditLogEntryDto on GET /admin/audit-log (cursor-paged; only `items` is read here).
 */
export interface CmsAuditEntryDto {
  id: string;
  performedAt: string;
  sourceService: string;
  action: string;
  actor: { id: string; name: string | null; email: string | null };
  entity: { type: string; id: string | null; key: string | null; label: string | null };
  reason: string | null;
  /** "succeeded" or "failed". */
  result: string;
  errorMessage: string | null;
  beforeSummary: Record<string, string | null> | null;
  afterSummary: Record<string, string | null> | null;
}
