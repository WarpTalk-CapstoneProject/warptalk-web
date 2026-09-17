import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [layout, overview, sidebar, appLayout, commonEn] = await Promise.all([
  source("src/app/(app)/admin/layout.tsx"),
  source("src/app/(app)/admin/page.tsx"),
  source("src/components/layout/linear-sidebar.tsx"),
  source("src/app/(app)/layout.tsx"),
  source("messages/en/common.json").then(JSON.parse),
]);

assert.match(layout, /useIsSystemAdmin/, "admin layout must enforce the system-admin gate");
assert.match(layout, /Access denied/, "admin layout must render a safe forbidden state");
assert.match(overview, /billingService\.getGlobalMetrics/, "overview must load real platform metrics");
// Redesigned 2026-08-17 to the hairline-sectioned reference: the recharts card components are
// gone from this page, but each data surface must still be drawn from its real endpoint.
assert.match(overview, /getGlobalUsageChart/, "overview must chart real monthly usage");
assert.match(overview, /getTopWorkspaces/, "overview must include top workspace activity");
assert.match(overview, /getGlobalUsageBreakdown/, "overview must show service adoption");
assert.match(overview, /getUsageAlerts/, "overview must surface the operations feed");
// i18n: these labels now render through t("adminNav.items.*") rather than as literal source
// text — see common.json for the English wording each assertion below still pins.
const adminNavItems = commonEn.sidebar?.adminNav?.items ?? {};
assert.match(sidebar, /label: t\("adminNav\.items\.overview"\)[\s\S]*href: "\/admin"/, "platform navigation must lead with Overview");
assert.match(sidebar, /label: t\("adminNav\.items\.overview"\)[\s\S]*href: "\/admin"[\s\S]*exact: true/, "Overview must not stay active on every nested admin route");
assert.equal(adminNavItems.overview, "Overview", "the Overview nav label must read Overview in English");
assert.match(sidebar, /label: t\("adminNav\.items\.workspaces"\)[\s\S]*href: "\/admin\/workspaces"/, "platform navigation must expose Workspaces");
assert.equal(adminNavItems.workspaces, "Workspaces", "the Workspaces nav label must read Workspaces in English");
assert.match(sidebar, /label: t\("adminNav\.items\.billingLedger"\)[\s\S]*href: "\/admin\/billing"/, "platform navigation must expose Billing");
assert.equal(adminNavItems.billingLedger, "Billing ledger", "the Billing nav label must read Billing ledger in English");
assert.match(appLayout, /isAdminRoute/, "platform routes must not require an active workspace");

console.log("Admin portal contract passed.");
