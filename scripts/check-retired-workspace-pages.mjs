/**
 * Workspace pages taken out of the product on the owner's call (2026-09-23).
 *
 * - "My tasks" is off the main workspace sidebar. Nothing else linked to `/{slug}/tasks`, so the
 *   page is deleted and the address forwards to the workspace home in proxy.ts. Action items are
 *   still produced and read on each meeting's record — that surface is not touched.
 * - The workspace "Audit log" is covered by src/lib/workspace/__tests__/audit-log.test.ts.
 *
 * A retired page that is still linked from somewhere is a dead link; one that is deleted with no
 * forward is a 404 for every bookmark. This pins both halves.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

assert.ok(
  !fs.existsSync(path.join(root, "src/app/(app)/[workspaceSlug]/tasks/page.tsx")),
  "the My tasks page stays deleted",
);

const sidebar = read("src/components/layout/linear-sidebar.tsx");
assert.ok(!/\/tasks`/.test(sidebar), "the workspace sidebar must not link to /tasks");
assert.ok(!sidebar.includes('"nav-tasks"'), "the My tasks nav item (and its tour id) is gone");

// Nothing else in the app may still route there.
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(tsx?|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
for (const file of walk(path.join(root, "src"))) {
  if (file.endsWith(`${path.sep}proxy.ts`)) continue;
  const source = fs.readFileSync(file, "utf8");
  assert.ok(
    !/\$\{[^}]*\}\/tasks[`"'/?]/.test(source),
    `${path.relative(root, file)} still links to the retired /{slug}/tasks page`,
  );
}

const proxy = read("src/proxy.ts");
assert.ok(proxy.includes("\\/tasks\\/?$/.exec(pathname)"), "/{slug}/tasks must forward in proxy.ts");
assert.ok(proxy.includes("`/${retiredTasks[1]}/home`"), "…to the workspace home");
assert.ok(
  proxy.includes("isUsableWorkspaceSlug(retiredTasks[1])")
    && proxy.includes("isUsableWorkspaceSlug(retiredAuditLog[1])"),
  "the forwards apply only to a real workspace slug, never /admin or another reserved prefix",
);

console.log("Retired workspace pages contract: PASS");
