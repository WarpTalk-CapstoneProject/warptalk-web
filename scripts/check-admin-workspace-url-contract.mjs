#!/usr/bin/env node
/**
 * The admin portal's URL names a workspace; it does not carry its primary key (WT-560).
 *
 * Every other workspace URL in the product is `/{workspaceSlug}/…`. The admin portal was the
 * one place putting a database identifier in the address bar, and an address bar is not a
 * private place: it goes into screenshots, browser history, and bug reports — the ticket that
 * reported this pasted a live production UUID into Linear to demonstrate it.
 *
 * Worth being precise about what this is and is not. It is NOT an access-control hole: the
 * portal is gated by `useIsSystemAdmin` and every endpoint behind it carries the system-admin
 * policy, so editing the URL gets a non-admin a 403 either way. It is URL hygiene, and the fix
 * is to match the convention the rest of the product already follows.
 *
 * A slug is safe to address these by because `workspaces.slug` is UNIQUE table-wide and a soft
 * delete leaves the row in place — so a deleted workspace keeps its slug instead of freeing it
 * for a namesake, and the portal is the one surface that has to reach deleted workspaces.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

// ── the route names the workspace ────────────────────────────────────────────

assert.ok(
  exists("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx"),
  "The admin workspace detail route must be [workspaceRef] — it takes the workspace's slug, and an id only so older links keep working.",
);
assert.ok(
  !exists("src/app/(app)/admin/workspaces/[workspaceId]"),
  "The id-only route must not come back: a route named for the id is one that can only ever put an id in the address bar.",
);

const detail = read("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx");
const directory = read("src/app/(app)/admin/workspaces/page.tsx");

// ── the directory never emits an id ──────────────────────────────────────────

assert.match(
  directory,
  /href=\{`\/admin\/workspaces\/\$\{workspace\.slug\}`\}/,
  "The directory has the slug in hand, so it must link straight to the named URL — no id should reach the address bar from here even for a moment.",
);
assert.doesNotMatch(
  directory,
  /href=\{`\/admin\/workspaces\/\$\{workspace\.id\}`\}/,
  "The directory must not link by id.",
);

// ── an id link is swapped for the name ───────────────────────────────────────

// The dashboard, the meetings table and the subscriptions table each link here holding a
// workspaceId and no slug, so the id form has to keep resolving. What it must not do is stay
// in the address bar afterwards.
assert.match(
  detail,
  /workspaceRefKind\(workspaceRef\) !== "id"/,
  "The detail page must recognise an id reference so it can replace it with the slug.",
);
assert.match(
  detail,
  /router\.replace\(`\/admin\/workspaces\/\$\{workspace\.slug\}`\)/,
  "An id reference must be replaced in the address bar by the workspace's slug once it resolves.",
);
// `push` would leave the id form of the page in history — Back would land on it, and it would
// redirect forward again, trapping the admin on the page.
assert.doesNotMatch(
  detail,
  /router\.push\(`\/admin\/workspaces\/\$\{workspace\.slug\}`\)/,
  "The swap must be a replace, not a push: pushing leaves the id URL in history and Back bounces off it.",
);

// ── actions are addressed by the workspace's own id ──────────────────────────

// The URL is no longer an id, so anything that reads one out of the URL is now wrong. This is
// the mistake the rename invites: the lifecycle endpoints take a Guid, and passing them a slug
// gets a 404 on the route constraint — a Suspend button that silently does nothing.
for (const mutation of [
  "useSuspendAdminWorkspace",
  "useReactivateAdminWorkspace",
  "useDeleteAdminWorkspace",
]) {
  assert.match(
    detail,
    new RegExp(`${mutation}\\(workspace\\?\\.id \\?\\? ""\\)`),
    `${mutation} must be given the workspace's own id, never the URL reference — which may be a slug.`,
  );
}

// ── the lookup itself ────────────────────────────────────────────────────────

const hooks = read("src/hooks/use-admin-workspaces.ts");
assert.match(
  hooks,
  /export function useAdminWorkspaceByRef/,
  "One hook must serve both reference kinds. Choosing between two hooks by the shape of a route param changes hook order the moment the param resolves, which React forbids.",
);
assert.match(
  hooks,
  /getDetailBySlug\(ref!\)/,
  "The slug reference must reach the by-slug endpoint.",
);

const endpoints = read("src/lib/api/endpoints.ts");
assert.match(
  endpoints,
  /detailBySlug: \(slug: string\) =>[\s\S]{0,120}by-slug/,
  "The by-slug endpoint must be declared.",
);
// A slug travels in a path segment. It is generated safe, but it arrives from a URL bar.
assert.match(
  endpoints,
  /encodeURIComponent\(slug\)/,
  "The slug must be encoded into the path.",
);

console.log("Admin workspace URL contract: PASS (slug route, no id links, id redirects, actions by id)");
