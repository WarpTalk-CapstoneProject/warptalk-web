#!/usr/bin/env node
/**
 * Guard: platform admins can switch each marketplace plugin on or off per workspace, and every
 * surface that shows a plugin respects it (owner request 2026-09-25: "cần bật tắt hiển thị ở các
 * workspace").
 *
 * WHAT MUST HOLD
 *   1. The five admin routes exist in API.adminPluginWorkspaceAccess and the service calls each with
 *      the verb the assistant service serves it on.
 *   2. The plugin detail page has a Workspaces tab and the admin workspace page a Plugins tab, both
 *      wired to their components — a component nobody renders is the "fix that was never wired".
 *   3. Every write goes through PluginOverrideDialog, which asks for the reason the audit log keeps,
 *      and disabling without one is refused before the request is sent.
 *   4. A plugin the platform turned off is not offered in WarpBot chat, is typed as its own
 *      availability, and is shown (not silently dropped) on the Owner's page with no Add button.
 *   5. "Workspaces using it" renders a missing count as unknown, never as "no workspaces".
 *   6. The copy exists in en, vi and ja with the same keys.
 *   7. Optionally (BACKEND_ROOT set, or a sibling ../warptalk-backend): the server's row DTO carries
 *      every field the web type reads.
 *
 * Source scan, in the style of the other contracts in scripts/.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
/** Comments explain the rules; only code should be searched for breaches of them. */
const code = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const failures = [];
const require_ = (condition, message) => {
  if (!condition) failures.push(message);
};

// 1. Routes and verbs ------------------------------------------------------------------------------
const endpoints = code(read("src/lib/api/endpoints.ts"));
const block = endpoints.match(/adminPluginWorkspaceAccess:\s*\{([\s\S]*?)\n\s{2}\},/)?.[1] ?? "";
require_(block.length > 0, "src/lib/api/endpoints.ts must define API.adminPluginWorkspaceAccess.");
for (const [name, fragment] of [
  ["workspaces", "/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/workspaces`"],
  ["availability", "/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/availability`"],
  ["overrides", "/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/workspaces/overrides`"],
  ["workspacePlugins", "/assistant/admin/workspaces/${encodeURIComponent(workspaceId)}/plugins`"],
  ["workspaceOverride", "/plugins/${encodeURIComponent(pluginKey)}/override`"],
]) {
  require_(
    new RegExp(`${name}:`).test(block) && block.includes(fragment),
    `API.adminPluginWorkspaceAccess.${name} must build ${fragment.replace(/`$/, "")} — the route the assistant service serves.`,
  );
}

const service = code(read("src/services/admin-plugin-workspaces.service.ts"));
for (const [verb, name] of [
  ["get", "workspaces"],
  ["put", "availability"],
  ["post", "overrides"],
  ["get", "workspacePlugins"],
  ["put", "workspaceOverride"],
]) {
  require_(
    new RegExp(`apiClient\\.${verb}<[^>]+>\\(\\s*API\\.adminPluginWorkspaceAccess\\.${name}\\(`).test(service),
    `admin-plugin-workspaces.service.ts must ${verb.toUpperCase()} API.adminPluginWorkspaceAccess.${name}.`,
  );
}

// 2. Wired into both pages -------------------------------------------------------------------------
const pluginPage = code(read("src/app/(app)/admin/plugins/[pluginKey]/page.tsx"));
require_(
  pluginPage.includes('<TabsTrigger value="workspaces">') && /<PluginWorkspacesTab pluginKey=\{detail\.pluginKey\}/.test(pluginPage),
  "The admin plugin detail page must have a Workspaces tab rendering <PluginWorkspacesTab pluginKey={detail.pluginKey} />.",
);
const workspacePage = code(read("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx"));
require_(
  workspacePage.includes('<TabsTrigger value="plugins">') && /<WorkspacePluginsTab workspaceId=\{workspace\.id\}/.test(workspacePage),
  "The admin workspace page must have a Plugins tab rendering <WorkspacePluginsTab workspaceId={workspace.id} />.",
);

// 3. Every write asks for a reason -----------------------------------------------------------------
const pluginTab = code(read("src/components/admin/plugins/plugin-workspaces-tab.tsx"));
const workspaceTab = code(read("src/components/admin/workspaces/workspace-plugins-tab.tsx"));
const dialog = code(read("src/components/admin/plugins/plugin-override-dialog.tsx"));
for (const [path, source] of [
  ["plugin-workspaces-tab.tsx", pluginTab],
  ["workspace-plugins-tab.tsx", workspaceTab],
]) {
  require_(source.includes("<PluginOverrideDialog"), `${path} must confirm every change through PluginOverrideDialog.`);
}
require_(
  /overrideReasonError\(action, reason\)/.test(dialog) && /if \(reasonError\) return;/.test(dialog),
  "PluginOverrideDialog must refuse to submit a disable without a reason (overrideReasonError) before calling the server.",
);
require_(
  /state\.(?:selected|bulk)|selectedVisible/.test(pluginTab) && pluginTab.includes("bulk.byPlan"),
  "The plugin Workspaces tab must offer bulk apply to a selection and to every workspace on a plan.",
);
require_(
  pluginTab.includes("filterPluginWorkspaceRows") && pluginTab.includes("sortPluginWorkspaceRows"),
  "The plugin Workspaces tab must search/filter/sort through lib/admin/plugin-workspace-access.",
);

// 4. The member, chat and Owner surfaces -----------------------------------------------------------
const assistantTypes = read("src/types/assistant.ts");
require_(
  /export type WorkspacePluginAvailability = [^;]*"platform_disabled"/.test(assistantTypes),
  "WorkspacePluginAvailability must include \"platform_disabled\", the availability the server sends for a plugin turned off here.",
);
const availability = code(read("src/lib/assistant/plugin-availability.ts"));
require_(
  /isOfferedInWorkspaceChat[\s\S]*?"platform_disabled"/.test(availability),
  "isOfferedInWorkspaceChat must not offer a platform_disabled plugin: the server refuses its tools.",
);
const ownerPage = code(read("src/components/assistant/plugins/workspace-plugins-page.tsx"));
const ownerSection = ownerPage.match(/const disabledByPlatformSection[\s\S]*?\) : null;/)?.[0] ?? "";
require_(
  ownerSection.includes("overview?.disabledByPlatform") || ownerPage.includes("overview?.disabledByPlatform"),
  "The Owner's Plugins page must render overview.disabledByPlatform.",
);
require_(
  ownerSection.includes("action={null}"),
  "A plugin the platform turned off must be shown on the Owner's page with no action — it cannot be added.",
);
require_(
  (ownerPage.match(/\{disabledByPlatformSection\}/g) ?? []).length >= 2,
  "The disabled-by-platform section must render in both the empty and the populated Owner page.",
);

// 5. An unknown count is not zero ------------------------------------------------------------------
const listPage = code(read("src/app/(app)/admin/plugins/page.tsx"));
require_(
  /typeof row\.workspaceCount === "number"/.test(listPage),
  "The admin plugin list must render a null workspaceCount as unknown, not \"no workspaces\".",
);

// 6. Copy in every locale --------------------------------------------------------------------------
const flatten = (value, prefix = "") =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key))
    : [prefix];
const locales = ["en", "vi", "ja"];
const messages = Object.fromEntries(
  locales.map((locale) => [
    locale,
    {
      adminPlugins: JSON.parse(read(`messages/${locale}/adminPlugins.json`)),
      adminWorkspaces: JSON.parse(read(`messages/${locale}/adminWorkspaces.json`)),
      workspacePlugins: JSON.parse(read(`messages/${locale}/workspacePlugins.json`)),
      pluginsPage: JSON.parse(read(`messages/${locale}/pluginsPage.json`)),
    },
  ]),
);
const enAccess = flatten(messages.en.adminPlugins.workspaceAccess).sort();
for (const locale of locales) {
  const access = messages[locale].adminPlugins.workspaceAccess;
  require_(access, `messages/${locale}/adminPlugins.json must define workspaceAccess.`);
  if (!access) continue;
  require_(
    JSON.stringify(flatten(access).sort()) === JSON.stringify(enAccess),
    `messages/${locale}/adminPlugins.json workspaceAccess must have exactly the keys en has.`,
  );
  for (const action of ["enable", "disable", "reset"]) {
    for (const part of ["title", "body", "confirm"]) {
      require_(access.dialog?.[action]?.[part], `messages/${locale} adminPlugins.workspaceAccess.dialog.${action}.${part} is missing.`);
    }
  }
  for (const source of ["override", "plan", "optIn", "retired", "inherited"]) {
    require_(access.source?.[source], `messages/${locale} adminPlugins.workspaceAccess.source.${source} is missing.`);
  }
  for (const option of ["available", "opt_in", "retired"]) {
    require_(access.availability?.options?.[option]?.label, `messages/${locale} availability.options.${option}.label is missing.`);
  }
  require_(messages[locale].adminPlugins.detail?.tabs?.workspaces, `messages/${locale} adminPlugins.detail.tabs.workspaces is missing.`);
  require_(messages[locale].adminWorkspaces.detail?.tabs?.plugins, `messages/${locale} adminWorkspaces.detail.tabs.plugins is missing.`);
  require_(messages[locale].workspacePlugins.disabledByPlatform?.row, `messages/${locale} workspacePlugins.disabledByPlatform is missing.`);
  require_(
    messages[locale].pluginsPage.memberAction?.disabledByPlatform,
    `messages/${locale} pluginsPage.memberAction.disabledByPlatform is missing.`,
  );
}

// 7. Optional cross-repo check against the server's DTO --------------------------------------------
const backendRoot = process.env.BACKEND_ROOT ? resolve(process.env.BACKEND_ROOT) : resolve(root, "..", "warptalk-backend");
const dtoPath = join(backendRoot, "assistant/src/WarpTalk.AssistantService.Application/DTOs/PluginWorkspaceAccessDtos.cs");
if (existsSync(dtoPath)) {
  const dto = readFileSync(dtoPath, "utf8");
  const record = dto.match(/public record PluginWorkspaceRowDto\(([\s\S]*?)\);/)?.[1] ?? "";
  const serverFields = [...record.matchAll(/\s(\w+)\s*(?:,|$)/g)].map(([, name]) => name[0].toLowerCase() + name.slice(1));
  const webType = read("src/types/admin-plugin-workspaces.ts").match(/interface AdminPluginWorkspaceRowDto \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const webFields = [...webType.matchAll(/^\s{2}(\w+)\??:/gm)].map(([, name]) => name);
  for (const field of webFields) {
    require_(serverFields.includes(field), `AdminPluginWorkspaceRowDto.${field} is not sent by the server's PluginWorkspaceRowDto.`);
  }
} else {
  console.log(`(skipped the server DTO cross-check: ${dtoPath} not found; set BACKEND_ROOT to run it)`);
}

if (failures.length > 0) {
  console.error("Plugin workspace access contract failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Plugin workspace access contract: PASS");
