#!/usr/bin/env node
/**
 * Every `test:*` script must actually be run by something.
 *
 * WHY THIS EXISTS
 *   Eight of them were not. `test:auth-hygiene`, `test:api-status`, `test:english-ui`,
 *   `test:currency`, `test:api-errors`, `test:settings-validation`, `test:notification-center`,
 *   `test:room-code` and `test:meeting-day` were all defined in package.json and referenced by no
 *   chain and no workflow — written, committed, and then never executed again. They happened to
 *   pass when this was found, which is the point: nobody would have known if they had not.
 *
 *   That is a worse failure than a red test. A red test stops a merge; a test nobody runs is a
 *   claim of coverage that quietly stopped being true, and the contract scripts in this repo exist
 *   precisely to stop rules from silently drifting.
 *
 * THE RULE
 *   A test script counts as wired if `test:contracts` runs it, or if any GitHub workflow names it.
 *   Adding a script and forgetting the chain now fails here rather than in six months.
 *
 * HOW "test:contracts RUNS IT" IS DECIDED
 *   `test:contracts` used to spell out every suite in one long `npm run … && npm run …` chain, so
 *   this checked for each name inside that string. It now delegates to scripts/run-contracts.mjs,
 *   which DISCOVERS suites from package.json instead — a chain that names nothing would make every
 *   suite in the repo look orphaned here.
 *
 *   So the discovery rule itself is the authority, imported from the one module the runner also
 *   imports. A suite the runner picks up is wired; a suite the runner EXCLUDES still has to be
 *   named by a workflow, which is where `test:routes` is caught.
 *
 * ADDING A DELIBERATE EXCEPTION
 *   Put its name in ALLOWED_UNWIRED below with a comment saying why. There is currently no reason
 *   to, which is the intended state.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverSuites } from "./contract-suites.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Scripts intentionally left out of every chain. Each needs a reason, not just a name. */
const ALLOWED_UNWIRED = new Set([
  // The chain itself, and the aggregate that runs it.
  "test:contracts",
]);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const chain = pkg.scripts["test:contracts"] ?? "";

if (!chain) {
  console.error("FAIL package.json has no test:contracts script to check against.");
  process.exit(1);
}

/** The suites `test:contracts` actually runs, however it is written. */
const runByChain = new Set(discoverSuites(pkg.scripts));

const workflowDir = join(root, ".github", "workflows");
let workflows = "";
try {
  workflows = readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => readFileSync(join(workflowDir, name), "utf8"))
    .join("\n");
} catch {
  // No workflows checked out (a shallow or partial clone). The chain alone is then the only
  // evidence available, which is stricter, not looser — so carry on.
}

/**
 * Matched on a word boundary. A bare `includes("test:api")` would count `test:api-status` as
 * covering `test:api`, which is exactly the kind of near-miss this script is meant to catch.
 */
function isReferenced(haystack, script) {
  return new RegExp(`${script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:-])`).test(haystack);
}

const testScripts = Object.keys(pkg.scripts).filter((name) => name.startsWith("test:"));
const orphans = testScripts.filter(
  (script) =>
    !ALLOWED_UNWIRED.has(script)
    && !runByChain.has(script)
    && !isReferenced(chain, script)
    && !isReferenced(workflows, script),
);

if (orphans.length) {
  console.error(
    `FAIL ${orphans.length} test script(s) are defined but never run:\n  `
    + orphans.join("\n  ")
    + "\n\nAdd them to test:contracts in package.json, or to a workflow. A test nobody runs is not"
    + " coverage.",
  );
  process.exit(1);
}

console.log(`PASS all ${testScripts.length} test scripts are run by test:contracts or a workflow`);
