#!/usr/bin/env node
/**
 * The platform settings console (/admin/settings) against the backend it renders and the rules
 * it has to keep.
 *
 * WHY THIS EXISTS
 *   The console renders a registry that lives in another repo (WarpTalk.Shared.PlatformSettings).
 *   A new value type or category added there compiles fine here and renders as nothing — an editor
 *   with no control, a nav row with no name. And every one of the console's write controls is a
 *   place a read-only staff member could be offered a button that can only end in 403, which is
 *   exactly the bug the old page shipped with (settings.manage was defined and never read).
 *
 * WHAT IT PINS
 *   1. The web's setting types and categories equal the backend's SettingValueType (as the wire
 *      names PlatformSettingsAdminService.TypeName sends) and SettingCategories.Ordered, in order;
 *      the audit vocabulary covers AdminAuditPlatformSettingActions and the platform_setting type.
 *      Skipped, with a log line, when the backend checkout is not available.
 *   2. Every write surface is gated: the console on settings.manage AND settings.security, the
 *      billing and language panels on settings.manage, and the row explains a refusal.
 *   3. Every endpoint the service calls exists in endpoints.ts, and every one there is called.
 *   4. Nothing the old page held is lost: billing policy (VAT), pricing economics with the FX row,
 *      language catalog, voice consent.
 *   5. ⌘K can find a setting (the settings source respects staff access) and its actions carry
 *      permissions.
 *   6. The adminPlatformSettings and platformStatus namespaces are loaded and have the same keys in
 *      en, vi and ja; the maintenance banner is mounted in the app shell and the sign-in layout.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
// assert.match prints the whole source on failure; a file-sized diff hides the one-line reason.
const has = (source, pattern, message) => assert.ok(pattern.test(source), message);
const lacks = (source, pattern, message) => assert.ok(!pattern.test(source), message);

const types = read("src/types/admin-platform-settings.ts");
const listOf = (name) => {
  const block = types.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`))?.[1];
  assert.ok(block, `src/types/admin-platform-settings.ts must declare ${name}`);
  return [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
};
const webTypes = listOf("PLATFORM_SETTING_TYPES");
const webCategories = listOf("PLATFORM_SETTING_CATEGORIES");
const webScopes = listOf("PLATFORM_SETTING_SCOPES");

// ── 1. Same vocabulary as the backend ───────────────────────────────────────────────────────
const backendRoot = process.env.BACKEND_ROOT ?? path.resolve(root, "..", "warptalk-backend");
const definitionFile = path.join(backendRoot, "shared/WarpTalk.Shared/PlatformSettings/SettingDefinition.cs");
const serviceFile = path.join(
  backendRoot,
  "workspace/src/WarpTalk.WorkspaceService.Application/Services/PlatformSettingsAdminService.cs",
);
const auditFile = path.join(backendRoot, "shared/WarpTalk.Shared/Events/AdminAuditEvents.cs");
let backendChecked = false;
if (existsSync(definitionFile)) {
  const cs = readFileSync(definitionFile, "utf8");
  const enumBody = cs.match(/public enum SettingValueType\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const enumMembers = [...enumBody.matchAll(/^\s*(\w+),?\s*$/gm)].map((m) => m[1]);
  assert.ok(enumMembers.length >= 5, "could not read SettingValueType from the backend");

  let wireTypes = enumMembers.map((name) => name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase());
  if (existsSync(serviceFile)) {
    const service = readFileSync(serviceFile, "utf8");
    const mapped = Object.fromEntries(
      [...service.matchAll(/SettingValueType\.(\w+) => "([a-z_]+)"/g)].map((m) => [m[1], m[2]]),
    );
    wireTypes = enumMembers.map((name) => {
      assert.ok(mapped[name], `PlatformSettingsAdminService.TypeName has no wire name for SettingValueType.${name}`);
      return mapped[name];
    });
  }
  assert.deepEqual(webTypes, wireTypes, "web PLATFORM_SETTING_TYPES must equal the backend's SettingValueType wire names, in order");

  const constants = Object.fromEntries(
    [...(cs.match(/public static class SettingCategories\s*\{([\s\S]*?)\n\}/)?.[1] ?? "").matchAll(/public const string (\w+) = "([a-z_]+)";/g)].map(
      (m) => [m[1], m[2]],
    ),
  );
  const ordered = cs.match(/public static readonly string\[\] Ordered =\s*\[([\s\S]*?)\];/)?.[1] ?? "";
  const backendCategories = [...ordered.matchAll(/(\w+)/g)].map((m) => constants[m[1]]).filter(Boolean);
  assert.ok(backendCategories.length >= 5, "could not read SettingCategories.Ordered from the backend");
  assert.deepEqual(webCategories, backendCategories, "web PLATFORM_SETTING_CATEGORIES must equal SettingCategories.Ordered");

  const scopeEnum = cs.match(/public enum SettingScopes\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const backendScopes = [...scopeEnum.matchAll(/^\s*(\w+)\s*=/gm)].map((m) => m[1].toLowerCase());
  assert.deepEqual(webScopes, backendScopes, "web PLATFORM_SETTING_SCOPES must equal SettingScopes");

  if (existsSync(auditFile)) {
    const audit = readFileSync(auditFile, "utf8");
    const actionsBlock = audit.match(/public static class AdminAuditPlatformSettingActions\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const actions = [...actionsBlock.matchAll(/public const string \w+ = "([a-z_.]+)";/g)].map((m) => m[1]);
    const auditLib = read("src/lib/admin/audit-log.ts");
    for (const action of actions) {
      assert.ok(auditLib.includes(`"${action}":`), `AUDIT_ACTION_LABELS must label the backend verb ${action}`);
    }
    has(audit, /PlatformSetting = "platform_setting"/, "the backend audit entity type platform_setting moved");
  }
  backendChecked = true;
}
const auditLib = read("src/lib/admin/audit-log.ts");
has(auditLib, /platform_setting: "Platform setting"/, "AUDIT_ENTITY_LABELS must name platform_setting");
has(auditLib, /case "platform_setting":/, "an audit entry about a setting must link to it");

// ── 2. Every write control is gated ─────────────────────────────────────────────────────────
const permissions = read("src/lib/admin/staff-permissions.ts");
has(permissions, /settingsSecurity: "settings\.security"/, "ADMIN_PERMISSIONS must carry settings.security");

const dir = "src/components/admin/settings";
const consoleSource = read(`${dir}/platform-settings-console.tsx`);
const rowSource = read(`${dir}/setting-row.tsx`);
const billingPanels = read(`${dir}/billing-panels.tsx`);
const referencePanels = read(`${dir}/reference-panels.tsx`);
const integrations = read(`${dir}/integrations-panel.tsx`);

has(consoleSource, /useCan\(ADMIN_PERMISSIONS\.settingsManage\)/, "the console must read settings.manage");
has(consoleSource, /useCan\(ADMIN_PERMISSIONS\.settingsSecurity\)/, "the console must read settings.security");
has(consoleSource, /setting\.requiresSecurityPermission && !canManageSecurity/, "Security writes must also need settings.security");
has(consoleSource, /!setting\.canEdit/, "the server's canEdit must be honoured");
has(consoleSource, /\{manage \? \(\s*<>\s*<Button[\s\S]{0,200}?exportSettings/, "Export must be offered only to managers");
has(consoleSource, /\{manage \? <SettingsImportDialog/, "Import must be offered only to managers");
has(consoleSource, /<IntegrationsPanel canManage=\{manage\}/, "integration tests must be offered only to managers");
has(integrations, /integration\.testable && canManage/, "Test connection needs settings.manage");
has(rowSource, /const canWrite = refusal === null;/, "a row derives its write controls from the refusal");
has(rowSource, /\{canWrite \? \(/, "a row renders edit/reset/override controls only when it may write");
has(rowSource, /refusal\.\$\{refusal\}/, "a row explains why it is read-only");

has(billingPanels, /useCan\(ADMIN_PERMISSIONS\.settingsManage\)/, "the billing panels must read settings.manage");
has(billingPanels, /useCan\(ADMIN_PERMISSIONS\.billingPricingManage\)/, "FX and pricing writes need billing.pricing_manage, as the server does");
has(billingPanels, /\{canManage \? \(\s*<Button[\s\S]{0,260}?void save\(\)/, "the VAT save button needs settings.manage");
has(billingPanels, /\{canManage && fx\?\.mode === "manual"/, "the FX override action needs the write permission");
has(billingPanels, /\{config && canManage \?/, "the pricing edit button needs the write permission");
has(referencePanels, /useCan\(ADMIN_PERMISSIONS\.settingsManage\)/, "the language catalog must read settings.manage");
has(referencePanels, /\{canManage \? \(\s*<div className="mt-2 flex justify-end">/, "adding a language needs settings.manage");
has(referencePanels, /\{canManage \? \(\s*<>\s*<Button variant="ghost" size="sm" onClick=\{\(\) => setFormLanguage\(row\)\}/, "editing and toggling a language needs settings.manage");

// ── 3. Endpoints ────────────────────────────────────────────────────────────────────────────
const endpoints = read("src/lib/api/endpoints.ts");
const block = endpoints.slice(endpoints.indexOf("adminPlatformSettings: {"), endpoints.indexOf("platformStatus: {"));
assert.ok(block.length > 50, "endpoints.ts must declare adminPlatformSettings before platformStatus");
const endpointKeys = [...block.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
const service = read("src/services/admin-platform-settings.service.ts");
for (const key of endpointKeys) {
  has(service, new RegExp(`API\\.adminPlatformSettings\\.${key}\\b`), `the service must call API.adminPlatformSettings.${key}`);
}
for (const [, key] of service.matchAll(/API\.adminPlatformSettings\.(\w+)/g)) {
  assert.ok(endpointKeys.includes(key), `API.adminPlatformSettings.${key} is not declared in endpoints.ts`);
}
has(endpoints, /platformStatus: \{\s*base: "\/platform\/status"/, "the public status endpoint must be declared");
has(service, /axios\.get<PlatformStatusDto>/, "the anonymous status call must not go through the session-refreshing apiClient");

// ── 4. Nothing from the old page is lost ────────────────────────────────────────────────────
const page = read("src/app/(app)/admin/settings/page.tsx");
has(page, /<PlatformSettingsConsole \/>/, "/admin/settings must render the console");
lacks(page, /function (BillingPolicyPanel|LanguageCatalogPanel|FxRateRow)\b/, "the panels live in src/components/admin/settings, not in a second copy on the page");
for (const panel of ["BillingPolicyPanel", "PricingEconomicsPanel", "LanguageCatalogPanel", "VoiceConsentSection", "RetentionPanel", "IntegrationsPanel"]) {
  has(consoleSource, new RegExp(`<${panel}\\b`), `the console must still render ${panel}`);
}
has(billingPanels, /<FxRateRow\b/, "pricing economics must still carry the FX rate row");

// ── 5. ⌘K ───────────────────────────────────────────────────────────────────────────────────
const palette = read("src/components/admin/admin-command-palette.tsx");
has(palette, /rankSettings\(query, settings\.data\?\.settings/, "the palette must search every platform setting");
has(palette, /href: settingHref\(setting\.key\)/, "a setting result must deep-link to its row");
has(palette, /canViewAdminPath\(staffAccess, "\/admin\/settings"\)/, "the settings source must respect settings.read");
const paletteLib = read("src/lib/admin/command-palette.ts");
for (const id of ["exportPlatformSettings", "importPlatformSettings", "changedPlatformSettings"]) {
  has(paletteLib, new RegExp(`id: "${id}"`), `palette action ${id} is missing`);
  has(permissions, new RegExp(`${id}: ADMIN_PERMISSIONS\\.`), `palette action ${id} needs a permission`);
}

// ── 6. i18n and the banner ──────────────────────────────────────────────────────────────────
const request = read("src/i18n/request.ts");
const flatten = (value, prefix = "") =>
  Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object" ? flatten(child, `${prefix}${key}.`) : [`${prefix}${key}`]);
for (const namespace of ["adminPlatformSettings", "platformStatus"]) {
  has(request, new RegExp(`"${namespace}"`), `the ${namespace} namespace must be loaded`);
  const [en, vi, ja] = ["en", "vi", "ja"].map((locale) => flatten(JSON.parse(read(`messages/${locale}/${namespace}.json`))).sort());
  assert.deepEqual(vi, en, `messages/vi/${namespace}.json must have exactly the English keys`);
  assert.deepEqual(ja, en, `messages/ja/${namespace}.json must have exactly the English keys`);
}
const en = JSON.parse(read("messages/en/adminPlatformSettings.json"));
for (const category of webCategories) {
  assert.equal(typeof en.categories?.[category]?.label, "string", `category ${category} needs a label`);
}
has(read("src/app/(app)/layout.tsx"), /<PlatformStatusBanner \/>/, "the app shell must show the maintenance banner");
has(read("src/app/(auth)/layout.tsx"), /<PlatformStatusBanner variant="public" \/>/, "the sign-in pages must show the maintenance banner");
has(read("src/lib/api/client.ts"), /reportMaintenance\(/, "a 503 MAINTENANCE must reach the banner");
for (const rel of ["src/components/auth/login-form.tsx", "src/app/(auth)/register/page.tsx"]) {
  has(read(rel), /googleOffered \?/, `${rel} must hide Google sign-in when the platform turns it off`);
}

console.log(
  `admin platform settings contract: ok (${webTypes.length} types, ${webCategories.length} categories${
    backendChecked ? ", matched against the backend" : "; backend not found, cross-check skipped"
  })`,
);
