#!/usr/bin/env node
/**
 * Guard: the workspace plugin-governance controls (WT-646) keep the distinctions the backend
 * built them on.
 *
 * All four fields live in ONE place — "Section 1: General Workspace Defaults" on
 * /{workspace}/settings — because they are one decision. This check is about the two ways the
 * page can lie about that decision, both of which are silent:
 *
 *  1. NULL COLLAPSED INTO []. `allowedPluginKeys === null` means no allowlist was ever
 *     configured and the answer falls back to `allowAnyPlugins` — the state every workspace
 *     that predates the field is in. `[]` is a configured allowlist that permits nothing. A
 *     `?? []` on the read path loads the first as the second, and because this page auto-saves,
 *     the next unrelated toggle writes that reversal back to the server: every plugin in the
 *     workspace stops answering and nothing on screen says why.
 *
 *  2. AN OWNER-ONLY CONTROL HIDDEN FROM AN ADMIN. WorkspaceService gates
 *     `requirePluginApproval` to the Owner and answers an Admin with 403. Hiding the row leaves
 *     an Admin no way to learn the setting exists; leaving it live gives them a switch that
 *     flicks, toasts and flicks back. It has to render, disabled, with the reason beside it.
 *
 * Source scan rather than a render test, in the style of the other contracts in here: the page
 * is a client component wired to five hooks, and the invariants are all visible in its text.
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

// --- The section stayed a section -------------------------------------------------------
// Not a tab and not a route: the fields belong beside the `allowAnyPlugins` switch they
// qualify. If they ever move, this file is the wrong place to be looking for them.
require_(
  code.includes("allowAnyPlugins") && code.includes("allowedPluginKeys"),
  `${pagePath} must carry allowAnyPlugins and allowedPluginKeys together — the allowlist qualifies the switch, and separating them hides the qualification.`,
);

// --- Null is not an empty allowlist -----------------------------------------------------
require_(
  /allowedPluginKeys:\s*z\.array\(z\.string\(\)\)\.nullable\(\)/.test(code),
  "The allowedPluginKeys form field must be .nullable() — a non-null schema forces 'no allowlist' to be spelled as 'permits nothing'.",
);
require_(
  /allowedPluginKeys:\s*null/.test(code),
  "The form default for allowedPluginKeys must be null — defaulting to [] hands every workspace an allowlist that permits nothing.",
);
require_(
  /allowedPluginKeys:\s*settings\.allowedPluginKeys\s*\?\?\s*null/.test(code),
  "Loading settings must map allowedPluginKeys with `?? null`, so an absent field becomes null and a real [] from the server stays [].",
);
for (const collapse of [
  /watchAll\.allowedPluginKeys\s*\?\?\s*\[\]/,
  /watchAll\.allowedPluginKeys\s*\|\|\s*\[\]/,
  /settings\.allowedPluginKeys\s*\|\|\s*\[\]/,
  /settings\.allowedPluginKeys\s*\?\?\s*\[\]/,
]) {
  require_(
    !collapse.test(code),
    `allowedPluginKeys must not be read through a default of [] (${collapse}) — that is exactly the collapse of "no allowlist" into "permits nothing".`,
  );
}
// Switching enforcement off has to restore null, not leave an empty list behind.
require_(
  /commitTopLevel\("allowedPluginKeys",\s*enforced\s*\?\s*\[\]\s*:\s*null\)/.test(code),
  "Turning the allowlist off must commit null (falling back to allowAnyPlugins), not [] (permitting nothing).",
);

// --- Owner-only, disabled and explained -------------------------------------------------
require_(
  /checked=\{watchAll\.requirePluginApproval\}/.test(code),
  "requirePluginApproval must be rendered as a control on this page, not omitted.",
);
require_(
  /disabled=\{isSubmitting \|\| !isOwner\}/.test(code),
  "The requirePluginApproval control must be disabled for anyone who is not the Owner — the server answers an Admin with 403.",
);
require_(
  /!isOwner \?[\s\S]{0,200}?Only the workspace owner can change this/.test(code),
  "An Admin must be told WHY requirePluginApproval is disabled; a greyed switch with no reason is unexplainable.",
);
// The other two are ordinary Owner-or-Admin settings; owner-gating them in the UI would
// revoke, with no announcement, a permission the server still grants.
for (const field of ["allowedPluginKeys", "allowMemberPluginInstall"]) {
  const row = new RegExp(`${field}[\\s\\S]{0,400}?disabled=\\{isSubmitting \\|\\| !isOwner\\}`);
  require_(
    !row.test(code),
    `${field} is Owner-or-Admin on the server; disabling it for Admins in the UI takes away a permission they actually have.`,
  );
}

// --- A failed catalog must not read as "nothing is permitted" ---------------------------
require_(
  /pluginCatalogQuery\.isError/.test(code),
  "The allowlist must branch on a failed catalog request. Rendering the error as an empty list tells the admin their workspace permits nothing, when the truth is that the catalog did not load.",
);
require_(
  /pluginCatalogQuery\.refetch\(\)/.test(code),
  "The catalog error state must offer a retry — the allowlist is uneditable until the catalog loads.",
);

// --- No hardcoded plugin keys -----------------------------------------------------------
// The catalog is AssistantService's table, and it changes shape: google_workspace became
// google_drive / google_calendar / google_meet. Anything typed here goes stale on that day and
// is unverifiable in the meantime, since the workspace service cannot check keys either.
for (const key of ["google_workspace", "google_drive", "google_calendar", "google_meet", "slack", "notion", "jira"]) {
  require_(
    !code.includes(`"${key}"`) && !code.includes(`'${key}'`),
    `Plugin key "${key}" is hardcoded in ${pagePath}. Keys come from the fetched catalog; a literal here rots the moment the catalog is reorganised.`,
  );
}

assert.deepEqual(failures, [], `Plugin governance settings contract failed:\n  ${failures.join("\n  ")}`);

console.log("Plugin governance settings contract passed.");
