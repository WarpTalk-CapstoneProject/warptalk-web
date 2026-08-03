import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [layout, overview, sidebar, appLayout] = await Promise.all([
  source("src/app/(app)/admin/layout.tsx"),
  source("src/app/(app)/admin/page.tsx"),
  source("src/components/layout/linear-sidebar.tsx"),
  source("src/app/(app)/layout.tsx"),
]);

assert.match(layout, /useIsSystemAdmin/, "admin layout must enforce the system-admin gate");
assert.match(layout, /Access denied/, "admin layout must render a safe forbidden state");
assert.match(overview, /billingService\.getGlobalMetrics/, "overview must load real platform metrics");
assert.match(overview, /<UsageChart/, "overview must include the approved usage chart");
assert.match(overview, /<TopWorkspacesChart/, "overview must include top workspace activity");
assert.match(overview, /<FeatureBreakdownChart/, "overview must show service adoption");
assert.match(sidebar, /label: "Overview"[\s\S]*href: "\/admin"/, "platform navigation must lead with Overview");
assert.match(sidebar, /label: "Overview"[\s\S]*href: "\/admin"[\s\S]*exact: true/, "Overview must not stay active on every nested admin route");
assert.match(sidebar, /label: "Workspaces"[\s\S]*href: "\/admin\/workspaces"/, "platform navigation must expose Workspaces");
assert.match(sidebar, /label: "Billing"[\s\S]*href: "\/admin\/billing"/, "platform navigation must expose Billing");
assert.match(appLayout, /isAdminRoute/, "platform routes must not require an active workspace");

console.log("Admin portal contract passed.");
