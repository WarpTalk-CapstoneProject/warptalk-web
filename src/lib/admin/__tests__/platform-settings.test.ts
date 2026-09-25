import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSettingDiff,
  categoryOfKey,
  consoleUrlQuery,
  describeEffectiveValue,
  expectedVersionAt,
  explainEffectiveValue,
  exportFileName,
  filterSettings,
  flagToJson,
  formatFlag,
  formatSettingValue,
  isChangedFromDefault,
  normalizeFlag,
  orderedCategories,
  parseConsoleUrl,
  parseImportFile,
  parseNumberDraft,
  rankSettings,
  reasonIsValid,
  settingHref,
  settingMatchesQuery,
  settingValuesEqual,
  splitListInput,
  storedAt,
  validateScopeId,
  validateSettingValue,
} from "../platform-settings.ts";
import {
  PLATFORM_SETTING_CATEGORIES,
  PLATFORM_SETTINGS_EXPORT_FORMAT,
  type PlatformSettingDto,
} from "../../../types/admin-platform-settings.ts";

const EMAIL = '^[^@\\s<>"]+@[^@\\s<>"]+\\.[^@\\s<>"]+$';
const WS = "0f8fad5b-d9cb-469f-a165-70867728950e";
const WS2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function setting(overrides: Partial<PlatformSettingDto> = {}): PlatformSettingDto {
  return {
    key: "security.lockout.duration_minutes",
    category: "security",
    type: "integer",
    label: "Lockout duration",
    description: "How long a locked account stays locked.",
    owningService: "auth",
    scopes: ["platform"],
    unit: "minutes",
    min: 1,
    max: 1440,
    allowedValues: null,
    maxLength: null,
    pattern: null,
    requiresRestart: false,
    risky: false,
    sensitive: false,
    requiresSecurityPermission: true,
    defaultValue: 15,
    value: null,
    version: 0,
    isSet: false,
    overrides: [],
    lastChangedAt: null,
    lastChangedBy: null,
    canEdit: true,
    ...overrides,
  };
}

// ── Validation mirrors SettingValueValidator ───────────────────────────────────────────────────

test("booleans accept only true and false", () => {
  const rules = setting({ type: "boolean", unit: null, min: null, max: null });
  assert.equal(validateSettingValue(rules, true), null);
  assert.equal(validateSettingValue(rules, false), null);
  assert.deepEqual(validateSettingValue(rules, "true"), { code: "expectedBoolean" });
});

test("integers are whole and inside min/max, with the unit in the error", () => {
  const rules = setting();
  assert.equal(validateSettingValue(rules, 15), null);
  assert.equal(validateSettingValue(rules, 1), null);
  assert.equal(validateSettingValue(rules, 1440), null);
  assert.deepEqual(validateSettingValue(rules, 1.5), { code: "expectedInteger" });
  assert.deepEqual(validateSettingValue(rules, "15"), { code: "expectedInteger" });
  assert.deepEqual(validateSettingValue(rules, 0), { code: "min", min: 1, unit: "minutes" });
  assert.deepEqual(validateSettingValue(rules, 1441), { code: "max", max: 1440, unit: "minutes" });
  assert.deepEqual(validateSettingValue(rules, Number.NaN), { code: "expectedInteger" });
});

test("decimals allow fractions and negative bounds", () => {
  const rules = setting({ type: "decimal", min: -5, max: 0, unit: "avg log-prob" });
  assert.equal(validateSettingValue(rules, -0.5), null);
  assert.deepEqual(validateSettingValue(rules, 0.1), { code: "max", max: 0, unit: "avg log-prob" });
  assert.deepEqual(validateSettingValue(rules, "x"), { code: "expectedNumber" });
});

test("strings check length, control characters and pattern; empty skips the pattern", () => {
  const rules = setting({ type: "string", maxLength: 254, pattern: EMAIL, min: null, max: null, unit: null });
  assert.equal(validateSettingValue(rules, "support@warptalk.vn"), null);
  assert.equal(validateSettingValue(rules, ""), null, "an empty reply-to is allowed");
  assert.deepEqual(validateSettingValue(rules, "not an email"), { code: "pattern" });
  assert.deepEqual(validateSettingValue(rules, "a\u0001@b.vn"), { code: "controlCharacters" });
  assert.deepEqual(validateSettingValue(rules, `${"a".repeat(250)}@b.vn`), { code: "tooLong", maxLength: 254 });
  assert.deepEqual(validateSettingValue(rules, 12), { code: "expectedText" });
  const message = setting({ type: "string", maxLength: 500, pattern: null });
  assert.equal(validateSettingValue(message, "line one\nline two\ttabbed"), null, "newlines and tabs are not control characters here");
});

test("an unparseable pattern is left to the server", () => {
  const rules = setting({ type: "string", pattern: "(?<=unsupported", maxLength: 10 });
  assert.equal(validateSettingValue(rules, "anything"), null);
});

test("enums accept only the allowed values", () => {
  const rules = setting({ type: "enum", allowedValues: ["fast", "accurate"] });
  assert.equal(validateSettingValue(rules, "fast"), null);
  assert.deepEqual(validateSettingValue(rules, "slow"), { code: "notAllowed", value: "slow", allowed: ["fast", "accurate"] });
});

test("string lists: count, entries, pattern per item, duplicates case-insensitively", () => {
  const rules = setting({ type: "string_list", maxLength: 2, pattern: EMAIL });
  assert.equal(validateSettingValue(rules, []), null);
  assert.equal(validateSettingValue(rules, ["a@b.vn", "c@d.vn"]), null);
  assert.deepEqual(validateSettingValue(rules, ["a@b.vn", "c@d.vn", "e@f.vn"]), { code: "tooManyEntries", maxLength: 2 });
  assert.deepEqual(validateSettingValue(rules, ["a@b.vn", 3]), { code: "entryNotText", index: 2 });
  assert.deepEqual(validateSettingValue(rules, [" "]), { code: "entryEmpty", index: 1 });
  assert.deepEqual(validateSettingValue(rules, ["nope"]), { code: "pattern", index: 1 });
  assert.deepEqual(validateSettingValue(rules, ["A@b.vn", "a@B.vn"]), { code: "duplicate", value: "a@B.vn" });
  assert.deepEqual(validateSettingValue(rules, "a@b.vn"), { code: "expectedList" });
});

test("feature flags: shape, kill switch, rollout, plan slugs and workspace ids", () => {
  const rules = setting({ type: "feature_flag" });
  assert.equal(validateSettingValue(rules, { enabled: true }), null);
  assert.equal(validateSettingValue(rules, { enabled: false, rolloutPercent: 0 }), null);
  assert.equal(
    validateSettingValue(rules, { enabled: true, rolloutPercent: 25, allowPlans: ["pro", "enterprise_v2"], allowWorkspaces: [WS], denyWorkspaces: [WS2] }),
    null,
  );
  assert.deepEqual(validateSettingValue(rules, true), { code: "expectedFlag" });
  assert.deepEqual(validateSettingValue(rules, { rolloutPercent: 10 }), { code: "flagEnabled" });
  assert.deepEqual(validateSettingValue(rules, { enabled: true, extra: 1 }), { code: "flagUnknownField", field: "extra" });
  assert.deepEqual(validateSettingValue(rules, { enabled: true, rolloutPercent: 101 }), { code: "flagRollout" });
  assert.deepEqual(validateSettingValue(rules, { enabled: true, rolloutPercent: 12.5 }), { code: "flagRollout" });
  assert.deepEqual(validateSettingValue(rules, { enabled: true, allowPlans: ["Pro Plan"] }), { code: "flagPlanSlugs" });
  assert.deepEqual(validateSettingValue(rules, { enabled: true, denyWorkspaces: ["acme"] }), { code: "flagWorkspaceIds", field: "denyWorkspaces" });
  assert.deepEqual(validateSettingValue(rules, { enabled: true, allowWorkspaces: "x" }), { code: "flagList", field: "allowWorkspaces" });
});

test("number drafts parse plain decimals only", () => {
  assert.equal(parseNumberDraft("15"), 15);
  assert.equal(parseNumberDraft(" -0.5 "), -0.5);
  assert.equal(parseNumberDraft("0,55"), 0.55);
  assert.equal(parseNumberDraft(""), null);
  assert.equal(parseNumberDraft("1e3"), null);
  assert.equal(parseNumberDraft("12abc"), null);
});

test("pasted lists split on commas, semicolons and newlines", () => {
  assert.deepEqual(splitListInput("a@b.vn, c@d.vn\n e@f.vn;;"), ["a@b.vn", "c@d.vn", "e@f.vn"]);
});

// ── Formatting ─────────────────────────────────────────────────────────────────────────────────

test("values format with units, booleans, lists and flags", () => {
  assert.equal(formatSettingValue(setting(), 30), "30 minutes");
  assert.equal(formatSettingValue(setting({ unit: "credits" }), 20000), "20,000 credits");
  assert.equal(formatSettingValue(setting({ unit: null, type: "decimal" }), 0.55), "0.55");
  assert.equal(formatSettingValue(setting({ type: "boolean" }), true), "On");
  assert.equal(formatSettingValue(setting({ type: "boolean" }), false), "Off");
  assert.equal(formatSettingValue(setting({ type: "string" }), ""), "(empty)");
  assert.equal(formatSettingValue(setting({ type: "string_list" }), []), "None");
  assert.equal(formatSettingValue(setting({ type: "string_list" }), ["a@b.vn", "c@d.vn"]), "a@b.vn, c@d.vn");
  assert.equal(formatSettingValue(setting(), null), "None");
});

test("a flag reads as its kill switch first, then rollout and lists", () => {
  assert.equal(formatFlag({ enabled: false, rolloutPercent: 50, allowWorkspaces: [WS] }), "Off");
  assert.equal(formatFlag({ enabled: true }), "On");
  assert.equal(formatFlag({ enabled: true, rolloutPercent: 25, allowWorkspaces: [WS, WS2] }), "On · 25% · 2 workspaces");
  assert.equal(formatFlag({ enabled: true, rolloutPercent: 100, allowPlans: ["pro"], denyWorkspaces: [WS] }), "On · 1 plan · 1 denied");
});

test("normalizeFlag fills defaults the way FeatureFlagValue does (absent rollout = 100)", () => {
  assert.deepEqual(normalizeFlag({ enabled: true }), {
    enabled: true,
    rolloutPercent: 100,
    allowPlans: [],
    allowWorkspaces: [],
    denyWorkspaces: [],
  });
  assert.deepEqual(normalizeFlag(null).enabled, false);
  assert.deepEqual(Object.keys(flagToJson(normalizeFlag({ enabled: true }))), [
    "enabled",
    "rolloutPercent",
    "allowPlans",
    "allowWorkspaces",
    "denyWorkspaces",
  ]);
});

test("the effective value names the owning service when nothing is stored", () => {
  const notSet = setting();
  assert.deepEqual(explainEffectiveValue(notSet), { state: "notSet", service: "auth", codeDefault: 15, overrides: 0 });
  assert.equal(describeEffectiveValue(notSet), "Not set — auth uses its deploy-time value (code default 15 minutes)");
  const set = setting({ isSet: true, value: 30, version: 2 });
  assert.deepEqual(explainEffectiveValue(set), { state: "set", value: 30, overrides: 0 });
  assert.equal(describeEffectiveValue(set), "30 minutes");
});

// ── Filters, search, URL ───────────────────────────────────────────────────────────────────────

const overrideRow = { scopeType: "workspace" as const, scopeId: WS, value: 50, version: 3, updatedAt: "2026-09-20T00:00:00Z", updatedBy: null };

test("changed from default means a stored platform value or any override", () => {
  assert.equal(isChangedFromDefault(setting()), false);
  assert.equal(isChangedFromDefault(setting({ isSet: true, value: 20, version: 1 })), true);
  assert.equal(isChangedFromDefault(setting({ overrides: [overrideRow] })), true);
});

test("search matches label, key (dotted or spaced), description, category and owning service", () => {
  const row = setting();
  assert.ok(settingMatchesQuery(row, "lockout"));
  assert.ok(settingMatchesQuery(row, "lockout duration"));
  assert.ok(settingMatchesQuery(row, "security.lockout"));
  assert.ok(settingMatchesQuery(row, "stays locked"));
  assert.ok(settingMatchesQuery(row, "auth"));
  assert.ok(settingMatchesQuery(row, "bao mat", ["Bảo mật"]), "the localized category name is searchable, without diacritics");
  assert.ok(!settingMatchesQuery(row, "stripe"));
});

test("filterSettings: a query searches every category; without one the category narrows", () => {
  const rows = [
    setting(),
    setting({ key: "billing.trial.days", category: "billing", label: "Trial length", owningService: "billing", isSet: true, value: 7, version: 1 }),
    setting({ key: "general.support_email", category: "general", label: "Support e-mail", owningService: "web" }),
  ];
  assert.deepEqual(filterSettings(rows, { category: "billing", query: "", changedOnly: false }).map((r) => r.key), ["billing.trial.days"]);
  assert.deepEqual(filterSettings(rows, { category: "billing", query: "lockout", changedOnly: false }).map((r) => r.key), [
    "security.lockout.duration_minutes",
  ]);
  assert.deepEqual(filterSettings(rows, { category: null, query: "", changedOnly: true }).map((r) => r.key), ["billing.trial.days"]);
});

test("palette ranking puts label/key hits first and needs two characters", () => {
  const rows = [
    setting({ key: "general.maintenance.message", label: "Maintenance message", description: "Shown while lockout…", category: "general" }),
    setting(),
  ];
  assert.deepEqual(rankSettings("lockout", rows).map((r) => r.key), ["security.lockout.duration_minutes", "general.maintenance.message"]);
  assert.deepEqual(rankSettings("l", rows), []);
});

test("the console URL round-trips and writes nothing for defaults", () => {
  const params = new URLSearchParams("category=security&q=lockout&changed=1&key=security.lockout.duration_minutes");
  const state = parseConsoleUrl(params);
  assert.deepEqual(state, { category: "security", query: "lockout", changedOnly: true, focusKey: "security.lockout.duration_minutes" });
  assert.equal(consoleUrlQuery(state), "?category=security&q=lockout&changed=1&key=security.lockout.duration_minutes");
  assert.equal(consoleUrlQuery({}), "");
  assert.equal(parseConsoleUrl(new URLSearchParams("category=<script>")).category, null);
  assert.equal(settingHref("security.lockout.duration_minutes"), "/admin/settings?key=security.lockout.duration_minutes");
  assert.equal(categoryOfKey([setting()], "security.lockout.duration_minutes"), "security");
  assert.equal(categoryOfKey([setting()], "missing.key"), null);
});

test("the left nav lists every category in order, then unknown server categories", () => {
  assert.deepEqual(orderedCategories([]), [...PLATFORM_SETTING_CATEGORIES]);
  assert.deepEqual(orderedCategories([{ key: "security" }, { key: "experiments" }]), [...PLATFORM_SETTING_CATEGORIES, "experiments"]);
});

// ── Scopes, versions, diff ─────────────────────────────────────────────────────────────────────

test("expectedVersion is the version read at that scope, 0 when nothing is stored", () => {
  const row = setting({ scopes: ["platform", "workspace"], isSet: true, value: 20, version: 4, overrides: [overrideRow] });
  assert.equal(expectedVersionAt(row, { scopeType: "platform", scopeId: "" }), 4);
  assert.equal(expectedVersionAt(row, { scopeType: "workspace", scopeId: WS.toUpperCase() }), 3);
  assert.equal(expectedVersionAt(row, { scopeType: "workspace", scopeId: WS2 }), 0);
  assert.equal(expectedVersionAt(setting(), { scopeType: "platform", scopeId: "" }), 0);
  assert.deepEqual(storedAt(row, { scopeType: "workspace", scopeId: WS }), { value: 50, version: 3 });
});

test("scope ids follow the server's rules", () => {
  const row = setting({ scopes: ["platform", "plan", "workspace"] });
  assert.equal(validateScopeId(row, "plan", "pro"), null);
  assert.equal(validateScopeId(row, "plan", "Pro Plan"), "planSlug");
  assert.equal(validateScopeId(row, "workspace", WS), null);
  assert.equal(validateScopeId(row, "workspace", "acme"), "workspaceId");
  assert.equal(validateScopeId(setting(), "plan", "pro"), "scopeNotAllowed");
});

test("the diff shows before/after, list deltas, flag fields and whether a reason is needed", () => {
  const risky = setting({ key: "billing.trial.days", category: "billing", risky: true, requiresSecurityPermission: false, isSet: true, value: 14, version: 2 });
  const diff = buildSettingDiff(risky, { scopeType: "platform", scopeId: "" }, 30);
  assert.equal(diff.before, 14);
  assert.equal(diff.after, 30);
  assert.equal(diff.kind, "set");
  assert.equal(diff.unchanged, false);
  assert.equal(diff.requiresReason, true);
  assert.equal(diff.expectedVersion, 2);

  const reset = buildSettingDiff(risky, { scopeType: "platform", scopeId: "" }, null);
  assert.equal(reset.kind, "reset");

  const plain = setting({ requiresSecurityPermission: false, category: "limits" });
  assert.equal(buildSettingDiff(plain, { scopeType: "platform", scopeId: "" }, 20).requiresReason, false);
  assert.equal(buildSettingDiff(setting(), { scopeType: "platform", scopeId: "" }, 20).requiresReason, true, "security settings ask why");

  const list = setting({ type: "string_list", isSet: true, value: ["a@b.vn", "c@d.vn"], version: 1 });
  const listDiff = buildSettingDiff(list, { scopeType: "platform", scopeId: "" }, ["c@d.vn", "e@f.vn"]);
  assert.deepEqual(listDiff.added, ["e@f.vn"]);
  assert.deepEqual(listDiff.removed, ["a@b.vn"]);

  const flag = setting({ type: "feature_flag", isSet: true, value: { enabled: true }, version: 1 });
  const flagDiff = buildSettingDiff(flag, { scopeType: "platform", scopeId: "" }, { enabled: true, rolloutPercent: 25 });
  assert.deepEqual(flagDiff.fields, [{ field: "rolloutPercent", before: 100, after: 25 }]);
  assert.equal(buildSettingDiff(flag, { scopeType: "platform", scopeId: "" }, flagToJson(normalizeFlag({ enabled: true }))).unchanged, true);
});

test("value equality ignores key order and flag defaults", () => {
  assert.ok(settingValuesEqual("feature_flag", { enabled: true }, { rolloutPercent: 100, enabled: true, allowPlans: [] }));
  assert.ok(!settingValuesEqual("integer", 1, 2));
  assert.ok(settingValuesEqual("integer", null, undefined));
  assert.ok(!settingValuesEqual("string", "", null));
});

test("reasons: required ones need ten characters, optional ones may be empty", () => {
  assert.equal(reasonIsValid("short", true), false);
  assert.equal(reasonIsValid("   rotating the sender domain   ", true), true);
  assert.equal(reasonIsValid("", false), true);
  assert.equal(reasonIsValid("x".repeat(1001), false), false);
});

// ── Export / import ────────────────────────────────────────────────────────────────────────────

test("the export file is named by UTC date", () => {
  assert.equal(exportFileName(new Date(Date.UTC(2026, 8, 5, 23, 30))), "warptalk-platform-settings-20260905.json");
});

test("an import file must be the export's format", () => {
  const good = JSON.stringify({
    format: PLATFORM_SETTINGS_EXPORT_FORMAT,
    exportedAt: "2026-09-25T00:00:00Z",
    settings: [
      { key: "billing.trial.days", scopeType: "platform", scopeId: "", value: 30 },
      { key: "limits.document_upload_mb", scopeType: "plan", scopeId: "pro", value: 50 },
    ],
    excluded: ["general.maintenance.allowlist_emails"],
  });
  const parsed = parseImportFile(good);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.entries.length, 2);
    assert.deepEqual(parsed.excluded, ["general.maintenance.allowlist_emails"]);
  }

  assert.deepEqual(parseImportFile("{nope"), { ok: false, error: { code: "invalidJson" } });
  assert.deepEqual(parseImportFile("[]"), { ok: false, error: { code: "notAnObject" } });
  assert.deepEqual(parseImportFile(JSON.stringify({ format: "other/v2", settings: [] })), {
    ok: false,
    error: { code: "wrongFormat", format: "other/v2" },
  });
  assert.deepEqual(parseImportFile(JSON.stringify({ format: PLATFORM_SETTINGS_EXPORT_FORMAT, settings: [] })), {
    ok: false,
    error: { code: "noSettings" },
  });
  const badScope = JSON.stringify({ format: PLATFORM_SETTINGS_EXPORT_FORMAT, settings: [{ key: "billing.trial.days", scopeType: "galaxy", scopeId: "", value: 1 }] });
  assert.deepEqual(parseImportFile(badScope), { ok: false, error: { code: "badEntry", index: 1, reason: "scopeType" } });
  const platformWithId = JSON.stringify({ format: PLATFORM_SETTINGS_EXPORT_FORMAT, settings: [{ key: "billing.trial.days", scopeType: "platform", scopeId: "x", value: 1 }] });
  assert.deepEqual(parseImportFile(platformWithId), { ok: false, error: { code: "badEntry", index: 1, reason: "scopeId" } });
  const noValue = JSON.stringify({ format: PLATFORM_SETTINGS_EXPORT_FORMAT, settings: [{ key: "billing.trial.days" }] });
  assert.deepEqual(parseImportFile(noValue), { ok: false, error: { code: "badEntry", index: 1, reason: "value" } });
});

test("an audit entry about a setting links to its row; an import or export opens the console", async () => {
  const { auditEntityHref, AUDIT_ENTITY_LABELS } = await import("../audit-log.ts");
  const ref = (key: string | null) => ({ type: "platform_setting", id: null, key, workspaceId: null, workspaceSlug: null });
  assert.equal(auditEntityHref(ref("security.lockout.duration_minutes")), "/admin/settings?key=security.lockout.duration_minutes");
  assert.equal(auditEntityHref(ref(`limits.document_upload_mb@workspace:${WS}`)), "/admin/settings?key=limits.document_upload_mb");
  assert.equal(auditEntityHref(ref("settings")), "/admin/settings");
  assert.equal(auditEntityHref(ref(null)), "/admin/settings");
  assert.equal(AUDIT_ENTITY_LABELS.platform_setting, "Platform setting");
});
