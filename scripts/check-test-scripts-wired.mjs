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
 * THE OTHER HALF OF THE RULE
 *   Checking scripts only closes one end of the pipe. A test FILE that no script names is just as
 *   unrun as a script no chain names, and it is the easier mistake to make: you write the test,
 *   run it by hand, watch it pass, and never add the script. Six such files were found that way —
 *   including `virtual-bridge-check.test.ts`, the test guarding the one invariant that makes the
 *   Windows bridge play into the endpoint it routes to rather than the one the user selects. It
 *   passed. Nothing ran it.
 *
 *   So both directions are checked here: every `test:*` script must be reachable from a chain, and
 *   every `*.test.ts` file under src/ must be named by a `test:*` script.
 *
 * ADDING A DELIBERATE EXCEPTION
 *   Put its name in ALLOWED_UNWIRED below with a comment saying why. There is currently no reason
 *   to, which is the intended state.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Scripts intentionally left out of every chain. Each needs a reason, not just a name. */
const ALLOWED_UNWIRED = new Set([
  // The chain itself, and the aggregate that runs it.
  "test:contracts",
]);

/** Test files intentionally run by nothing. Each needs a reason, not just a path. */
const ALLOWED_UNRUN_FILES = new Set([]);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const chain = pkg.scripts["test:contracts"] ?? "";

if (!chain) {
  console.error("FAIL package.json has no test:contracts script to check against.");
  process.exit(1);
}

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

/**
 * Every test file under src/, as a repo-relative POSIX path.
 *
 * POSIX separators because that is how the paths appear inside the npm scripts these are matched
 * against. On Windows `join` yields backslashes, nothing would ever match, and the check would
 * become an expensive no-op that always passes — the exact failure it exists to catch.
 */
function testFilesUnder(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") testFilesUnder(full, found);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      found.push(full.slice(root.length + 1).split("\\").join("/"));
    }
  }
  return found;
}

const srcDir = join(root, "src");
let testFiles = [];
try {
  statSync(srcDir);
  testFiles = testFilesUnder(srcDir);
} catch {
  // No src/ to walk. Nothing to claim either way.
}

/**
 * A file counts as run if any test script's command line mentions its path. Substring rather than
 * exact-argument matching on purpose: several scripts pass more than one file to one runner, and
 * some chain a contract script before it.
 */
const scriptBodies = testScripts.map((script) => pkg.scripts[script]).join("\n");
const unrunFiles = testFiles.filter(
  (file) => !ALLOWED_UNRUN_FILES.has(file) && !scriptBodies.includes(file),
);

if (unrunFiles.length) {
  console.error(
    `FAIL ${unrunFiles.length} test file(s) are not named by any test:* script:\n  `
    + unrunFiles.join("\n  ")
    + "\n\nGive each one a test:* script and add that script to test:contracts. A test file nobody"
    + " runs passes forever.",
  );
  process.exit(1);
}

console.log(
  `PASS all ${testScripts.length} test scripts are run by test:contracts or a workflow, `
  + `and all ${testFiles.length} test files are named by a script`,
);
