// The platform admin console: its own chrome, its own ground, and no nav row pointing at a 404.
//
// Three defects this guards, all of which shipped together:
//
//  1. LinearSidebar had exactly two branches — Settings, and everything else. /admin fell into
//     "everything else" and inherited the app's nav wholesale: Home, Meetings, Schedules,
//     History, Voice Profiles, Members, Documents, every one of them scoped to whichever
//     workspace the admin happened to have open. A platform administrator is not standing inside
//     a workspace, and a switcher there invites acting on one tenant while reading about all.
//
//  2. AdminPage painted `bg-canvas`. Its own file comment says it exists to match the workspace
//     pages — and `WorkspacePage`, the frame those pages use, paints `bg-surface-1`. `canvas` is
//     the darker ground the app reserves for the chrome AROUND a page, so the entire admin portal
//     rendered its content in the sidebar's colour and read as permanently greyed out.
//
//  3. The nav is going to grow one row per release as Users, Subscriptions, Plans, Meetings,
//     Health, Audit and Announcements land. A row added before its page exists is a link to a
//     404 — the same defect as a button whose endpoint was never routed (WT-425), which this
//     codebase has now shipped several times. So the hrefs are checked against the filesystem.
//
// Source-level rather than a render test, because all three are wiring: types check and every
// unit test passes with the sidebar branch deleted and the ground back to grey.

import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(root, rel), "utf8");

const ADMIN_ROOT = "src/app/(app)/admin";

const sidebar = await read("src/components/layout/linear-sidebar.tsx");
const chrome = await read("src/components/admin/admin-page-chrome.tsx");

const checks = [];

// ── 1 · The admin branch exists and is gated ─────────────────────────────────
checks.push([
  "the sidebar recognises /admin as its own surface",
  /const isAdminPage =[\s\S]{0,160}?pathname\.startsWith\("\/admin\/"\)/.test(sidebar),
]);
checks.push([
  "/admin gets its own sidebar rather than the workspace nav",
  /if \(isAdminPage && isSystemAdmin\) \{/.test(sidebar),
]);
checks.push([
  // Without this the admin nav would render beside AdminLayout's "Access denied" panel,
  // advertising a console the reader cannot open.
  "the admin sidebar is withheld from everyone who is not a platform admin",
  sidebar.includes("isAdminPage && isSystemAdmin"),
]);
checks.push([
  "the admin sidebar has no workspace switcher",
  !/isAdminPage && isSystemAdmin[\s\S]{0,6000}?handleSelectWorkspace/.test(sidebar),
]);
checks.push([
  // NavLink treats a non-exact item as active for anything beneath its href, and every admin
  // page is beneath /admin — so Overview would stay lit on every other admin screen.
  "the Overview row matches /admin exactly",
  /label: "Overview", href: "\/admin", exact: true/.test(sidebar),
]);
checks.push([
  "the admin sidebar offers a way back to the app",
  /isAdminPage && isSystemAdmin[\s\S]{0,4000}?Back to app/.test(sidebar),
]);

// ── 2 · The ground is the page ground, not the chrome ground ─────────────────
checks.push([
  "AdminPage paints the same ground as WorkspacePage",
  /export function AdminPage\(\{[\s\S]{0,400}?bg-surface-1/.test(chrome),
]);
checks.push([
  "AdminPage does not paint the chrome's grey",
  !/export function AdminPage\(\{[\s\S]{0,400}?bg-canvas/.test(chrome),
]);

const workspacePageChrome = await read("src/components/workspace/page-chrome.tsx");
checks.push([
  // If WorkspacePage ever moves off surface-1, this pair stops agreeing and someone has to
  // decide again rather than discovering the drift on screen.
  "WorkspacePage still uses the ground AdminPage is matching",
  /export function WorkspacePage\(\{[\s\S]{0,400}?bg-surface-1/.test(workspacePageChrome),
]);

// ── 3 · No admin page repaints the grey itself ───────────────────────────────
async function pageFiles(dir) {
  const found = [];
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await pageFiles(rel)));
    else if (entry.name === "page.tsx" || entry.name === "layout.tsx") found.push(rel);
  }
  return found;
}

const adminPages = await pageFiles(ADMIN_ROOT);
checks.push([`${ADMIN_ROOT} has pages to check`, adminPages.length >= 4]);

/**
 * The source with comments blanked out and every line number preserved.
 *
 * Stripped over the WHOLE file rather than line by line, because the comment that first tripped
 * this check was a multi-line `{/* … *\/}` block: a per-line regex only ever sees its opening
 * line and leaves the rest of the prose intact.
 *
 * Written at all because the first run failed on a comment EXPLAINING why the ground is no
 * longer `bg-canvas`. A contract that forbids naming the thing it forbids cannot be documented,
 * and the only way to satisfy it would have been to delete the explanation.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => " ".repeat(line.length));
}

for (const rel of adminPages) {
  const source = await read(rel);
  const code = stripComments(source).split("\n");
  // Name the line, not just the file. A contract that reports "this file is wrong" sends the
  // reader hunting through 350 lines for a class name.
  const offenders = source
    .split("\n")
    .map((line, index) => (code[index]?.includes("bg-canvas") ? `${index + 1}: ${line.trim()}` : null))
    .filter(Boolean);
  checks.push([
    offenders.length
      ? `${rel.replace(`${ADMIN_ROOT}/`, "")} does not paint bg-canvas — found at ${offenders.join(" | ")}`
      : `${rel.replace(`${ADMIN_ROOT}/`, "")} does not paint bg-canvas`,
    offenders.length === 0,
  ]);
}

// ── 4 · Every admin nav row points at a page that exists ─────────────────────
//
// The guard that earns this file's keep as the console grows. Each release adds its nav row with
// the page, not before it.
const adminBranch = sidebar.match(/if \(isAdminPage && isSystemAdmin\) \{([\s\S]*?)\n  if \(isSettingsPage/)?.[1] ?? "";
checks.push(["the admin branch was located for href extraction", adminBranch.length > 200]);

const hrefs = [...adminBranch.matchAll(/href: "(\/admin[^"]*)"/g)].map((m) => m[1]);
checks.push(["the admin nav has rows", hrefs.length >= 4]);

for (const href of hrefs) {
  // /admin -> src/app/(app)/admin/page.tsx ; /admin/workspaces -> .../workspaces/page.tsx
  const segment = href.replace(/^\/admin\/?/, "");
  const rel = segment
    ? `${ADMIN_ROOT}/${segment}/page.tsx`
    : `${ADMIN_ROOT}/page.tsx`;
  let exists = true;
  try {
    await stat(path.join(root, rel));
  } catch {
    exists = false;
  }
  checks.push([`nav row ${href} has a page at ${rel}`, exists]);
}

// Conversely: a page that exists but is unreachable from the nav is a page nobody can find.
// Nested detail routes are exempt — they are reached from their own list.
const NAV_EXEMPT = new Set([`${ADMIN_ROOT}/layout.tsx`, `${ADMIN_ROOT}/workspaces/[workspaceRef]/page.tsx`]);
for (const rel of adminPages) {
  if (NAV_EXEMPT.has(rel)) continue;
  const segment = rel.slice(ADMIN_ROOT.length + 1).replace(/\/?page\.tsx$/, "");
  const href = segment ? `/admin/${segment}` : "/admin";
  checks.push([`page ${href} is reachable from the admin nav`, hrefs.includes(href)]);
}

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

const failures = checks.filter(([, passed]) => !passed);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exitCode = 1;
}
