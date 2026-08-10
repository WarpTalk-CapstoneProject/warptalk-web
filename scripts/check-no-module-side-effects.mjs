import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = await readFile(path.join(root, "src/lib/api/client.ts"), "utf8");

/**
 * The api client must do no work when it is imported.
 *
 * It briefly did: a top-level `if (typeof window !== "undefined") { ... }` that read the auth
 * store to start a refresh timer. That module and the auth store import each other, so at
 * module-evaluation time the store's binding was still in its temporal dead zone — and the
 * production bundle threw "Cannot access 'X' before initialization" on load. The whole app
 * showed "This page couldn't load".
 *
 * Nothing in CI caught it, and nothing could have: a TDZ fault is a runtime error, `tsc` and
 * `next build` both compile it happily, and every contract here reads source rather than
 * running it. This is the one check that can be made statically — the module declares things,
 * and the app calls them from an effect.
 */
assert.doesNotMatch(
  client,
  /^if \(typeof window/m,
  "api/client.ts must not run work at module scope — it and the auth store import each other, so anything executed on import can read a binding that is still in its temporal dead zone.",
);

assert.match(
  client,
  /export function startProactiveRefresh\(\)/,
  "the refresh timer must be startable explicitly, so the app can start it from an effect instead of on import.",
);

const appLayout = await readFile(path.join(root, "src/app/(app)/layout.tsx"), "utf8");
assert.match(
  appLayout,
  /useEffect\(\(\) => \{\s*startProactiveRefresh\(\);/,
  "the app shell must start the refresh timer from an effect — by then every module has finished evaluating, which is the only guarantee that holds.",
);

console.log("Module side-effect contract passed.");
