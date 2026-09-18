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
// Redesigned 2026-09-17 into Insights (the OpenBoox ERP business-insights shape). The page is a
// view over real endpoints — every data surface must still be drawn from one, and the ones that
// predate Insights must not be dropped on the way.
const [dashboard, insightsHooks] = await Promise.all([
  source("src/components/admin/insights/insights-dashboard.tsx"),
  source("src/hooks/use-admin-insights.ts"),
]);
for (const hook of [
  "useAdminBillingInsights",
  "useAdminBillingSnapshot",
  "useAdminUsersInsights",
  "useAdminWorkspacesInsights",
  "useAdminMeetingsInsights",
]) {
  assert.match(overview, new RegExp(`\\b${hook}\\(`), `insights must load ${hook}`);
  assert.match(insightsHooks, new RegExp(`export function ${hook}\\(`), `${hook} must exist`);
}
assert.match(overview, /useAdminMeetingCounts\(/, "insights must show live meeting counts");
assert.match(overview, /useAdminOutboxDeadLetters\(/, "insights must count dead-lettered events");
assert.match(overview, /useAdminSalesLeads\(/, "insights must count new sales leads");
assert.match(overview, /useAdminPlatformHealth\(/, "insights must read System Health");
// The old Overview's two operator signals, folded into Needs attention.
assert.match(overview, /useAdminWorkspaceDirectory\([\s\S]{0,80}status: "suspended"/, "insights must keep the suspended-workspaces signal");
assert.match(overview, /getUsageAlerts/, "insights must keep the usage alerts when the snapshot is unavailable");
assert.match(dashboard, /assembleNeedsAttention\(/, "insights must assemble Needs attention");
// A source that errors must degrade to "not available", not take the page down.
assert.match(overview, /isError \? \{ status: "unavailable" \}/, "an errored source must render as unavailable");
assert.match(dashboard, /NOT_AVAILABLE_NOTE/, "unavailable sources must say so");
assert.match(sidebar, /label: "Insights"[\s\S]*href: "\/admin"/, "platform navigation must lead with Insights");
assert.match(sidebar, /label: "Insights"[\s\S]*href: "\/admin"[\s\S]*exact: true/, "Insights must not stay active on every nested admin route");
assert.match(sidebar, /label: "Workspaces"[\s\S]*href: "\/admin\/workspaces"/, "platform navigation must expose Workspaces");
assert.match(sidebar, /label: "Billing"[\s\S]*href: "\/admin\/billing"/, "platform navigation must expose Billing");
assert.match(appLayout, /isAdminRoute/, "platform routes must not require an active workspace");

console.log("Admin portal contract passed.");
