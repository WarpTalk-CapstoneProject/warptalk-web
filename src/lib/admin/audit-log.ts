/**
 * Pure helpers for the platform audit log (/admin/audit): how an action and a subject read, where
 * a subject lives in the portal, how the URL's filters become the API query, and how a
 * before/after pair becomes a diff.
 *
 * Relative imports only — the node test runner has no bundler.
 */

import { dateInputToRangeBound } from "../workspace/audit-log.ts";

// ── Vocabulary ──────────────────────────────────────────────────────────────────────────────────

/**
 * Every verb a service records, with how it reads in English. The backend constants these mirror
 * are AdminAuditWorkspaceActions / …UserActions / …LanguageActions / …PluginActions /
 * …BillingActions / …GlossaryActions / …AnnouncementActions / …LogActions, plus the workspace
 * lifecycle trio. A verb missing here still reads as words (see humanizeAuditValue), never as a
 * slug — but the contract test holds this list to the messages in every locale.
 */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  // Workspace lifecycle (workspace service)
  suspend: "Workspace suspended",
  reactivate: "Workspace reactivated",
  delete: "Workspace deleted",
  // Admin workspace page (workspace + billing)
  "credit.adjusted": "Credits adjusted",
  "subscription.plan_changed": "Plan changed",
  "subscription.trial_extended": "Trial extended",
  "subscription.period_comped": "Period comped",
  "entitlements.overridden": "Entitlements overridden",
  "invoice.marked_paid": "Invoice marked paid",
  "ownership.transferred": "Ownership transferred",
  "notice.sent": "Notice sent to owner",
  "note.added": "Internal note added",
  "data.exported": "Workspace data exported",
  // Accounts (auth)
  "user.sessions_revoked": "Signed out everywhere",
  "user.deactivated": "Account deactivated",
  "user.reactivated": "Account reactivated",
  "user.unlocked": "Account unlocked",
  // Language catalog (translation room)
  "language.created": "Language added",
  "language.updated": "Language edited",
  "language.enabled": "Language enabled",
  "language.disabled": "Language disabled",
  // Plugin catalog (assistant)
  "plugin.created": "Plugin added",
  "plugin.updated": "Plugin edited",
  "plugin.retired": "Plugin retired",
  "plugin.reinstated": "Plugin reinstated",
  "plugin.deleted": "Plugin deleted",
  "plugin.oauth_client_set": "Plugin OAuth client set",
  "plugin.tools_replaced": "Plugin tools replaced",
  "plugin.rediscovered": "Plugin tools rediscovered",
  // Platform billing (billing)
  "plan.created": "Plan created",
  "plan.updated": "Plan edited",
  "rate_card.upserted": "Rate card published",
  "rate_card.deactivated": "Rate card retired",
  "rate_card.provider_cost_set": "Provider cost set",
  "pricing_config.updated": "Pricing settings changed",
  "billing_policy.updated": "Billing policy changed",
  "subscription.contract_created": "Contract created",
  "subscription.contract_terms": "Contract terms changed",
  "subscription.cancelled": "Subscription cancelled",
  "subscription.reactivated": "Subscription renewal restored",
  "subscription.resumed": "AI service resumed",
  "sales_lead.status_changed": "Sales lead status changed",
  "payment.recorded": "Payment recorded",
  "fx_rate.refreshed": "Exchange rate refreshed from Stripe",
  "fx_rate.overridden": "Exchange rate overridden",
  "fx_rate.override_cleared": "Exchange rate override removed",
  // Global glossary (transcript)
  "glossary.term_created": "Glossary term added",
  "glossary.term_updated": "Glossary term edited",
  "glossary.term_deleted": "Glossary term deleted",
  "glossary.term_published": "Glossary term published",
  "glossary.term_archived": "Glossary term archived",
  "glossary.bulk_imported": "Glossary terms imported",
  // Announcements (notification)
  "announcement.sent": "Announcement sent",
  // The audit log itself
  "audit_log.exported": "Audit log exported",
  // Platform staff and roles (auth, G10)
  "staff.granted": "Staff access granted",
  "staff.invited": "Invited to staff",
  "staff.invitation_revoked": "Staff invitation revoked",
  "staff.invitation_accepted": "Staff invitation accepted",
  "staff.role_changed": "Staff role changed",
  "staff.suspended": "Staff access suspended",
  "staff.reactivated": "Staff access reactivated",
  "staff.removed": "Staff access removed",
  "staff_role.created": "Staff role created",
  "staff_role.updated": "Staff role edited",
  "staff_role.duplicated": "Staff role duplicated",
  "staff_role.deleted": "Staff role deleted",
};

/** Mirrors AdminAuditEntityTypes on the backend. */
export const AUDIT_ENTITY_LABELS: Readonly<Record<string, string>> = {
  workspace: "Workspace",
  user: "Account",
  subscription: "Subscription",
  invoice: "Invoice",
  credit_adjustment: "Credits",
  workspace_note: "Workspace note",
  plan: "Plan",
  usage_rate: "Rate card",
  pricing_version: "Pricing version",
  pricing_config: "Pricing settings",
  billing_policy: "Billing policy",
  payment_method: "Payment method",
  payment: "Payment",
  fx_rate: "Exchange rate",
  sales_lead: "Sales lead",
  supported_language: "Language",
  plugin: "Plugin",
  glossary_term: "Glossary term",
  notification: "Announcement",
  audit_log: "Audit log",
  staff_member: "Staff member",
  staff_role: "Staff role",
  staff_invitation: "Staff invitation",
};

export const AUDIT_SOURCE_LABELS: Readonly<Record<string, string>> = {
  "workspace-service": "Workspace",
  "billing-service": "Billing",
  "auth-service": "Accounts",
  "translation-room-service": "Meetings",
  "assistant-service": "Assistant",
  "transcript-service": "Transcripts",
  "notification-service": "Notifications",
};

/** "rate_card.provider_cost_set" → "Rate card provider cost set". */
export function humanizeAuditValue(value: string) {
  const spaced = value.replace(/[._-]+/g, " ").trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A message key for a verb or type: next-intl reads dots as nesting, so "plan.updated" is stored
 * as "plan_updated". Dashes (source services) become underscores for the same reason.
 */
export function auditMessageKey(value: string) {
  return value.replace(/[.-]/g, "_");
}

export type AuditTranslator = (key: string) => string | undefined;

const none: AuditTranslator = () => undefined;

export function auditActionLabel(action: string, t: AuditTranslator = none) {
  return t(`actions.${auditMessageKey(action)}`) ?? AUDIT_ACTION_LABELS[action] ?? humanizeAuditValue(action);
}

export function auditEntityTypeLabel(entityType: string, t: AuditTranslator = none) {
  return t(`entities.${auditMessageKey(entityType)}`) ?? AUDIT_ENTITY_LABELS[entityType] ?? humanizeAuditValue(entityType);
}

export function auditSourceLabel(source: string, t: AuditTranslator = none) {
  return t(`sources.${auditMessageKey(source)}`) ?? AUDIT_SOURCE_LABELS[source] ?? humanizeAuditValue(source);
}

/** Tone for the action pill: destructive verbs read red even when they succeeded. */
export function auditActionTone(action: string): "danger" | "warning" | "neutral" {
  if (/(^|\.)(delete|deleted|deactivated|suspend|cancelled|retired|term_deleted)$/.test(action)) return "danger";
  if (/(^|\.)(sessions_revoked|overridden|comped|marked_paid|transferred|adjusted|disabled|archived)$/.test(action)) {
    return "warning";
  }
  return "neutral";
}

// ── Where a subject lives ───────────────────────────────────────────────────────────────────────

export interface AuditSubjectRef {
  type: string;
  id: string | null;
  key: string | null;
  workspaceId: string | null;
  workspaceSlug: string | null;
}

type Summary = Record<string, string | null> | null | undefined;

function workspaceHref(workspaceRef: string | null) {
  return workspaceRef ? `/admin/workspaces/${encodeURIComponent(workspaceRef)}` : null;
}

/**
 * The portal page that shows this subject, or null when none does. A workspace is addressed by
 * its slug when known (WT-560); the id form still resolves and forwards.
 */
export function auditEntityHref(entity: AuditSubjectRef, before?: Summary, after?: Summary): string | null {
  const workspaceRef = entity.workspaceSlug ?? entity.workspaceId;
  switch (entity.type) {
    case "workspace":
      return workspaceHref(entity.workspaceSlug ?? entity.id ?? entity.workspaceId);
    case "user":
      return entity.id ? `/admin/users/${encodeURIComponent(entity.id)}` : "/admin/users";
    case "subscription":
    case "invoice":
    case "credit_adjustment":
    case "workspace_note":
    case "payment":
      return workspaceHref(workspaceRef) ?? (entity.type === "subscription" ? "/admin/subscriptions" : "/admin/billing");
    case "plugin": {
      const key = after?.plugin_key ?? before?.plugin_key ?? entity.key;
      return key ? `/admin/plugins/${encodeURIComponent(key)}` : "/admin/plugins";
    }
    case "supported_language":
    case "fx_rate":
      return "/admin/settings";
    case "plan":
    case "usage_rate":
    case "pricing_version":
    case "pricing_config":
    case "billing_policy":
      return "/admin/plans";
    case "glossary_term":
      return "/admin/global-glossary";
    case "notification":
      return entity.id ? `/admin/announcements/${encodeURIComponent(entity.id)}` : "/admin/announcements";
    case "sales_lead":
      return "/admin/sales-leads";
    case "staff_member":
    case "staff_invitation":
      return "/admin/staff";
    case "staff_role":
      return "/admin/roles";
    default:
      return null;
  }
}

/** The workspace an entry is filed under, when the subject is not the workspace itself. */
export function auditWorkspaceHref(entity: AuditSubjectRef): string | null {
  if (entity.type === "workspace") return null;
  return workspaceHref(entity.workspaceSlug ?? entity.workspaceId);
}

// ── Filters ─────────────────────────────────────────────────────────────────────────────────────

export const AUDIT_DATE_PRESETS = ["24h", "7d", "30d", "90d", "all", "custom"] as const;
export type AuditDatePreset = (typeof AUDIT_DATE_PRESETS)[number];

export const AUDIT_RESULTS = ["all", "succeeded", "failed"] as const;
export type AuditResultFilter = (typeof AUDIT_RESULTS)[number];

/** The URL is the source of truth: a shared link restores the same view. */
export interface AuditFilters {
  preset: AuditDatePreset;
  /** YYYY-MM-DD, only with the custom preset. */
  fromDate: string;
  toDate: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  workspaceId: string;
  result: AuditResultFilter;
  q: string;
}

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  preset: "30d",
  fromDate: "",
  toDate: "",
  actorId: "",
  action: "",
  entityType: "",
  entityId: "",
  workspaceId: "",
  result: "all",
  q: "",
};

const PRESET_HOURS: Record<Exclude<AuditDatePreset, "all" | "custom">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};

function isPreset(value: string | null): value is AuditDatePreset {
  return (AUDIT_DATE_PRESETS as readonly string[]).includes(value ?? "");
}

function isResult(value: string | null): value is AuditResultFilter {
  return (AUDIT_RESULTS as readonly string[]).includes(value ?? "");
}

interface ParamsReader {
  get(name: string): string | null;
}

export function readAuditFilters(params: ParamsReader): AuditFilters {
  const preset = params.get("range");
  const result = params.get("result");
  return {
    preset: isPreset(preset) ? preset : DEFAULT_AUDIT_FILTERS.preset,
    fromDate: params.get("from") ?? "",
    toDate: params.get("to") ?? "",
    actorId: params.get("actor") ?? "",
    action: params.get("action") ?? "",
    entityType: params.get("entity") ?? "",
    entityId: params.get("entityId") ?? "",
    workspaceId: params.get("workspace") ?? "",
    result: isResult(result) ? result : "all",
    q: params.get("q") ?? "",
  };
}

/** Only what differs from the defaults goes in the URL. */
export function auditFiltersToParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.preset !== DEFAULT_AUDIT_FILTERS.preset) params.set("range", filters.preset);
  if (filters.preset === "custom") {
    if (filters.fromDate) params.set("from", filters.fromDate);
    if (filters.toDate) params.set("to", filters.toDate);
  }
  if (filters.actorId) params.set("actor", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entity", filters.entityType);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.workspaceId) params.set("workspace", filters.workspaceId);
  if (filters.result !== "all") params.set("result", filters.result);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  return params;
}

export interface AuditApiQuery {
  from?: string;
  to?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  workspaceId?: string;
  result?: "succeeded" | "failed";
  q?: string;
}

/**
 * The API query for a filter set. A relative preset is anchored to `now` and has no upper bound,
 * so new entries keep arriving under live refresh; `now` is rounded down to the minute so the
 * query key is stable between renders.
 */
export function auditFiltersToQuery(filters: AuditFilters, now: Date = new Date()): AuditApiQuery {
  const query: AuditApiQuery = {};
  if (filters.preset === "custom") {
    const from = dateInputToRangeBound(filters.fromDate, "from");
    const to = dateInputToRangeBound(filters.toDate, "to");
    if (from) query.from = from;
    if (to) query.to = to;
  } else if (filters.preset !== "all") {
    const anchor = Math.floor(now.getTime() / 60_000) * 60_000;
    query.from = new Date(anchor - PRESET_HOURS[filters.preset] * 3_600_000).toISOString();
  }
  if (filters.actorId) query.actorId = filters.actorId;
  if (filters.action) query.action = filters.action;
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.entityId.trim()) query.entityId = filters.entityId.trim();
  if (filters.workspaceId) query.workspaceId = filters.workspaceId;
  if (filters.result !== "all") query.result = filters.result;
  if (filters.q.trim()) query.q = filters.q.trim();
  return query;
}

/** How many filters narrow the view, not counting the date range. */
export function activeAuditFilterCount(filters: AuditFilters) {
  return [filters.actorId, filters.action, filters.entityType, filters.entityId, filters.workspaceId, filters.q.trim()]
    .filter(Boolean).length + (filters.result === "all" ? 0 : 1);
}

// ── Diff ────────────────────────────────────────────────────────────────────────────────────────

export type AuditDiffChange = "added" | "removed" | "changed" | "unchanged";

export interface AuditDiffRow {
  key: string;
  before: string | null;
  after: string | null;
  change: AuditDiffChange;
}

/**
 * One row per field either side mentions, in the order the producer wrote them (before first).
 * "added" and "removed" are about the field's VALUE — a field present on one side only, or null
 * on one side — which is how a created row and a deleted row read.
 */
export function auditDiffRows(before: Summary, after: Summary): AuditDiffRow[] {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  return keys.map((key) => {
    const from = before?.[key] ?? null;
    const to = after?.[key] ?? null;
    const change: AuditDiffChange =
      from === null && to !== null ? "added" : from !== null && to === null ? "removed" : from !== to ? "changed" : "unchanged";
    return { key, before: from, after: to, change };
  });
}

/** "max_participants" → "Max participants". */
export function auditFieldLabel(key: string) {
  return humanizeAuditValue(key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());
}

/** A one-line summary of what changed, for the table: "price 499000 → 599000 · +1 more". */
export function auditChangeSummary(before: Summary, after: Summary, maxFields = 2) {
  const rows = auditDiffRows(before, after).filter((row) => row.change !== "unchanged");
  if (rows.length === 0) return "";
  const shown = rows.slice(0, maxFields).map((row) => {
    if (row.change === "added") return `${row.key}: ${row.after}`;
    if (row.change === "removed") return `${row.key}: ${row.before} → —`;
    return `${row.key}: ${row.before} → ${row.after}`;
  });
  const rest = rows.length - shown.length;
  return rest > 0 ? `${shown.join(" · ")} · +${rest}` : shown.join(" · ");
}
