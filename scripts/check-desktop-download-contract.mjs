#!/usr/bin/env node
/**
 * The desktop download page and the links that point at it must ship together.
 *
 * WHAT HAPPENED
 *
 * One commit added the /download page, its release-fetching lib, AND a "Download desktop app"
 * entry in the workspace dropdown. Only the dropdown entry reached `development` — it was
 * re-added by an unrelated ticket about the dropdown menu (WT-318, c39b776), while the page
 * itself stayed on a branch stack that died: its PR was merged into another PR's branch, and
 * that outer PR was closed. So production shipped a menu item pointing at a route that had
 * never existed, and every user who clicked it got the 404 page.
 *
 * The lesson is not "remember to merge". It is that a link and its destination are one change,
 * and nothing in CI noticed they had come apart. This script is that missing check.
 *
 * A second, quieter failure was waiting behind the first: /download is a marketing page for
 * people who do not have an account yet, so it has to be reachable signed out. Without an entry
 * in PUBLIC_ROUTES the session gate answers 307 -> /login, which is a working page and therefore
 * looks fine — the download page would simply never be seen by the visitors it is for.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

/** 1. The destination exists. */
const PAGE = "src/app/download/page.tsx";
if (!read(PAGE)) {
  failures.push(
    `${PAGE} is missing. The workspace dropdown links to /download, so removing the page turns ` +
      `that menu item into a 404 rather than hiding it.`,
  );
}

/** 2. The lib the page reads releases through. */
for (const lib of ["src/lib/desktop-releases.ts", "src/lib/desktop-releases.server.ts"]) {
  if (!read(lib)) failures.push(`${lib} is missing; ${PAGE} imports it.`);
}

/** 3. The page is reachable without a session. */
const proxy = read("src/proxy.ts");
if (!proxy) {
  failures.push("src/proxy.ts is missing; cannot verify /download is public.");
} else {
  const publicBlock = proxy.match(/const PUBLIC_ROUTES\s*=\s*\[([\s\S]*?)\]/);
  if (!publicBlock) {
    failures.push("Could not find PUBLIC_ROUTES in src/proxy.ts.");
  } else if (!/["']\/download["']/.test(publicBlock[1])) {
    failures.push(
      `"/download" is not in PUBLIC_ROUTES. Signed-out visitors — the people the download page ` +
        `exists for — would be redirected to /login instead of reaching it.`,
    );
  }
}

/** 4. The entry point that started all this still points where it says it does. */
const sidebar = read("src/components/layout/linear-sidebar.tsx");
if (!sidebar) {
  failures.push("src/components/layout/linear-sidebar.tsx is missing.");
} else if (!sidebar.includes("/download")) {
  failures.push(
    `The workspace dropdown no longer links to /download. If the entry point was removed on ` +
      `purpose, delete this assertion too — but a download page nothing links to is dead weight.`,
  );
}

if (failures.length > 0) {
  console.error("FAIL desktop download contract\n");
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exit(1);
}

console.log("PASS desktop download page, its lib, its public route and its entry point agree");
