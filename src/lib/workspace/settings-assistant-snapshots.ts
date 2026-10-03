/**
 * What WarpBot is told about the rest of the workspace Settings pages the owner has open:
 * Workspace settings, Security, Member roles, Features, Invoices and Plugin activity.
 *
 * Same mechanism as Insights, Billing and Plugins (see insights/assistant-snapshot.ts): each page
 * has already read its data with the owner's own token, so what it shows goes to WarpBot as page
 * context instead of behind a tool.
 *
 * THE RULES THEY KEEP
 *   - What was SAVED, not what is being typed: a draft in a form is the page's own state.
 *   - Only what the page read. A list that is one page of many says how many it holds and that
 *     there are more, so a count of the page is never read as the workspace's total.
 *   - Nobody is named. Member roles and Plugin activity show names and emails on screen; WarpBot
 *     gets counts. The DLP keyword list is sensitive by definition, so only its size is sent.
 *   - No comma inside a value (see insights/snapshot-text.ts).
 */

import type { WorkspacePluginToolAuditDto } from "../../types/assistant.ts";
import type { InvoiceDto } from "../../types/billing.ts";
import type { WorkspaceMemberDto, WorkspaceSettingsDto } from "../../types/workspace.ts";
import type { WorkspaceEntitlementsDto } from "../../types/workspace-entitlements.ts";
import type { PluginActivityFixer, PluginActivityTone } from "../assistant/plugin-activity.ts";
import { dayOf, plain, round1 } from "./insights/snapshot-text.ts";

const MAX_LISTED = 12;

const onOff = (value: boolean | null | undefined) => (value ? "on" : "off");

function listed(values: readonly string[], empty = "none"): string {
  const names = values.map(plain).filter(Boolean);
  if (names.length === 0) return empty;
  const shown = names.slice(0, MAX_LISTED).join("; ");
  return names.length > MAX_LISTED ? `${shown}; and ${names.length - MAX_LISTED} more` : shown;
}

/** "Google Drive 5; Slack 2", largest first. */
function tally(labels: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return listed(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, count]) => `${plain(label)} ${count}`),
  );
}

const money = (amount: number, currency: string | null | undefined) => `${round1(amount)}${currency ? ` ${plain(currency)}` : ""}`;

// ── Workspace settings ───────────────────────────────────────────────────────

export function workspaceSettingsAssistantSnapshot(settings: WorkspaceSettingsDto): Record<string, string> {
  const allowed = settings.allowedTargetLanguages ?? [];
  const restricted = typeof settings.restrictLanguages === "boolean" ? settings.restrictLanguages : allowed.length > 0;
  const out: Record<string, string> = {
    default_meeting_language: plain(settings.defaultLanguage),
    timezone: plain(settings.timezone),
    meeting_languages_allowed: restricted && allowed.length > 0 ? listed(allowed) : "any language (not restricted)",
    voice_cloning: onOff(settings.voiceCloningEnabled),
    max_meetings_at_once: String(settings.maxActiveRooms),
    meeting_records_kept_for_days: String(settings.artifactRetentionDays),
    minutes_template: plain(settings.minutesTemplate),
    minutes_classification: plain(settings.minutesClassification),
    profanity_filter: onOff(settings.isProfanityFilterEnabled),
  };
  const ceiling = settings.maxActiveRoomsCeiling;
  if (typeof ceiling === "number" && ceiling > 0) {
    out.max_meetings_at_once_allowed_by_plan = String(ceiling);
    // Meeting creation enforces the tighter of the two.
    out.max_meetings_at_once_in_force = String(Math.min(ceiling, settings.maxActiveRooms));
  }
  const languages = settings.maxLanguagesCeiling;
  if (typeof languages === "number" && languages > 0) out.max_languages_per_meeting_allowed_by_plan = String(languages);
  const tone = settings.aiUsagePolicy?.translationProfile?.translationTone;
  if (tone) out.translation_tone = plain(tone);
  if (typeof settings.aiUsagePolicy?.useGlobalGlossary === "boolean") out.global_glossary = onOff(settings.aiUsagePolicy.useGlobalGlossary);
  return out;
}

// ── Security ─────────────────────────────────────────────────────────────────

export interface SecuritySnapshotInput {
  settings: WorkspaceSettingsDto;
  /** The verified-domain list, or undefined when it was not read. */
  domains: readonly string[] | undefined;
}

export function securityAssistantSnapshot({ settings, domains }: SecuritySnapshotInput): Record<string, string> {
  const policy = settings.aiUsagePolicy;
  const out: Record<string, string> = {
    external_collaboration: onOff(settings.allowExternalCollaboration),
    internal_members_need_a_verified_domain: settings.requireVerifiedDomainForInternal ? "yes" : "no",
    invitations_expire_after_days: String(settings.invitationExpiryDays),
    members_may_add_any_plugin: settings.allowAnyPlugins ? "yes" : "no",
  };
  if (domains) {
    out.verified_domains_count = String(domains.length);
    out.verified_domains = listed(domains);
  }
  if (policy) {
    if (typeof policy.allowExternalLlm === "boolean") out.external_ai_models_allowed = policy.allowExternalLlm ? "yes" : "no";
    if (policy.redactPii) out.personal_data_redaction = onOff(policy.redactPii.enabled);
    if (policy.dlp) {
      out.blocked_keyword_filter = onOff(policy.dlp.enabled);
      out.blocked_keywords_count = String(policy.dlp.keywordsBlacklist?.length ?? 0);
    }
  }
  return out;
}

// ── Member roles ─────────────────────────────────────────────────────────────

export interface MemberRolesSnapshotInput {
  /** The members the page read (its first page). */
  members: readonly Pick<WorkspaceMemberDto, "roleName" | "membershipType" | "status">[];
  /** The server's own total, when it sent one. */
  total: number | undefined;
}

export function memberRolesAssistantSnapshot({ members, total }: MemberRolesSnapshotInput): Record<string, string> {
  const role = (member: { roleName: string }) => member.roleName.trim().toLowerCase();
  const internal = members.filter((member) => member.membershipType.trim().toLowerCase() === "internal");
  const out: Record<string, string> = {
    members_listed: String(members.length),
    owners: String(members.filter((member) => role(member) === "owner").length),
    admins: String(members.filter((member) => role(member) === "admin").length),
    internal_members: String(internal.length),
    external_members: String(members.length - internal.length),
    // The page's own rule: only an internal member who is not the Owner can change role.
    members_whose_role_can_change: String(internal.filter((member) => role(member) !== "owner").length),
    internal_members_who_are_not_admin_yet: String(internal.filter((member) => role(member) !== "owner" && role(member) !== "admin").length),
  };
  if (typeof total === "number" && total > members.length) {
    out.note = `only the first ${members.length} of ${total} members were read so these counts are a floor`;
  }
  return out;
}

// ── Features ─────────────────────────────────────────────────────────────────

export interface FeatureRowLike {
  label: string;
  value: { text: string; state: string };
}

export interface FeaturesSnapshotInput {
  entitlements: Pick<WorkspaceEntitlementsDto, "isKnown" | "planSlug" | "hasActiveSubscription">;
  /** `buildEntitlementSections` rows, in English (its default translator). */
  rows: readonly FeatureRowLike[];
}

export function featuresAssistantSnapshot({ entitlements, rows }: FeaturesSnapshotInput): Record<string, string> {
  if (!entitlements.isKnown) {
    return { entitlements: "not available yet: the workspace's entitlement snapshot has not arrived so no limit is known" };
  }
  const included = rows.filter((row) => row.value.state === "included").map((row) => row.label);
  const excluded = rows.filter((row) => row.value.state === "excluded").map((row) => row.label);
  const limits = rows
    .filter((row) => row.value.state !== "included" && row.value.state !== "excluded")
    .map((row) => `${plain(row.label)}: ${plain(row.value.text)}`);
  return {
    plan: entitlements.planSlug ? plain(entitlements.planSlug) : "none",
    active_subscription: entitlements.hasActiveSubscription ? "yes" : "no: the limits below are what applies without a live plan",
    features_included: listed(included),
    features_not_included: listed(excluded),
    limits: listed(limits),
  };
}

// ── Invoices ─────────────────────────────────────────────────────────────────

export interface InvoicesSnapshotInput {
  /** The page of invoices on screen, newest first as the server sends them. */
  invoices: readonly Pick<InvoiceDto, "invoiceNumber" | "total" | "currency" | "status" | "issuedAt" | "dueAt" | "paidAt">[];
  /** Every invoice the workspace has, per the server. */
  totalCount: number;
  page: number;
}

export function invoicesAssistantSnapshot({ invoices, totalCount, page }: InvoicesSnapshotInput): Record<string, string> {
  const out: Record<string, string> = { invoices_total: String(totalCount), invoices_on_this_page: String(invoices.length) };
  if (invoices.length === 0) return out;

  // The page's own rule: only a PAID invoice counts as paid; void is owed by nobody.
  const paid = invoices.filter((invoice) => invoice.paidAt !== null);
  const outstanding = invoices.filter((invoice) => invoice.paidAt === null && (invoice.status ?? "").toLowerCase() !== "void");
  const currency = invoices[0].currency;
  const sum = (rows: typeof invoices) => rows.reduce((total, invoice) => total + invoice.total, 0);

  out.paid_on_this_page = `${money(sum(paid), currency)} across ${paid.length} ${paid.length === 1 ? "invoice" : "invoices"}`;
  out.unpaid_on_this_page = outstanding.length
    ? `${money(sum(outstanding), currency)} across ${outstanding.length} ${outstanding.length === 1 ? "invoice" : "invoices"}`
    : "none";
  out.invoices = invoices
    .slice(0, MAX_LISTED)
    .map((invoice) => {
      const state = invoice.paidAt ? `paid ${dayOf(invoice.paidAt) ?? ""}`.trim() : plain(invoice.status).toLowerCase() || "unpaid";
      const due = !invoice.paidAt && invoice.dueAt ? `; due ${dayOf(invoice.dueAt)}` : "";
      return `${plain(invoice.invoiceNumber)} ${money(invoice.total, invoice.currency)} issued ${dayOf(invoice.issuedAt) ?? "unknown"} (${state}${due})`;
    })
    .join("; ");
  if (totalCount > invoices.length) {
    out.note = `this is page ${page} of the list; the totals above cover only the ${invoices.length} invoices on it`;
  }
  return out;
}

// ── Plugin activity ──────────────────────────────────────────────────────────

export interface PluginActivityRowLike extends Pick<WorkspacePluginToolAuditDto, "createdAt"> {
  pluginLabel: string;
  toolLabel: string;
  outcome: { label: string; tone: PluginActivityTone; fixer?: PluginActivityFixer | null };
}

export interface PluginActivitySnapshotInput {
  /** The calls on screen, newest first. */
  rows: readonly PluginActivityRowLike[];
  hasMore: boolean;
  page: number;
  /** A plugin or member filter is applied on screen. */
  filtered: boolean;
}

const FIXER_TEXT: Record<PluginActivityFixer, string> = {
  owner: "the workspace owner can fix it on the Plugins page",
  member: "only the member who made the call can fix it",
  platform: "a platform admin has to fix it",
  nobody: "nothing to fix",
};

export function pluginActivityAssistantSnapshot({ rows, hasMore, page, filtered }: PluginActivitySnapshotInput): Record<string, string> {
  const out: Record<string, string> = {
    scope: `the ${rows.length} newest plugin tool calls${filtered ? " matching the filter on screen" : ""}${page > 0 ? `; page ${page + 1}` : ""}${hasMore ? "; older calls exist and are not included" : ""}`,
    calls_shown: String(rows.length),
  };
  if (rows.length === 0) return out;

  const count = (tone: PluginActivityTone) => String(rows.filter((row) => row.outcome.tone === tone).length);
  out.calls_succeeded = count("success");
  out.calls_failed = count("failed");
  out.calls_blocked = count("blocked");
  out.calls_needing_attention = count("attention");
  out.calls_by_plugin = tally(rows.map((row) => row.pluginLabel));

  const newest = dayOf(rows[0].createdAt);
  const oldest = dayOf(rows[rows.length - 1].createdAt);
  if (newest && oldest) out.calls_from = oldest === newest ? newest : `${oldest} to ${newest}`;

  const problems = rows.filter((row) => row.outcome.tone !== "success");
  out.problems = problems.length
    ? listed(
        [...new Set(problems.map((row) => {
          const who = row.outcome.fixer ? ` - ${FIXER_TEXT[row.outcome.fixer]}` : "";
          return `${plain(row.pluginLabel)} ${plain(row.toolLabel)}: ${plain(row.outcome.label)}${who}`;
        }))],
      )
    : "none";
  out.problems_the_owner_can_fix = String(problems.filter((row) => row.outcome.fixer === "owner").length);
  return out;
}
