/**
 * The announcements CMS, minus React: the editor's draft, the request it becomes, the rules it
 * must pass, and which actions each status allows.
 *
 * Every rule mirrors one in AnnouncementRules (warptalk-backend notification service), named
 * beside it. The server stays the authority and its message is shown when it refuses anyway;
 * this exists so the editor can say what is wrong before the round-trip.
 *
 * Deliberately free of React and of `@/` imports so `node:test` runs it without a bundler.
 */

export const CMS_TYPES = ["ANNOUNCEMENT", "FEATURE", "MAINTENANCE", "PROMOTION"] as const;
export type CmsType = (typeof CMS_TYPES)[number];

export const AUDIENCE_MODES = ["ALL", "PLANS", "WORKSPACES"] as const;
export type AudienceMode = (typeof AUDIENCE_MODES)[number];

export const EFFECTIVE_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "ENDED", "ARCHIVED"] as const;
export type EffectiveStatus = (typeof EFFECTIVE_STATUSES)[number];

export const LIMITS = {
  title: 200,
  body: 20_000,
  ctaLabel: 60,
  ctaUrl: 2048,
  audienceEntries: 200,
} as const;

/** The editor's state. Dates are `datetime-local` strings in the admin's own zone. */
export interface AnnouncementDraft {
  title: string;
  bodyMarkdown: string;
  type: CmsType;
  audienceMode: AudienceMode;
  planSlugs: string[];
  workspaceIds: string[];
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
}

/** The server's shape, exactly — the notification service rejects unknown fields. */
export interface AnnouncementRequest {
  title: string;
  bodyMarkdown: string;
  type: CmsType;
  audienceMode: AudienceMode;
  audiencePlanSlugs: string[];
  audienceWorkspaceIds: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface AnnouncementLike {
  title: string;
  bodyMarkdown: string;
  type: string;
  audienceMode: string;
  audiencePlanSlugs: string[];
  audienceWorkspaceIds: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export function emptyDraft(): AnnouncementDraft {
  return {
    title: "",
    bodyMarkdown: "",
    type: "FEATURE",
    audienceMode: "ALL",
    planSlugs: [],
    workspaceIds: [],
    ctaLabel: "",
    ctaUrl: "",
    startsAt: "",
    endsAt: "",
  };
}

function asType(value: string): CmsType {
  return (CMS_TYPES as readonly string[]).includes(value) ? (value as CmsType) : "ANNOUNCEMENT";
}

function asMode(value: string): AudienceMode {
  return (AUDIENCE_MODES as readonly string[]).includes(value) ? (value as AudienceMode) : "ALL";
}

export function draftFrom(announcement: AnnouncementLike): AnnouncementDraft {
  return {
    title: announcement.title,
    bodyMarkdown: announcement.bodyMarkdown,
    type: asType(announcement.type),
    audienceMode: asMode(announcement.audienceMode),
    planSlugs: [...announcement.audiencePlanSlugs],
    workspaceIds: [...announcement.audienceWorkspaceIds],
    ctaLabel: announcement.ctaLabel ?? "",
    ctaUrl: announcement.ctaUrl ?? "",
    startsAt: toLocalInput(announcement.startsAt),
    endsAt: toLocalInput(announcement.endsAt),
  };
}

/**
 * A `datetime-local` value as an ISO instant. Resolved in the admin's zone — the one they typed
 * in — and sent with a Z, so the server cannot read it as some other zone's wall clock.
 */
export function toUtcIso(localValue: string): string | null {
  if (!localValue.trim()) return null;
  const parsed = new Date(localValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** An ISO instant as a `datetime-local` value in the viewer's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** AnnouncementRules.Normalize: trimmed, and only the audience list the mode reads. */
export function toRequest(draft: AnnouncementDraft): AnnouncementRequest {
  const optional = (value: string) => (value.trim() ? value.trim() : null);
  return {
    title: draft.title.trim(),
    bodyMarkdown: draft.bodyMarkdown.trim(),
    type: draft.type,
    audienceMode: draft.audienceMode,
    audiencePlanSlugs:
      draft.audienceMode === "PLANS"
        ? [...new Set(draft.planSlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean))]
        : [],
    audienceWorkspaceIds: draft.audienceMode === "WORKSPACES" ? [...new Set(draft.workspaceIds)] : [],
    ctaLabel: optional(draft.ctaLabel),
    ctaUrl: optional(draft.ctaUrl),
    startsAt: toUtcIso(draft.startsAt),
    endsAt: toUtcIso(draft.endsAt),
  };
}

/** AnnouncementRules.IsAllowedLink: an http(s) URL, or an in-app path ("/…" but not "//…"). */
export function isAllowedLink(link: string): boolean {
  if (/\s/.test(link)) return false;
  if (link.startsWith("/")) return !link.startsWith("//") && !link.startsWith("/\\");
  try {
    const url = new URL(link);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Why a draft cannot be saved, as a message key under `adminCms.announcements.errors`, or null. */
export type DraftError =
  | "titleRequired"
  | "titleTooLong"
  | "bodyRequired"
  | "bodyTooLong"
  | "plansRequired"
  | "workspacesRequired"
  | "tooManyAudience"
  | "labelWithoutLink"
  | "linkWithoutLabel"
  | "labelTooLong"
  | "linkInvalid"
  | "windowInverted";

export function validateDraft(draft: AnnouncementDraft): DraftError | null {
  const request = toRequest(draft);
  if (!request.title) return "titleRequired";
  if (request.title.length > LIMITS.title) return "titleTooLong";
  if (!request.bodyMarkdown) return "bodyRequired";
  if (request.bodyMarkdown.length > LIMITS.body) return "bodyTooLong";
  if (request.audienceMode === "PLANS" && request.audiencePlanSlugs.length === 0) return "plansRequired";
  if (request.audienceMode === "WORKSPACES" && request.audienceWorkspaceIds.length === 0) return "workspacesRequired";
  if (
    request.audiencePlanSlugs.length > LIMITS.audienceEntries ||
    request.audienceWorkspaceIds.length > LIMITS.audienceEntries
  )
    return "tooManyAudience";
  if (request.ctaLabel && !request.ctaUrl) return "labelWithoutLink";
  if (request.ctaUrl && !request.ctaLabel) return "linkWithoutLabel";
  if (request.ctaLabel && request.ctaLabel.length > LIMITS.ctaLabel) return "labelTooLong";
  if (request.ctaUrl && (request.ctaUrl.length > LIMITS.ctaUrl || !isAllowedLink(request.ctaUrl))) return "linkInvalid";
  if (request.startsAt && request.endsAt && Date.parse(request.endsAt) <= Date.parse(request.startsAt))
    return "windowInverted";
  return null;
}

export function sameDraft(a: AnnouncementDraft, b: AnnouncementDraft): boolean {
  return JSON.stringify(toRequest(a)) === JSON.stringify(toRequest(b));
}

export type CmsAction =
  | "publishNow"
  | "schedule"
  | "unpublish"
  | "archive"
  | "restore"
  | "duplicate"
  | "delete";

/**
 * What each status allows — the server's lifecycle (AnnouncementService), so a button is never
 * offered for a transition the server would refuse.
 *   DRAFT      publish now, schedule, archive, duplicate, delete
 *   SCHEDULED  publish now, reschedule, back to draft, archive, duplicate
 *   PUBLISHED  back to draft, archive, duplicate
 *   ENDED      publish again, schedule, back to draft, archive, duplicate
 *   ARCHIVED   restore to draft, duplicate
 */
export function availableActions(status: string): CmsAction[] {
  switch (status) {
    case "DRAFT":
      return ["publishNow", "schedule", "archive", "duplicate", "delete"];
    case "SCHEDULED":
      return ["publishNow", "schedule", "unpublish", "archive", "duplicate"];
    case "PUBLISHED":
      return ["unpublish", "archive", "duplicate"];
    case "ENDED":
      return ["publishNow", "schedule", "unpublish", "archive", "duplicate"];
    case "ARCHIVED":
      return ["restore", "duplicate"];
    default:
      return ["duplicate"];
  }
}

/** Badge classes per effective status. */
export const STATUS_CLASSES: Record<EffectiveStatus, string> = {
  DRAFT: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  SCHEDULED: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  PUBLISHED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ENDED: "border-border bg-surface-2 text-ink-muted",
  ARCHIVED: "border-border bg-surface-2 text-ink-subtle",
};

export function statusClasses(status: string): string {
  return (STATUS_CLASSES as Record<string, string>)[status] ?? STATUS_CLASSES.ENDED;
}

/** Accent per type, shared by the admin cards and the banner users see. */
export const TYPE_ACCENTS: Record<CmsType, string> = {
  ANNOUNCEMENT: "bg-ink/80",
  FEATURE: "bg-emerald-500",
  MAINTENANCE: "bg-amber-500",
  PROMOTION: "bg-violet-500",
};

export function typeAccent(type: string): string {
  return (TYPE_ACCENTS as Record<string, string>)[type] ?? TYPE_ACCENTS.ANNOUNCEMENT;
}

/** A CTA link is opened in a new tab only when it leaves the app. */
export function isExternalLink(link: string): boolean {
  return !link.startsWith("/");
}
