#!/usr/bin/env node
/**
 * Guard: workspace plugin governance is ONE switch, and an Admin may throw it.
 *
 * WT-646 briefly grew three more controls here — an allowlist of plugin keys, a member-install
 * flag, and an approval flag — and they were cut before release: a workspace owner configures
 * exactly one attribute, whether members may use plugins in this workspace at all. That is
 * `allowAnyPlugins` in "Section 1: General Workspace Defaults" on /{workspace}/settings, and it
 * predates the ticket.
 *
 * What is left to get wrong is the permission on it. The row that was removed was Owner-only
 * (WorkspaceService gates `requirePluginApproval` and answers an Admin with 403) and it sat
 * directly beneath this one, wearing `disabled={isSubmitting || !isOwner}` and an explanatory
 * note. `allowAnyPlugins` is not that field: the server accepts it from an Admin as well as an
 * Owner, so copying the neighbouring gate onto it would revoke, with no announcement and no
 * server change, a permission an Admin actually holds — and a greyed switch reads as a decision
 * somebody made, not as a bug.
 *
 * Source scan rather than a render test, in the style of the other contracts in here: the page
 * is a client component wired to several hooks, and the invariant is visible in its text.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pagePath = "src/app/(app)/[workspaceSlug]/settings/page.tsx";
const page = readFileSync(join(root, pagePath), "utf8");

/** Comments explain the rules; only code should be searched for breaches of them. */
const code = page
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const failures = [];
const require_ = (condition, message) => {
  if (!condition) failures.push(message);
};

// --- The switch is on this page ---------------------------------------------------------
// Not a tab and not a route: it is a general workspace default, and it is the whole of the
// workspace's plugin policy. If it ever moves, this file is the wrong place to be looking.
require_(
  /checked=\{watchAll\.allowAnyPlugins\}/.test(code),
  `${pagePath} must render allowAnyPlugins as a control — it is the only plugin attribute a workspace owner configures.`,
);

// --- Owner OR Admin, never Owner-only ---------------------------------------------------
require_(
  /checked=\{watchAll\.allowAnyPlugins\}[\s\S]{0,300}?disabled=\{isSubmitting \|\| !isOwnerOrAdmin\}/.test(code),
  "The allowAnyPlugins switch must be disabled only by `isSubmitting || !isOwnerOrAdmin` — the server accepts this field from an Admin.",
);
require_(
  !/checked=\{watchAll\.allowAnyPlugins\}[\s\S]{0,300}?disabled=\{isSubmitting \|\| !isOwner\}/.test(code),
  "The allowAnyPlugins switch is Owner-or-Admin on the server; owner-gating it in the UI takes away a permission an Admin actually has.",
);

// --- It stands on its own ---------------------------------------------------------------
// The cut fields qualified this switch, and the row's copy said so ("no longer decides on its
// own"). With them gone that sentence is false, and any of them coming back — via a merge from
// the ticket branch, say — would make it true again without anyone re-reading the row.
for (const cut of ["allowedPluginKeys", "allowMemberPluginInstall", "requirePluginApproval"]) {
  require_(
    !code.includes(cut),
    `${cut} was cut from WT-646: the workspace configures allowAnyPlugins and nothing else. Reinstating it here re-qualifies a switch whose copy says it decides on its own.`,
  );
}

assert.deepEqual(failures, [], `Plugin governance settings contract failed:\n  ${failures.join("\n  ")}`);

console.log("Plugin governance settings contract passed.");
