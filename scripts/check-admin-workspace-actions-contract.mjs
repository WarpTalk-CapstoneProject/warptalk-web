#!/usr/bin/env node
/**
 * The admin workspace page (ERP-style detail) acts on the workspace, and every action is wired end
 * to end: a menu entry or row button opens a dialog, the dialog takes a reason and confirms in a
 * second step, the hook calls a service method, and the service calls an /admin endpoint that
 * exists in endpoints.ts.
 *
 * Why a static contract: admin buttons that 404 are this portal's recurring failure — Adjust Credit
 * posted to a route that did not exist for weeks, and mark-paid worked for months with nothing
 * calling it. Three separate edits (button, service, route) and nothing compared them. This does.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [page, dialogs, dialog, service, hooks, endpoints, billingService, timeline, en] = await Promise.all([
  read("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx"),
  read("src/components/admin/workspace-detail/workspace-action-dialogs.tsx"),
  read("src/components/admin/workspace-detail/admin-action-dialog.tsx"),
  read("src/services/admin-workspace-actions.service.ts"),
  read("src/hooks/use-admin-workspace-actions.ts"),
  read("src/lib/api/endpoints.ts"),
  read("src/services/billing.service.ts"),
  read("src/components/admin/workspace-detail/workspace-timeline.tsx"),
  read("messages/en/adminWorkspaces.json").then(JSON.parse),
]);

// ── every action has a door on the page ─────────────────────────────────────────────────────
for (const id of [
  "adjustCredits",
  "changePlan",
  "extendTrial",
  "compPeriod",
  "entitlements",
  "transferOwnership",
  "signOutAll",
  "signOutMember",
  "sendNotice",
  "exportSummary",
  "addNote",
]) {
  assert.match(page, new RegExp(`id: "${id}"`), `the page must open the ${id} action`);
  assert.match(dialogs, new RegExp(`case "${id}":`), `WorkspaceActionDialogs must render ${id}`);
}
assert.match(page, /<WorkspaceActionDialogs/, "the page must mount the action dialogs");
for (const lifecycle of ["suspend", "reactivate", "delete"]) {
  assert.match(page, new RegExp(`openLifecycle\\("${lifecycle}"\\)`), `${lifecycle} must stay on the page`);
}
assert.match(page, /<WorkspaceTimeline workspaceId=\{workspace\.id\}/, "the audit tab must show the timeline");

// ── every dialog goes through the reason + confirm shape ────────────────────────────────────
const dialogCount = (dialogs.match(/<AdminActionDialog\b/g) ?? []).length;
assert.equal(dialogCount, 10, "each of the ten dialogs must be an AdminActionDialog");
assert.match(dialog, /validateReason\(reason\)/, "the dialog must require a reason");
assert.match(dialog, /setStep\("confirm"\)/, "the dialog must confirm in a second step");
assert.match(dialog, /step === "edit"/);
// Only the note is its own reason.
assert.equal((dialogs.match(/\bhideReason\b/g) ?? []).length, 1, "only the note may skip the reason");

// ── hooks → service → endpoint ──────────────────────────────────────────────────────────────
const wiring = [
  ["adjustCredits", "adminWorkspaceBilling.adjustCredits", "credits/adjust"],
  ["changePlan", "adminWorkspaceBilling.changePlan", "subscription/change-plan"],
  ["extendTrial", "adminWorkspaceBilling.extendTrial", "subscription/extend-trial"],
  ["compPeriod", "adminWorkspaceBilling.comp", "subscription/comp"],
  ["setEntitlementOverrides", "adminWorkspaceBilling.entitlements", "subscription/entitlements"],
  ["transferOwnership", "adminWorkspaces.transferOwnership", "transfer-ownership"],
  ["signOut", "adminUsers.workspaceSignOut", "revoke-sessions"],
  ["sendNotice", "adminWorkspaces.notices", "notices"],
  ["addNote", "adminWorkspaces.notes", "notes"],
  ["exportSummary", "adminWorkspaces.export", "export"],
];
for (const [method, endpoint, route] of wiring) {
  assert.match(service, new RegExp(`${method}: async[\\s\\S]*?API\\.${endpoint.replace(".", "\\.")}\\(`), `${method} must call API.${endpoint}`);
  assert.ok(endpoints.includes(route), `endpoints.ts must declare the ${route} route`);
  assert.match(hooks, new RegExp(`service\\.${method}\\(`), `a hook must call service.${method}`);
}
assert.match(endpoints, /overview: \(id: string\) => `\/admin\/billing\/workspaces\/\$\{id\}\/overview`/);
assert.match(endpoints, /workspaceSignOut: \(workspaceId: string\) => `\/admin\/users\/workspaces\/\$\{workspaceId\}\/revoke-sessions`/);

// The global Adjust Credits modal goes through the same audited route; the old one is gone.
assert.match(billingService, /API\.adminWorkspaceBilling\.adjustCredits\(workspaceId\)/);
assert.doesNotMatch(billingService, /credits\/workspace\/\$\{workspaceId\}\/adjust/, "the unaudited adjust route is gone");

// ── the timeline names every verb the actions write ─────────────────────────────────────────
assert.match(timeline, /timelineActionKey\(entry\.action\)/);
for (const key of [
  "creditAdjusted",
  "planChanged",
  "trialExtended",
  "periodComped",
  "entitlementsOverridden",
  "invoiceMarkedPaid",
  "ownershipTransferred",
  "noticeSent",
  "noteAdded",
  "dataExported",
  "sessionsRevoked",
]) {
  assert.ok(en.timeline?.actions?.[key], `messages/en/adminWorkspaces.json needs timeline.actions.${key}`);
}
assert.equal(en.detail?.tabs?.audit, "Timeline");

console.log("Admin workspace actions contract passed.");
