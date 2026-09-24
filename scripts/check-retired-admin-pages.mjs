/**
 * Admin portal pages taken out on the owner's call (2026-09-24), and the chrome that replaced the
 * console's old name.
 *
 * - "Meetings" (/admin/meetings, the platform meeting directory) and "Event outbox"
 *   (/admin/outbox) are gone from the sidebar and their pages are deleted. Both addresses forward to
 *   /admin in proxy.ts. Insights still shows live meetings and the dead-letter count — it reads the
 *   counts endpoints, which stay — but no longer links to either page.
 * - Only the web pages went. The backend endpoints are untouched, so nothing here may claim the
 *   counts are gone.
 * - The sidebar header names the product (WarpTalk mark, "WarpTalk", an "ERP" chip) instead of
 *   "Platform console" / "WarpTalk Platform" with a shield.
 *
 * A retired page that is still linked from somewhere is a dead link; one that is deleted with no
 * forward is a 404 for every bookmark. This pins both halves, like check-retired-workspace-pages.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./lib/strip-comments.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const segment of ["meetings", "outbox"]) {
  assert.ok(
    !fs.existsSync(path.join(root, `src/app/(app)/admin/${segment}`)),
    `the /admin/${segment} route stays deleted`,
  );
}

const sidebar = read("src/components/layout/linear-sidebar.tsx");
assert.ok(!sidebar.includes('"/admin/meetings"'), "the admin sidebar must not link to /admin/meetings");
assert.ok(!sidebar.includes('"/admin/outbox"'), "the admin sidebar must not link to /admin/outbox");

// Nothing else in the app may still route there (the endpoints under /api are a different thing:
// `/admin/meetings/counts` and `/admin/meetings/insights` are API paths, not pages).
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(tsx?|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
for (const file of walk(path.join(root, "src"))) {
  const rel = path.relative(root, file);
  if (rel === path.join("src", "proxy.ts") || rel === path.join("src", "lib", "api", "endpoints.ts")) continue;
  const source = stripComments(fs.readFileSync(file, "utf8"));
  assert.ok(
    !/["'`]\/admin\/(meetings|outbox)(?:[?"'`]|\/?["'`])/.test(source),
    `${rel} still links to a retired admin page`,
  );
}

const proxy = read("src/proxy.ts");
assert.ok(
  proxy.includes("/^\\/admin\\/(?:meetings|outbox)(?:\\/.*)?$/.test(pathname)"),
  "/admin/meetings and /admin/outbox must forward in proxy.ts",
);
assert.ok(proxy.includes('new URL("/admin", request.url)'), "…to Insights");

// Insights keeps both figures, from the endpoints that remain.
const insights = read("src/app/(app)/admin/page.tsx");
assert.match(insights, /useAdminMeetingCounts\(/, "Insights still shows live meetings");
assert.match(insights, /useAdminOutboxDeadLetters\(/, "Insights still counts dead letters");
const endpoints = read("src/lib/api/endpoints.ts");
assert.ok(endpoints.includes('counts: "/admin/meetings/counts"'), "the meeting counts endpoint stays");
assert.ok(endpoints.includes('deadLetters: "/workspaces/outbox/dead-letters"'), "the dead-letter endpoint stays");

// The console's header: the product mark and name with an ERP chip, not the old shield row.
const adminBranch = sidebar.match(/if \(isAdminPage && isSystemAdmin\) \{([\s\S]*?)\n  if \(isSettingsPage/)?.[1] ?? "";
assert.ok(adminBranch.length > 200, "the admin branch of the sidebar was located");
assert.ok(adminBranch.includes("<WarpTalkBrand"), "the admin header shows the WarpTalk mark");
assert.ok(adminBranch.includes('t("adminNav.productName")'), "…and the product name");
assert.ok(adminBranch.includes('t("adminNav.erpBadge")'), "…and the ERP chip");
assert.ok(!adminBranch.includes("ShieldCheck"), "the shield row is gone");
assert.ok(!adminBranch.includes("platformConsole") && !adminBranch.includes("platformName"), "the old labels are gone");

for (const locale of ["en", "vi", "ja"]) {
  const nav = JSON.parse(read(`messages/${locale}/common.json`)).sidebar.adminNav;
  assert.equal(nav.productName, "WarpTalk", `${locale}: the product name is not translated`);
  assert.equal(nav.erpBadge, "ERP", `${locale}: the chip reads ERP`);
  assert.ok(!("meetings" in nav.items) && !("eventOutbox" in nav.items), `${locale}: retired nav labels are gone`);
}

// Dark mode: the mark is a black-on-white PNG; without the inversion it vanishes on a dark sidebar.
const brand = read("src/components/layout/warptalk-brand.tsx");
assert.ok(brand.includes("dark:invert") && brand.includes("dark:mix-blend-screen"), "the WarpTalk mark reads in dark mode");

console.log("Retired admin pages contract: PASS");
