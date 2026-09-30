#!/usr/bin/env node
/**
 * G10 — the admin portal renders from staff permissions, and nothing admin-shaped slips past them.
 *
 * The SERVER is the authority: every admin endpoint requires exactly one permission and the
 * backend's own coverage test fails when one does not. What this holds the web to is the other
 * half — that the portal never OFFERS something without having decided who may see it:
 *
 *   1. Every page under src/app/(app)/admin has a route permission (a page added without one is
 *      shown to Super Admins only, which is safe but never what its author meant).
 *   2. Every admin sidebar row and palette page is filtered through that map, and every palette
 *      action has its own permission.
 *   3. The layout gates on live staff access, not only on the token's "admin" hint.
 *   4. /admin/staff and /admin/roles use the list toolkit; the staff directory filters on the
 *      server, and the service calls every staff endpoint the backend serves.
 *   5. The adminStaff namespace exists in en, vi and ja with the same keys.
 *   6. When the backend checkout sits beside this one (or BACKEND_ROOT points at it), the web's
 *      permission codes equal the backend's AdminPermissions catalog.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const permissionsSource = read("src/lib/admin/staff-permissions.ts");
const routeHrefs = [...permissionsSource.matchAll(/\{ href: "([^"]+)", permission: /g)].map((m) => m[1]);
const webCodes = [...permissionsSource.slice(
  permissionsSource.indexOf("export const ADMIN_PERMISSIONS"),
  permissionsSource.indexOf("} as const;"),
).matchAll(/: "([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]);
const actionPermissionIds = [...permissionsSource.slice(
  permissionsSource.indexOf("export const ADMIN_PALETTE_ACTION_PERMISSIONS"),
).matchAll(/^\s{2}(\w+): ADMIN_PERMISSIONS\./gm)].map((m) => m[1]);

// ── 1. Every admin page has a route permission ─────────────────────────────────────────────
const adminDir = path.join(root, "src/app/(app)/admin");
const pages = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "page.tsx") pages.push(full);
  }
})(adminDir);
const firstSegment = (file) => {
  const rel = path.relative(adminDir, path.dirname(file)).split(path.sep).filter(Boolean);
  return rel.length === 0 ? "/admin" : `/admin/${rel[0]}`;
};
for (const page of pages) {
  const href = firstSegment(page);
  assert.ok(
    routeHrefs.includes(href),
    `${path.relative(root, page)} has no entry in ADMIN_ROUTE_PERMISSIONS (${href}); decide which permission may see it`,
  );
}

// ── 2. Sidebar and palette are filtered through the map ─────────────────────────────────────
const sidebar = read("src/components/layout/linear-sidebar.tsx");
const adminBlock = sidebar.slice(sidebar.indexOf("allAdminSections"), sidebar.indexOf("const adminSections ="));
for (const [, href] of adminBlock.matchAll(/href: "(\/admin[^"]*)"/g)) {
  assert.ok(routeHrefs.includes(href), `sidebar row ${href} has no route permission`);
}
assert.match(sidebar, /canViewAdminPath\(staffAccess, item\.href\)/, "the admin sidebar must filter its rows by staff permission");
assert.match(adminBlock, /href: "\/admin\/staff"/, "the sidebar must offer Staff");
assert.match(adminBlock, /href: "\/admin\/roles"/, "the sidebar must offer Roles");

const paletteLib = read("src/lib/admin/command-palette.ts");
const actionsBlock = paletteLib.slice(paletteLib.indexOf("export const ADMIN_PALETTE_ACTIONS"));
const actionIds = [...actionsBlock.slice(0, actionsBlock.indexOf("];")).matchAll(/id: "(\w+)"/g)].map((m) => m[1]);
for (const id of actionIds) {
  assert.ok(actionPermissionIds.includes(id), `palette action ${id} has no entry in ADMIN_PALETTE_ACTION_PERMISSIONS`);
}
const pagesBlock = paletteLib.slice(paletteLib.indexOf("export const ADMIN_PALETTE_PAGES"), paletteLib.indexOf("export const ADMIN_PALETTE_ACTIONS"));
for (const [, href] of pagesBlock.matchAll(/href: "(\/admin[^"?]*)/g)) {
  assert.ok(routeHrefs.includes(href), `palette page ${href} has no route permission`);
}
const palette = read("src/components/admin/admin-command-palette.tsx");
assert.match(palette, /canUsePaletteEntry\(staffAccess, entry\)/, "the palette must filter pages and actions by staff permission");

// ── 3. The layout gates on live access ──────────────────────────────────────────────────────
const layout = read("src/app/(app)/admin/layout.tsx");
assert.match(layout, /useStaffAccess\(\)/, "the admin layout must read live staff access");
assert.match(layout, /canViewAdminPath\(access, pathname\)/, "the admin layout must refuse pages outside the person's role");

// ── 4. Staff and roles pages ────────────────────────────────────────────────────────────────
const staffPage = read("src/app/(app)/admin/staff/page.tsx");
const rolesPage = read("src/app/(app)/admin/roles/page.tsx");
for (const [name, source] of [["staff", staffPage], ["roles", rolesPage]]) {
  assert.match(source, /useAdminListState\(/, `/admin/${name} must keep its view in the URL with the list toolkit`);
  assert.match(source, /<AdminListToolbar\b/, `/admin/${name} must render the shared toolbar`);
}
assert.doesNotMatch(staffPage, /applyClientListState\(/, "the staff directory is filtered by the auth service, not in the browser");
assert.match(staffPage, /\/admin\/audit\?actor=/, "each staff member must link to their activity in the audit log");
assert.match(staffPage, /StaffReasonDialog/, "destructive staff actions must be confirmed with a reason");
assert.match(rolesPage, /PermissionHoldersDialog/, "the roles page must answer who holds a permission");

const endpoints = read("src/lib/api/endpoints.ts");
const staffEndpoints = endpoints.slice(endpoints.indexOf("adminStaff: {"), endpoints.indexOf("adminUsers: {"));
const endpointKeys = [...staffEndpoints.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
const service = read("src/services/admin-staff.service.ts");
for (const key of endpointKeys) {
  assert.match(service, new RegExp(`API\\.adminStaff\\.${key}\\b`), `admin-staff.service must call API.adminStaff.${key}`);
}

// ── 5. i18n ─────────────────────────────────────────────────────────────────────────────────
assert.match(read("src/i18n/request.ts"), /"adminStaff"/, "the adminStaff namespace must be loaded");
const flatten = (value, prefix = "") =>
  Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object" ? flatten(child, `${prefix}${key}.`) : [`${prefix}${key}`]);
const [en, vi, ja] = ["en", "vi", "ja"].map((locale) => flatten(JSON.parse(read(`messages/${locale}/adminStaff.json`))).sort());
assert.deepEqual(vi, en, "messages/vi/adminStaff.json must have exactly the English keys");
assert.deepEqual(ja, en, "messages/ja/adminStaff.json must have exactly the English keys");

// ── 6. Same catalog as the backend, when it is here to compare ──────────────────────────────
const backendRoot = process.env.BACKEND_ROOT ?? path.resolve(root, "..", "warptalk-backend");
const backendCatalog = path.join(backendRoot, "shared/WarpTalk.Shared/Authorization/AdminPermissions.cs");
if (existsSync(backendCatalog)) {
  const cs = readFileSync(backendCatalog, "utf8");
  const backendCodes = [...cs.matchAll(/public const string \w+ = "([a-z_]+\.[a-z_]+)";/g)].map((m) => m[1]);
  assert.deepEqual([...webCodes].sort(), [...backendCodes].sort(), "web and backend permission catalogs differ");
  console.log(`admin staff RBAC contract: ok (${webCodes.length} codes match the backend)`);
} else {
  console.log(`admin staff RBAC contract: ok (${webCodes.length} codes; backend catalog not found, cross-check skipped)`);
}
