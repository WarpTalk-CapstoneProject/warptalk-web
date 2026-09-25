/**
 * The announcements CMS, minus React: the editor's draft, the request it becomes, the rules it
 * must pass, which actions each status allows, and how each design choice is drawn.
 *
 * Every rule mirrors one in AnnouncementRules (warptalk-backend notification service). The server
 * stays the authority and its message is shown when it refuses anyway; this exists so the editor
 * can say what is wrong before the round-trip.
 *
 * Deliberately free of React and of `@/` imports so `node:test` runs it without a bundler.
 */

export const CMS_TYPES = ["ANNOUNCEMENT", "FEATURE", "MAINTENANCE", "PROMOTION"] as const;
export type CmsType = (typeof CMS_TYPES)[number];

export const AUDIENCE_MODES = ["ALL", "PLANS", "WORKSPACES"] as const;
export type AudienceMode = (typeof AUDIENCE_MODES)[number];

export const EFFECTIVE_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "ENDED", "ARCHIVED"] as const;
export type EffectiveStatus = (typeof EFFECTIVE_STATUSES)[number];

/** Every placement the app renders (see src/components/announcements/announcement-host.tsx). */
export const PLACEMENTS = ["TOP_BANNER", "MODAL", "TOAST", "NOTIFICATION_CENTER", "DASHBOARD_CARD"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export const VARIANTS = ["SUBTLE", "SOLID", "OUTLINE"] as const;
export type Variant = (typeof VARIANTS)[number];

export const COLORS = ["BRAND", "BLUE", "GREEN", "AMBER", "RED", "VIOLET", "NEUTRAL"] as const;
export type AccentColor = (typeof COLORS)[number];

/** The icon names the API accepts (AnnouncementConstants.Icons); the web maps each to a glyph. */
export const ICONS = [
  "megaphone",
  "sparkle",
  "rocket",
  "wrench",
  "warning",
  "gift",
  "info",
  "calendar",
  "lightning",
  "star",
  "bell",
  "heart",
] as const;
export type IconName = (typeof ICONS)[number];

export const FREQUENCIES = ["UNTIL_DISMISSED", "ONCE", "EVERY_SESSION", "DAILY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const ROLES = ["Owner", "Admin", "Member"] as const;
export const LOCALES = ["en", "vi", "ja"] as const;

export const LIMITS = {
  title: 200,
  body: 20_000,
  ctaLabel: 60,
  ctaUrl: 2048,
  audienceEntries: 200,
  priority: 100,
  newUserDays: 365,
  assetBytes: 2 * 1024 * 1024,
} as const;

/** Where an uploaded asset is served, relative to the API origin. */
export const ASSET_PATH_PREFIX = "/api/v1/notifications/announcements/assets/";

/** The editor's state. Dates are `datetime-local` strings in the admin's own zone. */
export interface AnnouncementDraft {
  title: string;
  bodyMarkdown: string;
  type: CmsType;
  placement: Placement;
  variant: Variant;
  accentColor: AccentColor;
  icon: IconName | "";
  imageUrl: string;
  priority: number;
  dismissible: boolean;
  frequency: Frequency;
  audienceMode: AudienceMode;
  planSlugs: string[];
  workspaceIds: string[];
  targetRoles: string[];
  targetLocales: string[];
  /** "" for any account age. */
  newUsersWithinDays: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
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
  placement: Placement;
  variant: Variant;
  accentColor: AccentColor;
  icon: string | null;
  imageUrl: string | null;
  priority: number;
  dismissible: boolean;
  frequency: Frequency;
  targetRoles: string[];
  targetLocales: string[];
  newUsersWithinDays: number | null;
  secondaryCtaLabel: string | null;
  secondaryCtaUrl: string | null;
}

export interface AnnouncementLike {
  title: string;
  bodyMarkdown: string;
  type: string;
  placement?: string;
  variant?: string;
  accentColor?: string;
  icon?: string | null;
  imageUrl?: string | null;
  priority?: number;
  dismissible?: boolean;
  frequency?: string;
  audienceMode: string;
  audiencePlanSlugs: string[];
  audienceWorkspaceIds: string[];
  targetRoles?: string[];
  targetLocales?: string[];
  newUsersWithinDays?: number | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  secondaryCtaLabel?: string | null;
  secondaryCtaUrl?: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export function emptyDraft(): AnnouncementDraft {
  return {
    title: "",
    bodyMarkdown: "",
    type: "FEATURE",
    placement: "TOP_BANNER",
    variant: "SUBTLE",
    accentColor: "BRAND",
    icon: "",
    imageUrl: "",
    priority: 0,
    dismissible: true,
    frequency: "UNTIL_DISMISSED",
    audienceMode: "ALL",
    planSlugs: [],
    workspaceIds: [],
    targetRoles: [],
    targetLocales: [],
    newUsersWithinDays: "",
    ctaLabel: "",
    ctaUrl: "",
    secondaryCtaLabel: "",
    secondaryCtaUrl: "",
    startsAt: "",
    endsAt: "",
  };
}

function oneOf<T extends string>(values: readonly T[], value: string | null | undefined, fallback: T): T {
  return (values as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

export function draftFrom(announcement: AnnouncementLike): AnnouncementDraft {
  return {
    title: announcement.title,
    bodyMarkdown: announcement.bodyMarkdown,
    type: oneOf(CMS_TYPES, announcement.type, "ANNOUNCEMENT"),
    placement: oneOf(PLACEMENTS, announcement.placement, "TOP_BANNER"),
    variant: oneOf(VARIANTS, announcement.variant, "SUBTLE"),
    accentColor: oneOf(COLORS, announcement.accentColor, "BRAND"),
    icon: oneOf([...ICONS, ""] as const, announcement.icon ?? "", ""),
    imageUrl: announcement.imageUrl ?? "",
    priority: announcement.priority ?? 0,
    dismissible: announcement.dismissible ?? true,
    frequency: oneOf(FREQUENCIES, announcement.frequency, "UNTIL_DISMISSED"),
    audienceMode: oneOf(AUDIENCE_MODES, announcement.audienceMode, "ALL"),
    planSlugs: [...announcement.audiencePlanSlugs],
    workspaceIds: [...announcement.audienceWorkspaceIds],
    targetRoles: [...(announcement.targetRoles ?? [])],
    targetLocales: [...(announcement.targetLocales ?? [])],
    newUsersWithinDays: announcement.newUsersWithinDays ? String(announcement.newUsersWithinDays) : "",
    ctaLabel: announcement.ctaLabel ?? "",
    ctaUrl: announcement.ctaUrl ?? "",
    secondaryCtaLabel: announcement.secondaryCtaLabel ?? "",
    secondaryCtaUrl: announcement.secondaryCtaUrl ?? "",
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
  const days = Number.parseInt(draft.newUsersWithinDays, 10);
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
    placement: draft.placement,
    variant: draft.variant,
    accentColor: draft.accentColor,
    icon: draft.icon || null,
    imageUrl: optional(draft.imageUrl),
    priority: Math.round(draft.priority),
    dismissible: draft.dismissible,
    frequency: draft.frequency,
    targetRoles: [...new Set(draft.targetRoles)],
    targetLocales: [...new Set(draft.targetLocales)],
    newUsersWithinDays: draft.newUsersWithinDays.trim() && Number.isFinite(days) ? days : null,
    secondaryCtaLabel: optional(draft.secondaryCtaLabel),
    secondaryCtaUrl: optional(draft.secondaryCtaUrl),
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

/** AnnouncementRules.IsAllowedImage: an uploaded asset, or an https image anywhere. */
export function isAllowedImage(url: string): boolean {
  if (url.startsWith(ASSET_PATH_PREFIX)) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.slice(ASSET_PATH_PREFIX.length));
  }
  if (/\s/.test(url)) return false;
  try {
    return new URL(url).protocol === "https:";
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
  | "secondaryNeedsPrimary"
  | "secondaryIncomplete"
  | "secondaryLinkInvalid"
  | "windowInverted"
  | "imageInvalid"
  | "priorityOutOfRange"
  | "newUsersOutOfRange";

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
  if ((request.secondaryCtaLabel || request.secondaryCtaUrl) && !request.ctaUrl) return "secondaryNeedsPrimary";
  if (Boolean(request.secondaryCtaLabel) !== Boolean(request.secondaryCtaUrl)) return "secondaryIncomplete";
  if (request.secondaryCtaLabel && request.secondaryCtaLabel.length > LIMITS.ctaLabel) return "labelTooLong";
  if (request.secondaryCtaUrl && !isAllowedLink(request.secondaryCtaUrl)) return "secondaryLinkInvalid";
  if (request.startsAt && request.endsAt && Date.parse(request.endsAt) <= Date.parse(request.startsAt))
    return "windowInverted";
  if (request.imageUrl && !isAllowedImage(request.imageUrl)) return "imageInvalid";
  if (!Number.isFinite(request.priority) || request.priority < 0 || request.priority > LIMITS.priority)
    return "priorityOutOfRange";
  if (
    draft.newUsersWithinDays.trim() &&
    (request.newUsersWithinDays === null || request.newUsersWithinDays < 1 || request.newUsersWithinDays > LIMITS.newUserDays)
  )
    return "newUsersOutOfRange";
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

/** Which bulk actions apply to a selection: each item's own lifecycle decides. */
export function bulkActionsFor(statuses: string[]): ("publish" | "archive" | "delete" | "duplicate")[] {
  if (statuses.length === 0) return [];
  const actions: ("publish" | "archive" | "delete" | "duplicate")[] = ["duplicate"];
  if (statuses.some((status) => availableActions(status).includes("publishNow"))) actions.unshift("publish");
  if (statuses.some((status) => availableActions(status).includes("archive"))) actions.push("archive");
  if (statuses.some((status) => status === "DRAFT")) actions.push("delete");
  return actions;
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

/** The accent colour, as the three ways a variant uses it. */
export interface ColorTokens {
  /** A 1px/4px accent bar and dots. */
  bar: string;
  /** SOLID background with its readable foreground. */
  solid: string;
  /** SUBTLE tinted background. */
  subtle: string;
  /** OUTLINE border. */
  outline: string;
  /** Icon/foreground tint on a neutral ground. */
  text: string;
}

export const COLOR_TOKENS: Record<AccentColor, ColorTokens> = {
  BRAND: { bar: "bg-primary", solid: "bg-primary text-primary-foreground", subtle: "bg-primary/10", outline: "border-primary/50", text: "text-primary" },
  BLUE: { bar: "bg-sky-500", solid: "bg-sky-600 text-white", subtle: "bg-sky-500/10", outline: "border-sky-500/50", text: "text-sky-600 dark:text-sky-300" },
  GREEN: { bar: "bg-emerald-500", solid: "bg-emerald-600 text-white", subtle: "bg-emerald-500/10", outline: "border-emerald-500/50", text: "text-emerald-600 dark:text-emerald-300" },
  AMBER: { bar: "bg-amber-500", solid: "bg-amber-500 text-black", subtle: "bg-amber-500/10", outline: "border-amber-500/50", text: "text-amber-600 dark:text-amber-300" },
  RED: { bar: "bg-red-500", solid: "bg-red-600 text-white", subtle: "bg-red-500/10", outline: "border-red-500/50", text: "text-red-600 dark:text-red-300" },
  VIOLET: { bar: "bg-violet-500", solid: "bg-violet-600 text-white", subtle: "bg-violet-500/10", outline: "border-violet-500/50", text: "text-violet-600 dark:text-violet-300" },
  NEUTRAL: { bar: "bg-ink/70", solid: "bg-ink text-surface-1", subtle: "bg-surface-2", outline: "border-border", text: "text-ink" },
};

export function colorTokens(color: string): ColorTokens {
  return (COLOR_TOKENS as Record<string, ColorTokens>)[color] ?? COLOR_TOKENS.BRAND;
}

/** The container classes for a variant + colour: how loud the announcement is. */
export function surfaceClasses(variant: string, color: string): string {
  const tokens = colorTokens(color);
  switch (variant) {
    case "SOLID":
      return `${tokens.solid} border-transparent`;
    case "OUTLINE":
      return `bg-surface-1 border ${tokens.outline}`;
    default:
      return `${tokens.subtle} border border-border`;
  }
}

/** The icon a type uses when the announcement does not choose one. */
export const TYPE_DEFAULT_ICON: Record<CmsType, IconName> = {
  ANNOUNCEMENT: "megaphone",
  FEATURE: "sparkle",
  MAINTENANCE: "wrench",
  PROMOTION: "gift",
};

export function iconFor(type: string, icon: string | null | undefined): IconName {
  if (icon && (ICONS as readonly string[]).includes(icon)) return icon as IconName;
  return (TYPE_DEFAULT_ICON as Record<string, IconName>)[type] ?? "megaphone";
}

/** Legacy alias: the accent bar colour for a type, used where no accent is chosen. */
export function typeAccent(type: string): string {
  const byType: Record<string, AccentColor> = { ANNOUNCEMENT: "NEUTRAL", FEATURE: "GREEN", MAINTENANCE: "AMBER", PROMOTION: "VIOLET" };
  return colorTokens(byType[type] ?? "NEUTRAL").bar;
}

/** A CTA link is opened in a new tab only when it leaves the app. */
export function isExternalLink(link: string): boolean {
  return !link.startsWith("/");
}

/**
 * An uploaded asset's path as an absolute URL on the API's origin. `apiBase` is the axios base
 * ("https://app.warptalk.vn/api/v1" or "http://localhost:5200/api/v1"); a path that is not an
 * asset path is returned unchanged.
 */
export function assetUrl(pathOrUrl: string, apiBase: string): string {
  if (!pathOrUrl.startsWith(ASSET_PATH_PREFIX)) return pathOrUrl;
  try {
    return new URL(pathOrUrl, new URL(apiBase).origin).toString();
  } catch {
    return pathOrUrl;
  }
}

/** The markdown for an uploaded image, alt text escaped so it cannot break the syntax. */
export function imageMarkdown(url: string, alt: string): string {
  const safeAlt = alt.replace(/[[\]]/g, "").slice(0, 100);
  return `![${safeAlt}](${url})`;
}
