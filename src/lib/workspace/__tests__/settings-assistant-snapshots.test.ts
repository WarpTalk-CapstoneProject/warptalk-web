// What the workspace Settings pages (Workspace settings, Security, Member roles, Features,
// Invoices, Plugin activity) tell WarpBot.
//
// Rules pinned here: nobody is named, the DLP keywords never leave the page, a list that is one
// page of many says so, a source that was not read has no key, and no value holds a comma.

import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceSettingsDto } from "../../../types/workspace.ts";
import {
  featuresAssistantSnapshot,
  invoicesAssistantSnapshot,
  memberRolesAssistantSnapshot,
  pluginActivityAssistantSnapshot,
  securityAssistantSnapshot,
  workspaceSettingsAssistantSnapshot,
  type PluginActivityRowLike,
} from "../settings-assistant-snapshots.ts";

const settings = {
  defaultLanguage: "vi",
  timezone: "Asia/Ho_Chi_Minh",
  allowedTargetLanguages: ["vi", "en", "ja"],
  restrictLanguages: true,
  voiceCloningEnabled: true,
  maxActiveRooms: 20,
  maxActiveRoomsCeiling: 5,
  maxLanguagesCeiling: 3,
  artifactRetentionDays: 90,
  minutesClassification: "Internal",
  minutesTemplate: "vn-nd30",
  invitationExpiryDays: 7,
  verifiedDomains: ["acme.vn"],
  allowExternalCollaboration: false,
  requireVerifiedDomainForInternal: true,
  isProfanityFilterEnabled: false,
  allowAnyPlugins: false,
  aiUsagePolicy: {
    allowExternalLlm: true,
    redactPii: { enabled: true },
    dlp: { enabled: true, keywordsBlacklist: ["Project Falcon", "salary, 2026"] },
    translationProfile: { translationTone: "formal" },
    useGlobalGlossary: true,
  },
} as WorkspaceSettingsDto;

function noCommas(snapshot: Record<string, string>) {
  for (const [key, value] of Object.entries(snapshot)) assert.equal(/[,\r\n]/.test(value), false, `${key}=${value}`);
  for (const key of ["title", "name", "query", "status"]) assert.equal(key in snapshot, false, `pill key ${key}`);
}

test("workspace settings: the saved defaults, and the limit that is really in force", () => {
  const snapshot = workspaceSettingsAssistantSnapshot(settings);
  assert.equal(snapshot.default_meeting_language, "vi");
  assert.equal(snapshot.meeting_languages_allowed, "vi; en; ja");
  assert.equal(snapshot.max_meetings_at_once, "20");
  assert.equal(snapshot.max_meetings_at_once_allowed_by_plan, "5");
  assert.equal(snapshot.max_meetings_at_once_in_force, "5");
  assert.equal(snapshot.max_languages_per_meeting_allowed_by_plan, "3");
  assert.equal(snapshot.meeting_records_kept_for_days, "90");
  assert.equal(snapshot.voice_cloning, "on");
  assert.equal(snapshot.translation_tone, "formal");
  noCommas(snapshot);
});

test("workspace settings: an empty or unrestricted list is 'any language', and no plan quota leaves no key", () => {
  const snapshot = workspaceSettingsAssistantSnapshot({
    ...settings,
    allowedTargetLanguages: [],
    restrictLanguages: false,
    maxActiveRoomsCeiling: null,
    maxLanguagesCeiling: null,
    aiUsagePolicy: null,
  });
  assert.equal(snapshot.meeting_languages_allowed, "any language (not restricted)");
  for (const key of ["max_meetings_at_once_allowed_by_plan", "max_meetings_at_once_in_force", "max_languages_per_meeting_allowed_by_plan", "translation_tone"]) {
    assert.equal(key in snapshot, false, key);
  }
});

test("security: the blocked keywords are counted, never sent", () => {
  const snapshot = securityAssistantSnapshot({ settings, domains: ["acme.vn", "acme.com"] });
  assert.equal(snapshot.external_collaboration, "off");
  assert.equal(snapshot.internal_members_need_a_verified_domain, "yes");
  assert.equal(snapshot.verified_domains, "acme.vn; acme.com");
  assert.equal(snapshot.personal_data_redaction, "on");
  assert.equal(snapshot.blocked_keyword_filter, "on");
  assert.equal(snapshot.blocked_keywords_count, "2");
  assert.equal(JSON.stringify(snapshot).includes("Falcon"), false);
  noCommas(snapshot);
});

test("security: a domain list that was not read is left out, not 'none'", () => {
  const snapshot = securityAssistantSnapshot({ settings: { ...settings, aiUsagePolicy: null }, domains: undefined });
  for (const key of ["verified_domains", "verified_domains_count", "blocked_keyword_filter", "personal_data_redaction"]) {
    assert.equal(key in snapshot, false, key);
  }
  assert.equal(securityAssistantSnapshot({ settings, domains: [] }).verified_domains, "none");
});

test("member roles: counts only, and a first page is called a floor", () => {
  const members = [
    { roleName: "Owner", membershipType: "Internal", status: "active" },
    { roleName: "Admin", membershipType: "Internal", status: "active" },
    { roleName: "Member", membershipType: "Internal", status: "active" },
    { roleName: "Member", membershipType: "External", status: "active" },
  ];
  const snapshot = memberRolesAssistantSnapshot({ members, total: 4 });
  assert.equal(snapshot.owners, "1");
  assert.equal(snapshot.admins, "1");
  assert.equal(snapshot.internal_members, "3");
  assert.equal(snapshot.external_members, "1");
  assert.equal(snapshot.members_whose_role_can_change, "2");
  assert.equal(snapshot.internal_members_who_are_not_admin_yet, "1");
  assert.equal("note" in snapshot, false);
  assert.match(memberRolesAssistantSnapshot({ members, total: 250 }).note, /first 4 of 250/);
  noCommas(memberRolesAssistantSnapshot({ members, total: 250 }));
});

test("features: included, not included and limits; an unknown snapshot says so instead of listing defaults", () => {
  const rows = [
    { label: "Voice cloning", value: { text: "Included", state: "included" } },
    { label: "Recording", value: { text: "Not included", state: "excluded" } },
    { label: "Participants per meeting", value: { text: "1,000 people", state: "limit" } },
    { label: "Meetings at once", value: { text: "Unlimited", state: "unlimited" } },
  ];
  const snapshot = featuresAssistantSnapshot({ entitlements: { isKnown: true, planSlug: "team", hasActiveSubscription: true }, rows });
  assert.equal(snapshot.plan, "team");
  assert.equal(snapshot.features_included, "Voice cloning");
  assert.equal(snapshot.features_not_included, "Recording");
  assert.equal(snapshot.limits, "Participants per meeting: 1 000 people; Meetings at once: Unlimited");
  noCommas(snapshot);

  const cold = featuresAssistantSnapshot({ entitlements: { isKnown: false, planSlug: null, hasActiveSubscription: false }, rows: [] });
  assert.deepEqual(Object.keys(cold), ["entitlements"]);
});

test("invoices: only a PAID invoice counts as paid, void is owed by nobody, and a page is called a page", () => {
  const at = (month: number, day: number) => new Date(2026, month - 1, day, 10).toISOString();
  const invoices = [
    { invoiceNumber: "INV-003", total: 49.5, currency: "USD", status: "open", issuedAt: at(9, 1), dueAt: at(9, 15), paidAt: null },
    { invoiceNumber: "INV-002", total: 49.5, currency: "USD", status: "paid", issuedAt: at(8, 1), dueAt: null, paidAt: at(8, 2) },
    { invoiceNumber: "INV-001", total: 20, currency: "USD", status: "void", issuedAt: at(7, 1), dueAt: null, paidAt: null },
  ];
  const snapshot = invoicesAssistantSnapshot({ invoices, totalCount: 40, page: 1 });
  assert.equal(snapshot.invoices_total, "40");
  assert.equal(snapshot.paid_on_this_page, "49.5 USD across 1 invoice");
  assert.equal(snapshot.unpaid_on_this_page, "49.5 USD across 1 invoice");
  assert.match(snapshot.invoices, /^INV-003 49\.5 USD issued 2026-09-01 \(open; due 2026-09-15\); INV-002 49\.5 USD issued 2026-08-01 \(paid 2026-08-02\); INV-001/);
  assert.match(snapshot.note, /page 1/);
  noCommas(snapshot);

  const none = invoicesAssistantSnapshot({ invoices: [], totalCount: 0, page: 1 });
  assert.deepEqual(none, { invoices_total: "0", invoices_on_this_page: "0" });
});

test("plugin activity: outcomes and plugins, never who made the call", () => {
  const row = (pluginLabel: string, toolLabel: string, tone: PluginActivityRowLike["outcome"]["tone"], label: string, fixer: PluginActivityRowLike["outcome"]["fixer"], day: number) =>
    ({ pluginLabel, toolLabel, outcome: { label, tone, fixer }, createdAt: new Date(2026, 8, day, 10).toISOString(), memberLabel: "Nguyen Van A" }) as PluginActivityRowLike;
  const rows = [
    row("Google Drive", "Search files", "success", "Succeeded", null, 15),
    row("Google Drive", "Read file", "attention", "Needs reconnecting", "member", 15),
    row("Slack", "Post message", "blocked", "Blocked by the workspace", "owner", 14),
    row("Slack", "Post message", "blocked", "Blocked by the workspace", "owner", 13),
  ];
  const snapshot = pluginActivityAssistantSnapshot({ rows, hasMore: true, page: 0, filtered: false });
  assert.equal(snapshot.calls_shown, "4");
  assert.equal(snapshot.calls_succeeded, "1");
  assert.equal(snapshot.calls_blocked, "2");
  assert.equal(snapshot.calls_needing_attention, "1");
  assert.equal(snapshot.calls_by_plugin, "Google Drive 2; Slack 2");
  assert.equal(snapshot.calls_from, "2026-09-13 to 2026-09-15");
  assert.equal(snapshot.problems_the_owner_can_fix, "2");
  // The same problem twice is said once.
  assert.equal(snapshot.problems.split("Slack Post message").length - 1, 1);
  assert.match(snapshot.scope, /older calls exist/);
  assert.equal(JSON.stringify(snapshot).includes("Nguyen"), false);
  noCommas(snapshot);

  const empty = pluginActivityAssistantSnapshot({ rows: [], hasMore: false, page: 0, filtered: true });
  assert.equal(empty.calls_shown, "0");
  assert.match(empty.scope, /matching the filter/);
  assert.equal("calls_failed" in empty, false);
});
