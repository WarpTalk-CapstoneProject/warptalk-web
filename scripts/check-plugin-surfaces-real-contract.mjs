#!/usr/bin/env node
/**
 * Owner report, 2026-09-24 — the plugin surfaces must be real, distinct and drawn from one source.
 *
 *   1. Two settings rows were both called "Plugins": the member's own connections (PERSONAL) and the
 *      workspace's plugin list (WORKSPACE). They are "My connections" and "Workspace plugins" now,
 *      in every locale, and the two names must never collapse back into one.
 *   2. Icons: the seeded MCP apps drew as letter tiles, and /admin/plugins drew no icon at all.
 *      Every surface draws `PluginGlyph`, which reads `pluginIconSources` — one source.
 *   3. Manage shows which members connected a plugin, from the server's member endpoint.
 *   4. No web-side list of plugins: every list is read from the assistant service.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));

// 1. Two names, in every locale, and the sidebar uses them.
for (const locale of ["en", "vi", "ja"]) {
  const nav = json(`messages/${locale}/common.json`).sidebar.settingsNav;
  assert.ok(nav.myConnections && nav.workspacePlugins, `${locale}: settingsNav needs myConnections and workspacePlugins`);
  assert.notEqual(nav.myConnections, nav.workspacePlugins, `${locale}: the two plugin rows must not share a name`);
  const personal = json(`messages/${locale}/pluginsPage.json`).header.title;
  const workspace = json(`messages/${locale}/workspacePlugins.json`).header.title;
  assert.equal(personal, nav.myConnections, `${locale}: the personal page's title must match its sidebar row`);
  assert.equal(workspace, nav.workspacePlugins, `${locale}: the workspace page's title must match its sidebar row`);
}
const sidebar = read("src/components/layout/linear-sidebar.tsx");
assert.ok(!sidebar.includes('t("settingsNav.plugins")'), 'The sidebar must not label either plugin row "Plugins".');
assert.equal((sidebar.match(/settingsNav\.myConnections/g) ?? []).length, 2, "Both sidebars name the personal row My connections.");
assert.equal((sidebar.match(/settingsNav\.workspacePlugins/g) ?? []).length, 2, "Both sidebars name the workspace row Workspace plugins.");
const layout = read("src/app/(app)/layout.tsx");
assert.match(layout, /plugins: "workspacePlugins"/, "The workspace breadcrumb reads Workspace plugins.");
assert.match(layout, /sidebar\.settingsNav\.myConnections/, "The personal breadcrumb reads My connections.");

// 2. One icon source.
const glyph = read("src/components/assistant/plugin-glyph.tsx");
assert.match(glyph, /pluginIconSources\(plugin\)/, "PluginGlyph must pick its image through pluginIconSources.");
const adminList = read("src/app/(app)/admin/plugins/page.tsx");
assert.match(adminList, /<PluginGlyph plugin=\{row\}/, "/admin/plugins must draw each row's icon with PluginGlyph.");
const adminDetail = read("src/app/(app)/admin/plugins/[pluginKey]/page.tsx");
assert.match(adminDetail, /<PluginGlyph plugin=\{detail\}/, "The admin plugin page must draw the row's icon.");
const workspacePage = read("src/components/assistant/plugins/workspace-plugins-page.tsx");
assert.match(workspacePage, /pluginKey: request\.pluginKey/, "A request row's glyph must know the plugin key.");
for (const file of [
  "src/components/assistant/plugins/plugins-page.tsx",
  "src/components/assistant/plugins/workspace-plugins-page.tsx",
  "src/app/(app)/admin/plugins/page.tsx",
  "src/components/layout/global-chatbot.tsx",
]) {
  assert.doesNotMatch(read(file), /<img[^>]*avatarUrl/, `${file} draws a plugin icon itself; use PluginGlyph.`);
}

// 3. Manage lists who connected it.
assert.match(workspacePage, /useWorkspacePluginMembers\(/, "Manage must read the plugin's connected members.");
assert.match(workspacePage, /<PluginMembersSection /, "Manage must render the members section.");
const endpoints = read("src/lib/api/endpoints.ts");
assert.match(endpoints, /plugins\/\$\{encodeURIComponent\(pluginKey\)\}\/members`/, "The members endpoint must be declared.");
for (const locale of ["en", "vi", "ja"]) {
  const members = json(`messages/${locale}/workspacePlugins.json`).members;
  for (const key of ["title", "empty", "connectedAgo", "lastUsedAgo", "notUsedHereYet", "formerMember"]) {
    assert.ok(members?.[key], `${locale}: workspacePlugins.members.${key} is missing`);
  }
}

// 4. No hardcoded plugin list in the web: the brand-icon map is keyed by plugin key and lists no
//    labels or descriptions, and no plugin page declares a catalog of its own.
for (const file of [
  "src/components/assistant/plugins/plugins-page.tsx",
  "src/components/assistant/plugins/workspace-plugins-page.tsx",
  "src/app/(app)/admin/plugins/page.tsx",
  "src/hooks/use-workspace-plugins.ts",
  "src/lib/assistant/plugin-availability.ts",
]) {
  assert.doesNotMatch(
    read(file),
    /["'](Linear|Notion|Asana|Zapier|Canva|monday\.com|Google Drive)["']/,
    `${file} names a plugin; plugin lists come from the assistant service.`,
  );
}

console.log("Plugin surfaces contract passed.");
