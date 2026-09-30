#!/usr/bin/env node
/**
 * The admin portal searches admin things; the workspace app still searches rooms.
 *
 * WHY THIS EXISTS
 *   The shell (`src/app/(app)/layout.tsx`) is shared by the workspace app and /admin. Its header
 *   box read "Search, or paste a room code" on both, and ⌘K opened the room palette on both — on a
 *   platform console that has no rooms to join. The owner asked for the admin box to search
 *   management keywords and pages instead, and for the workspace box to stay exactly as it is.
 *
 *   Both halves are easy to lose silently: a refactor of the header that renders `<HeaderSearch />`
 *   unconditionally again passes typecheck, lint and the build. And mounting BOTH palettes on
 *   /admin would register two ⌘K handlers on the same keypress (the header-search.tsx comment
 *   records that this already happened once).
 *
 * WHAT IT PINS
 *   1. On admin routes the shell renders the admin trigger and the admin palette, and never the
 *      room-code trigger or the room palette; elsewhere, the reverse.
 *   2. The admin palette does not reach for room codes at all.
 *   3. Every admin nav destination is a palette page, so a new page cannot be left unfindable.
 *   4. Every palette label key exists in en, vi and ja.
 *   5. The workspace room-code search is unchanged.
 *   6. The list toolkit exports what other admin pages (the CMS) adopt.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));

const layout = read("src/app/(app)/layout.tsx");
const palette = read("src/components/admin/admin-command-palette.tsx");
const registry = read("src/lib/admin/command-palette.ts");
const sidebar = read("src/components/layout/linear-sidebar.tsx");
const headerSearch = read("src/components/layout/header-search.tsx");
const toolkitIndex = read("src/components/admin/list/index.ts");

// ── 1 · one palette per shell ────────────────────────────────────────────────
assert.match(
  layout,
  /\{isAdminRoute \? <AdminHeaderSearch \/> : <HeaderSearch \/>\}/,
  "the header must render the admin trigger on /admin and the room-code trigger elsewhere",
);
assert.match(
  layout,
  /\{isAdminRoute \? <AdminCommandPalette \/> : <SearchMeetingDialog \/>\}/,
  "the shell must mount the admin palette on /admin and the room palette elsewhere — never both",
);
assert.equal(
  (layout.match(/<HeaderSearch \/>/g) ?? []).length,
  1,
  "<HeaderSearch /> must appear once, inside the isAdminRoute ternary — an unconditional copy would show the room-code box on /admin",
);
assert.equal(
  (layout.match(/<SearchMeetingDialog \/>/g) ?? []).length,
  1,
  "<SearchMeetingDialog /> must appear once, inside the isAdminRoute ternary — a second copy is a second ⌘K handler",
);
assert.match(
  layout,
  /const isAdminRoute = pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\);/,
  "isAdminRoute must still cover /admin and everything beneath it",
);

// ── 2 · no room codes in the admin palette ───────────────────────────────────
for (const [name, source] of [
  ["admin-command-palette.tsx", palette],
  ["lib/admin/command-palette.ts", registry],
]) {
  assert.doesNotMatch(source, /looksLikeRoomCode|room-code-guess|SearchMeetingDialog|useTranslationRooms/, `${name} must not search rooms`);
}
for (const locale of ["en", "vi", "ja"]) {
  const lists = json(`messages/${locale}/adminLists.json`);
  const trigger = `${lists.palette.triggerLabel} ${lists.palette.placeholder}`.toLowerCase();
  assert.doesNotMatch(trigger, /room code|mã phòng|ルームコード/, `${locale}: the admin search box must not offer room codes`);
}

// ── 3 · every admin page is reachable from the palette ───────────────────────
const adminBranch = sidebar.match(/if \(isAdminPage && isSystemAdmin\) \{([\s\S]*?)\n  if \(isSettingsPage/)?.[1] ?? "";
assert.ok(adminBranch.length > 200, "could not locate the admin nav branch in linear-sidebar.tsx");
const navHrefs = [...new Set([...adminBranch.matchAll(/href: "(\/admin[^"]*)"/g)].map((m) => m[1]))];
assert.ok(navHrefs.length >= 10, `expected the admin nav to list its pages, found ${navHrefs.length}`);
const pagesBlock = registry.match(/export const ADMIN_PALETTE_PAGES[\s\S]*?\n\];/)?.[0] ?? "";
const paletteHrefs = [...pagesBlock.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
for (const href of navHrefs) {
  assert.ok(paletteHrefs.includes(href), `admin nav page ${href} is missing from ADMIN_PALETTE_PAGES`);
}

// ── 4 · every label key is translated ────────────────────────────────────────
const pageKeys = [...pagesBlock.matchAll(/labelKey: "([^"]+)"/g)].map((m) => m[1]);
const actionsBlock = registry.match(/export const ADMIN_PALETTE_ACTIONS[\s\S]*?\n\];/)?.[0] ?? "";
const actionKeys = [...actionsBlock.matchAll(/labelKey: "([^"]+)"/g)].map((m) => m[1]);
assert.ok(actionKeys.length >= 3, "the palette must offer quick actions");
for (const required of ["adjustCredit", "createPlan", "composeAnnouncement"]) {
  assert.ok(actionKeys.includes(required), `quick action ${required} is missing`);
}
for (const locale of ["en", "vi", "ja"]) {
  const common = json(`messages/${locale}/common.json`);
  const lists = json(`messages/${locale}/adminLists.json`);
  for (const key of pageKeys) {
    assert.equal(typeof common.sidebar.adminNav.items[key], "string", `${locale}: common.sidebar.adminNav.items.${key}`);
  }
  for (const key of actionKeys) {
    assert.equal(typeof lists.palette.actions[key], "string", `${locale}: adminLists.palette.actions.${key}`);
  }
}

// ── 5 · the workspace app keeps its room-code search ─────────────────────────
assert.match(headerSearch, /t\("searchPlaceholder"\)/, "the workspace header search must keep its placeholder");
assert.match(
  json("messages/en/common.json").topbar.searchPlaceholder,
  /room code/i,
  "the workspace search box still offers room codes",
);

// ── 6 · the toolkit is importable by other admin pages ───────────────────────
for (const name of ["useAdminListState", "AdminListToolbar", "AdminDataTable", "useAdminActionIntent", "filterDefsFromFields"]) {
  assert.match(toolkitIndex, new RegExp(`\\b${name}\\b`), `the admin list toolkit must export ${name}`);
}

console.log("admin command palette contract: ok");
