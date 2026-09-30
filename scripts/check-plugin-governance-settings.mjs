#!/usr/bin/env node
/**
 * Guard: Workspace Settings no longer carries a plugin switch; it points at Workspace → Plugins.
 *
 * WT-646 made workspace plugin governance one switch, `allowAnyPlugins`, on this page. The plugin
 * marketplace (owner decision, 2026-09-17) replaced it: a system admin curates the marketplace, the
 * workspace Owner chooses which of those plugins the workspace has (and may add a private MCP
 * plugin), and a member asks the Owner for the rest. That list lives on
 * /{workspace}/settings/plugins, and this page only links to it.
 *
 * `allowAnyPlugins` is not deleted from the server. It is the transition input: a workspace whose
 * Owner has never edited the list keeps whatever the switch said — every marketplace plugin, or
 * none — until the first edit turns it into an explicit list. Rendering the switch here beside the
 * list would offer a control that silently stops doing anything the moment the Owner uses the new
 * page, which is why it must not come back.
 *
 * Source scan, in the style of the other contracts in here.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pagePath = "src/app/(app)/[workspaceSlug]/settings/page.tsx";
const page = readFileSync(join(root, pagePath), "utf8");

/** Comments explain the rules; only code should be searched for breaches of them. */
const code = page
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const failures = [];
const require_ = (condition, message) => {
  if (!condition) failures.push(message);
};

require_(
  !/checked=\{watchAll\.allowAnyPlugins\}/.test(code) && !code.includes('commitTopLevel("allowAnyPlugins"'),
  `${pagePath} must not render allowAnyPlugins as a control. The workspace's plugin list on /{workspace}/settings/plugins replaced it; the flag is only the server's transition input now.`,
);
require_(
  !code.includes("Allow personal plugins"),
  `${pagePath} must not offer "Allow personal plugins" — that switch was replaced by the workspace plugin list.`,
);
require_(
  code.includes("/settings/plugins`"),
  `${pagePath} must link to the workspace Plugins page, where the Owner chooses the workspace's plugins.`,
);

// The per-plugin fields WT-646 cut stay cut: the marketplace models the list as rows in the
// assistant service, not as workspace settings.
for (const cut of ["allowedPluginKeys", "allowMemberPluginInstall", "requirePluginApproval"]) {
  require_(
    !code.includes(cut),
    `${cut} was cut from WT-646 and must not return as a workspace setting; the workspace plugin list lives in the assistant service.`,
  );
}

assert.deepEqual(failures, [], `Plugin governance settings contract failed:\n  ${failures.join("\n  ")}`);

console.log("Plugin governance settings contract passed.");
