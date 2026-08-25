/**
 * Which `test:*` scripts `test:contracts` runs, and which it deliberately does not.
 *
 * WHY THIS IS ITS OWN FILE
 *   Two scripts need the same answer and must never disagree about it:
 *
 *     run-contracts.mjs           runs the discovered suites
 *     check-test-scripts-wired.mjs  asserts no suite is left unrun
 *
 *   The guard was written against an older `test:contracts` that spelled out every suite in one
 *   long `npm run … && npm run …` chain, so it looked for each name inside that string. Against a
 *   runner that DISCOVERS suites instead, that string names nothing, and the guard would report
 *   every suite in the repo as an orphan — a false alarm loud enough that it would have been
 *   switched off, taking the real check with it.
 *
 *   Both intents survive by sharing this module: suites are still discovered, so adding a test is
 *   still a one-line job with no chain to update, and a suite that nothing runs is still a
 *   failure.
 */

/**
 * Scripts that must not run in the contracts chain, and why. Anything not listed is picked up
 * automatically — an exclusion has to be argued for, which is the point.
 *
 * An entry here is NOT permission to leave a suite unrun: `check-test-scripts-wired.mjs` still
 * demands that anything excluded be named by a GitHub workflow instead.
 */
export const EXCLUDED = {
  // This script.
  "test:contracts": "the runner itself",
  // Needs a built server on :3000. CI gives it its own job after `npm run build`; see the
  // "Production route contracts" step in .github/workflows/ci.yml.
  "test:routes": "requires a running server, runs in the e2e job",
};

/** The `test:*` scripts the contracts chain runs, sorted, given package.json's `scripts` map. */
export function discoverSuites(scripts) {
  return Object.keys(scripts)
    .filter((name) => name.startsWith("test:") && !(name in EXCLUDED))
    .sort();
}
