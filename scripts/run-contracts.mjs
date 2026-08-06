/**
 * Runs every contract and unit-test script in package.json.
 *
 * This exists to kill a recurring merge conflict. `test:contracts` used to be a single
 * 1100-character line chaining ~35 `npm run` calls, which meant two branches could not both add
 * a test without colliding on that exact line — git sees the same line edited on both sides and
 * cannot know the two additions should be unioned. Worse, resolving it by hand silently dropped
 * entries: `test:settings-validation` and `test:notification-center` were both written, both
 * passing, and neither was running in CI.
 *
 * Discovery removes the second place a test has to be registered. Adding a `test:*` script to
 * package.json is now the whole job.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const { scripts } = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

/**
 * Scripts that must not run here, and why. Anything not listed is picked up automatically —
 * an exclusion has to be argued for, which is the point.
 */
const EXCLUDED = {
  // This script.
  "test:contracts": "the runner itself",
  // Needs a built server on :3000. CI gives it its own job after `npm run build`; see the
  // "Production route contracts" step in .github/workflows/ci.yml.
  "test:routes": "requires a running server, runs in the e2e job",
};

const suites = Object.keys(scripts)
  .filter((name) => name.startsWith("test:") && !(name in EXCLUDED))
  .sort();

if (suites.length === 0) {
  console.error("No test:* scripts found in package.json — discovery is broken.");
  process.exit(1);
}

const skipped = Object.entries(EXCLUDED).filter(([name]) => name !== "test:contracts");
console.log(`Running ${suites.length} test suites.`);
for (const [name, reason] of skipped) {
  if (name in scripts) console.log(`  skipping ${name} — ${reason}`);
}

const failed = [];
for (const name of suites) {
  console.log(`\n──── ${name} ${"─".repeat(Math.max(0, 60 - name.length))}`);
  const result = spawnSync("npm", ["run", name], {
    cwd: root,
    stdio: "inherit",
    // npm is a .cmd shim on Windows, which execvp cannot launch directly.
    shell: process.platform === "win32",
  });
  if (result.status !== 0) failed.push(name);
}

// Every suite runs even after one fails: a red build should report all of what broke, not just
// whichever alphabetically came first.
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${suites.length} suites failed:`);
  for (const name of failed) console.error(`  ${name}`);
  process.exit(1);
}

console.log(`\nAll ${suites.length} suites passed.`);
